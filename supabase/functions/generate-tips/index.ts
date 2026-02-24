import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';
import { buildProviderMeta, extractJsonObject, runParallelJsonInference } from '../_shared/ai-providers.ts';
import {
  isFeatureEnabled,
  loadFeatureGateContext,
  resolveAiRateLimit,
  resolveAiTimeout,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';

type GenerateTipsInput = {
  hotelName?: string | null;
  location?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tripDestination?: string | null;
  flightOrigin?: string | null;
  flightDestination?: string | null;
  userHomeCity?: string | null;
};

type GenerateTipsOutput = {
  dica_viagem: string | null;
  como_chegar: string | null;
  atracoes_proximas: string | null;
  restaurantes_proximos: string | null;
  dica_ia: string | null;
};

const PROMPT = `Voce e um assistente de viagem especializado. Com base nos dados da hospedagem e do contexto da viagem, gere informacoes REAIS e UTEIS.

Dados disponiveis nos campos enviados:
- Nome do hotel/hospedagem
- Endereco/localizacao (cidade, bairro, rua)
- Datas de check-in e check-out
- Destino da viagem
- Aeroporto/cidade de origem do viajante (se disponivel)
- Aeroporto/cidade de chegada (se disponivel)
- Cidade onde o viajante mora (se disponivel)

Entregue:

1) dica_viagem: Dica pratica e especifica sobre a estadia. Ex: "O bairro Marais em Paris tem ruas estreitas -- prefira mala de mao rigida. Supermercado Monoprix a 200m na Rue de Rivoli." Nao repita dados obvios como "confirme check-in". Fale sobre o bairro, seguranca, transporte local, supermercados proximos.

2) como_chegar: Rota ESPECIFICA do aeroporto/estacao ate o hotel. Se tiver dados de voo, descreva o trajeto desde o aeroporto de chegada (ex: "Do aeroporto CDG, pegue o RER B ate Chatelet-Les Halles, depois linha 1 do metro ate Hotel de Ville. Alternativa: taxi/Uber ~50 EUR, 45min."). Se o viajante vem de carro, sugira rota e inclua um link Google Maps no formato: https://www.google.com/maps/dir/ORIGEM/DESTINO (substitua espacos por +). Se nao souber o aeroporto, liste as 2-3 opcoes principais de chegada na cidade com rotas de cada uma.

REGRA DE TRANSPORTE CONTEXTUAL:
- Em cidades europeias (Paris, Londres, Roma, Barcelona, Berlim, Amsterdam, etc), Tokyo, NYC, Chicago, Toronto, Buenos Aires: SEMPRE priorize transporte publico. Descreva linhas de metro/trem/onibus especificas do aeroporto ate o hotel com precos aproximados e tempo.
- Em cidades como Miami, Los Angeles, Las Vegas, Orlando, cidades pequenas ou sem metro: sugira locacao de veiculo ou Uber/taxi com estimativa de custo e tempo. Ex: "Miami nao tem bom transporte publico do aeroporto. Uber: ~$25-35 USD, 30min. Considere alugar um carro pela Hertz/Enterprise no aeroporto (~$40-60/dia)."
- SEMPRE inclua link Google Maps: https://www.google.com/maps/dir/AEROPORTO/ENDERECO+DO+HOTEL (substitua espacos por +)
- Se o usuario tem cidade de origem informada, contextualize: "Saindo de Sao Paulo (GRU), voce chegara em CDG. De la..."

3) atracoes_proximas: Liste 3-4 atracoes REAIS com nomes verdadeiros proximo ao hotel. Use nomes de pontos turisticos, museus, parques, pracas que existem de verdade na regiao. Inclua distancia aproximada. Ex: "Musee du Louvre (800m), Place des Vosges (400m), Centre Pompidou (600m)".

4) restaurantes_proximos: Liste 3-4 restaurantes ou tipos de culinaria da REGIAO REAL do hotel. Pode usar nomes de ruas/bairros conhecidos por gastronomia. Ex: "Rue des Rosiers (falafel, 300m), Le Marais cafes na Rue Vieille du Temple, Breizh Cafe (crepes bretones, 500m)". NUNCA invente nomes de restaurantes -- prefira descrever o tipo de culinaria e a rua/bairro.

5) dica_ia: Uma informacao UNICA e util que NAO se encaixa nas categorias acima. Pode ser: clima esperado nas datas da viagem, evento local acontecendo nas datas, dica de seguranca do bairro, costume local importante, app de transporte local recomendado (ex: Citymapper, Moovit), melhor horario para visitar atracoes, dica de economia local. Ex: "Em dezembro Paris tem mercados de Natal nos Champs-Elysees. Baixe o app Citymapper para navegacao em tempo real."

Regras:
- Portugues do Brasil
- Use nomes REAIS de lugares, ruas, estacoes de metro/trem
- Se nao tiver certeza do nome exato, use a regiao/bairro aproximado
- NUNCA invente nomes de restaurantes -- descreva culinaria do bairro
- Inclua distancias aproximadas quando possivel
- Se tiver dados de voo, use o aeroporto REAL de chegada na resposta
- Se possivel, inclua links Google Maps para rotas
- Responda APENAS JSON valido no formato:
{
  "dica_viagem": "string|null",
  "como_chegar": "string|null",
  "atracoes_proximas": "string|null",
  "restaurantes_proximos": "string|null",
  "dica_ia": "string|null"
}`;

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free';
const GEMINI_MODEL = 'gemini-2.0-flash';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const BASE_LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

type TipsCandidate = {
  provider: 'openrouter' | 'gemini' | 'lovable_ai';
  data: GenerateTipsOutput;
  score: number;
};

function truncate(value: string | null | undefined, max = 220) {
  if (!value) return null;
  return value.slice(0, max);
}

function sanitizeOutput(value: unknown): GenerateTipsOutput {
  if (!value || typeof value !== 'object') {
    return { dica_viagem: null, como_chegar: null, atracoes_proximas: null, restaurantes_proximos: null, dica_ia: null };
  }
  const v = value as Record<string, unknown>;
  const getField = (key: keyof GenerateTipsOutput) => {
    const raw = v[key];
    if (typeof raw !== 'string') return null;
    return raw.trim() || null;
  };
  return {
    dica_viagem: getField('dica_viagem'),
    como_chegar: getField('como_chegar'),
    atracoes_proximas: getField('atracoes_proximas'),
    restaurantes_proximos: getField('restaurantes_proximos'),
    dica_ia: getField('dica_ia'),
  };
}

function parseTips(rawText: string): GenerateTipsOutput | null {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;
  const data = sanitizeOutput(parsed);
  const filled = Object.values(data).filter((value) => typeof value === 'string' && value.trim().length > 0).length;
  return filled > 0 ? data : null;
}

function scoreTips(data: GenerateTipsOutput) {
  const values = Object.values(data).filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (values.length === 0) return 0;

  let score = values.length * 22;
  const totalLength = values.reduce((sum, value) => sum + value.length, 0);
  score += Math.min(20, Math.round(totalLength / 60));

  const unique = new Set(values.map((value) => value.toLowerCase()));
  if (values.length > 2 && unique.size <= 1) score -= 20;
  if (values.some((value) => value.toLowerCase().includes('não foi possível') || value.toLowerCase().includes('indisponível'))) score -= 10;
  return score;
}

function pickBestCandidate(candidates: TipsCandidate[]) {
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.provider === 'openrouter') return -1;
    if (b.provider === 'openrouter') return 1;
    return 0;
  });
  return candidates[0] ?? null;
}

async function callLovableTips(userContent: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return { ok: false, data: null as GenerateTipsOutput | null, usage: null as unknown, error: 'LOVABLE_API_KEY not configured' };

  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      temperature: 0.2,
      max_tokens: 700,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const raw = await res.text();
    return { ok: false, data: null as GenerateTipsOutput | null, usage: null as unknown, error: `LovableAI ${res.status}: ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, data: null as GenerateTipsOutput | null, usage: json?.usage as unknown, error: 'LovableAI empty response' };
  }

  const parsed = parseTips(content);
  return { ok: !!parsed, data: parsed, usage: json?.usage as unknown, error: parsed ? null : 'LovableAI invalid JSON payload' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar dicas de IA.', 401);
    }

    const featureContext = await loadFeatureGateContext(auth.userId);
    if (!isFeatureEnabled(featureContext, 'ff_ai_import_enabled')) {
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'Seu plano atual não permite gerar dicas com IA.',
        403,
      );
    }

    const limitPerHour = resolveAiRateLimit(BASE_LIMIT_PER_HOUR, featureContext);
    const timeoutMs = resolveAiTimeout(15_000, featureContext);
    const rate = consumeRateLimit(auth.userId, 'generate-tips', limitPerHour, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de uso de IA atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = (await req.json()) as GenerateTipsInput;
    const payload = {
      hotelName: truncate(body.hotelName),
      location: truncate(body.location),
      checkIn: truncate(body.checkIn, 32),
      checkOut: truncate(body.checkOut, 32),
      tripDestination: truncate(body.tripDestination),
      flightOrigin: truncate(body.flightOrigin),
      flightDestination: truncate(body.flightDestination),
      userHomeCity: truncate(body.userHomeCity),
    };

    const userContent = `Dados da hospedagem: ${JSON.stringify(payload)}`;

    const parallel = await runParallelJsonInference<GenerateTipsOutput>({
      prompt: PROMPT,
      userPayload: userContent,
      openRouterModel: OPENROUTER_MODEL,
      geminiModel: GEMINI_MODEL,
      timeoutMs,
      temperature: 0.2,
      maxTokens: 700,
      parser: parseTips,
    });

    const candidates: TipsCandidate[] = [];

    if (parallel.openrouter.ok && parallel.openrouter.parsed) {
      candidates.push({ provider: 'openrouter', data: parallel.openrouter.parsed, score: scoreTips(parallel.openrouter.parsed) });
    } else {
      console.warn(`[generate-tips] ${requestId} openrouter failed: ${parallel.openrouter.error}`);
    }

    if (parallel.gemini.ok && parallel.gemini.parsed) {
      candidates.push({ provider: 'gemini', data: parallel.gemini.parsed, score: scoreTips(parallel.gemini.parsed) });
    } else {
      console.warn(`[generate-tips] ${requestId} gemini failed: ${parallel.gemini.error}`);
    }

    let selected = pickBestCandidate(candidates);

    if (!selected) {
      const lovable = await callLovableTips(userContent);
      if (lovable.ok && lovable.data) {
        selected = { provider: 'lovable_ai', data: lovable.data, score: scoreTips(lovable.data) };
      } else {
        console.warn(`[generate-tips] ${requestId} lovable_ai failed: ${lovable.error}`);
      }
    }

    if (!selected) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA indisponível no momento para gerar dicas.', 502);
    }

    const providerMeta = buildProviderMeta(selected.provider, {
      openrouter: parallel.openrouter,
      gemini: parallel.gemini,
    });

    if (selected.provider === 'lovable_ai') {
      providerMeta.fallback_used = true;
    }

    console.info('[generate-tips]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      limit_per_hour: limitPerHour,
      provider_meta: providerMeta,
    });

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: 'ff_ai_import_enabled',
      metadata: { operation: 'generate-tips', selected_provider: providerMeta.selected },
    });

    return successResponse({ ...selected.data, provider_meta: providerMeta });
  } catch (error) {
    console.error('[generate-tips]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
