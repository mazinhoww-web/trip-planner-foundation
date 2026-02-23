import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type GenerateTipsInput = {
  hotelName?: string | null;
  location?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tripDestination?: string | null;
  flightOrigin?: string | null;
  flightDestination?: string | null;
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

Entregue:

1) dica_viagem: Dica pratica e especifica sobre a estadia. Ex: "O bairro Marais em Paris tem ruas estreitas -- prefira mala de mao rigida. Supermercado Monoprix a 200m na Rue de Rivoli." Nao repita dados obvios como "confirme check-in". Fale sobre o bairro, seguranca, transporte local, supermercados proximos.

2) como_chegar: Rota ESPECIFICA do aeroporto/estacao ate o hotel. Se tiver dados de voo, descreva o trajeto desde o aeroporto de chegada (ex: "Do aeroporto CDG, pegue o RER B ate Chatelet-Les Halles, depois linha 1 do metro ate Hotel de Ville. Alternativa: taxi/Uber ~50 EUR, 45min."). Se o viajante vem de carro, sugira rota e inclua um link Google Maps no formato: https://www.google.com/maps/dir/ORIGEM/DESTINO (substitua espacos por +). Se nao souber o aeroporto, liste as 2-3 opcoes principais de chegada na cidade com rotas de cada uma.

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

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const ARCEE_MODEL = 'arcee-ai/trinity-large-preview:free';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

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

function extractJson(content: string) {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

// ─── AI Provider Calls ───────────────────────────────────────────

async function callArcee(userContent: string): Promise<string> {
  const apiKey = Deno.env.get('open_router_key');
  if (!apiKey) throw new Error('open_router_key not configured');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
      'X-Title': 'Trip Planner Foundation',
    },
    body: JSON.stringify({
      model: ARCEE_MODEL, temperature: 0.2, max_tokens: 700,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`Arcee ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Arcee empty');
  return content;
}

async function callGemini(userContent: string): Promise<string> {
  const apiKey = Deno.env.get('gemini_api_key');
  if (!apiKey) throw new Error('gemini_api_key not configured');
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Gemini empty');
  return content;
}

async function callLovableAi(userContent: string): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOVABLE_MODEL, temperature: 0.2, max_tokens: 700,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) throw new Error(`LovableAI ${res.status}`);
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('LovableAI empty');
  return content;
}

async function callWithFallback(userContent: string, requestId: string): Promise<{ content: string; provider: string }> {
  const providers = [
    { fn: () => callArcee(userContent), name: 'arcee' },
    { fn: () => callGemini(userContent), name: 'gemini' },
    { fn: () => callLovableAi(userContent), name: 'lovable_ai' },
  ];
  for (const { fn, name } of providers) {
    try {
      const content = await fn();
      return { content, provider: name };
    } catch (err) {
      console.warn(`[generate-tips] ${requestId} ${name} failed:`, (err as Error).message);
    }
  }
  throw new Error('All AI providers failed');
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

    const rate = consumeRateLimit(auth.userId, 'generate-tips', LIMIT_PER_HOUR, ONE_HOUR_MS);
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
    };

    const userContent = `Dados da hospedagem: ${JSON.stringify(payload)}`;
    const { content, provider } = await callWithFallback(userContent, requestId);

    const parsed = extractJson(content);
    if (!parsed) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    const data = sanitizeOutput(parsed);
    console.info('[generate-tips]', requestId, 'success', { userId: auth.userId, remaining: rate.remaining, provider });

    return successResponse(data);
  } catch (error) {
    console.error('[generate-tips]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
