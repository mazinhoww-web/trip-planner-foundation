import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type GenerateTipsInput = {
  hotelName?: string | null;
  location?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tripDestination?: string | null;
};

type GenerateTipsOutput = {
  dica_viagem: string | null;
  como_chegar: string | null;
  atracoes_proximas: string | null;
  restaurantes_proximos: string | null;
  dica_ia: string | null;
};

const PROMPT = `Gere dicas para estadia no hotel informado.

Entregue:
1) dica principal da estadia
2) como chegar ao hotel desde aeroporto/estacao mais proxima
3) 3 ou 4 atracoes proximas
4) 3 ou 4 restaurantes proximos
5) uma dica especial local

Regras:
- portugues do Brasil
- sem inventar precisao exagerada quando houver duvida
- se nao tiver confianca, prefira bairro/regiao aproximada
- responda APENAS JSON no formato:
{
  "dica_viagem": "string|null",
  "como_chegar": "string|null",
  "atracoes_proximas": "string|null",
  "restaurantes_proximos": "string|null",
  "dica_ia": "string|null"
}`;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'arcee-ai/trinity-large-preview:free';
const LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

function truncate(value: string | null | undefined, max = 220) {
  if (!value) return null;
  return value.slice(0, max);
}

function sanitizeOutput(value: unknown): GenerateTipsOutput {
  if (!value || typeof value !== 'object') {
    return {
      dica_viagem: null,
      como_chegar: null,
      atracoes_proximas: null,
      restaurantes_proximos: null,
      dica_ia: null,
    };
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
  const maybe = content.slice(start, end + 1);
  try {
    return JSON.parse(maybe) as Record<string, unknown>;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      console.error('[generate-tips]', requestId, 'unauthorized', auth.error);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar dicas de IA.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'generate-tips', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      console.error('[generate-tips]', requestId, 'rate_limited', { userId: auth.userId });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de uso de IA atingido. Tente novamente mais tarde.', 429, {
        resetAt: rate.resetAt,
      });
    }

    const apiKey = Deno.env.get('OPENROUTER_API_KEY') ?? Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[generate-tips]', requestId, 'missing_OPENROUTER_API_KEY');
      return errorResponse(requestId, 'MISCONFIGURED', 'Integração de IA não configurada.', 500);
    }

    const body = (await req.json()) as GenerateTipsInput;
    const payload = {
      hotelName: truncate(body.hotelName),
      location: truncate(body.location),
      checkIn: truncate(body.checkIn, 32),
      checkOut: truncate(body.checkOut, 32),
      tripDestination: truncate(body.tripDestination),
    };

    const aiResponse = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
        'X-Title': 'Trip Planner Foundation',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Dados da hospedagem: ${JSON.stringify(payload)}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      console.error('[generate-tips]', requestId, 'openrouter_error', aiResponse.status, raw.slice(0, 240));
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha ao gerar dicas no momento.', 502);
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    const usage = aiJson?.usage ?? null;

    if (typeof content !== 'string' || !content.trim()) {
      console.error('[generate-tips]', requestId, 'empty_content');
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou conteúdo vazio.', 502);
    }

    const parsed = extractJson(content);
    if (!parsed) {
      console.error('[generate-tips]', requestId, 'invalid_json');
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    const data = sanitizeOutput(parsed);
    console.info('[generate-tips]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      usage,
    });

    return successResponse(data);
  } catch (error) {
    console.error('[generate-tips]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
