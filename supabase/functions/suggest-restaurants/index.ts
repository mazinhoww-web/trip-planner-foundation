import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type SuggestRestaurantsInput = {
  city?: string | null;
  location?: string | null;
  tripDestination?: string | null;
};

type SuggestRestaurantItem = {
  nome: string;
  cidade: string | null;
  tipo: string | null;
  faixa_preco: string | null;
  especialidade: string | null;
  bairro_regiao: string | null;
};

const PROMPT = `Sugira de 5 a 6 restaurantes plausiveis para a cidade informada.

Regras:
1) variar cozinha e faixa de preco
2) evitar repeticoes
3) quando endereco exato for incerto, usar bairro/regiao
4) descrever especialidade de cada lugar
5) retornar em formato estruturado

Responda APENAS JSON no formato:
{
  "items": [
    {
      "nome": "string",
      "cidade": "string|null",
      "tipo": "string|null",
      "faixa_preco": "string|null",
      "especialidade": "string|null",
      "bairro_regiao": "string|null"
    }
  ]
}`;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const ARCEE_MODEL = 'arcee-ai/trinity-large-preview:free';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const LIMIT_PER_HOUR = 18;
const ONE_HOUR_MS = 60 * 60 * 1000;

function openRouterApiKey() {
  return Deno.env.get('open_router_key') ?? Deno.env.get('OPENROUTER_API_KEY');
}

function geminiApiKey() {
  return Deno.env.get('gemini_api_key') ?? Deno.env.get('GEMINI_API_KEY');
}

function truncate(value: string | null | undefined, max = 180) {
  if (!value) return null;
  return value.slice(0, max);
}

function sanitizeItems(raw: unknown): SuggestRestaurantItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const nome = typeof e.nome === 'string' ? e.nome.trim() : '';
      if (!nome) return null;
      const optional = (key: string) => {
        const value = e[key];
        if (typeof value !== 'string') return null;
        return value.trim() || null;
      };
      return { nome, cidade: optional('cidade'), tipo: optional('tipo'), faixa_preco: optional('faixa_preco'), especialidade: optional('especialidade'), bairro_regiao: optional('bairro_regiao') } as SuggestRestaurantItem;
    })
    .filter((entry): entry is SuggestRestaurantItem => entry !== null)
    .slice(0, 6);
}

function extractJson(content: string) {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>; } catch { return null; }
}

// ─── AI Provider Calls ───────────────────────────────────────────

async function callArcee(userContent: string): Promise<string> {
  const apiKey = openRouterApiKey();
  if (!apiKey) throw new Error('OpenRouter API key not configured');
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
      'X-Title': 'Trip Planner Foundation',
    },
    body: JSON.stringify({
      model: ARCEE_MODEL, temperature: 0.3, max_tokens: 650,
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
  const apiKey = geminiApiKey();
  if (!apiKey) throw new Error('Gemini API key not configured');
  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${PROMPT}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 650 },
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
      model: LOVABLE_MODEL, temperature: 0.3, max_tokens: 650,
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
      console.warn(`[suggest-restaurants] ${requestId} ${name} failed:`, (err as Error).message);
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar sugestões de IA.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'suggest-restaurants', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de sugestões atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = (await req.json()) as SuggestRestaurantsInput;
    const target = truncate(body.city) ?? truncate(body.location) ?? truncate(body.tripDestination);

    if (!target) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Cidade/localização é obrigatória para sugerir restaurantes.', 400);
    }

    const userContent = `Cidade/Região: ${target}`;
    const { content, provider } = await callWithFallback(userContent, requestId);

    const parsed = extractJson(content);
    if (!parsed) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    const items = sanitizeItems(parsed);
    console.info('[suggest-restaurants]', requestId, 'success', { userId: auth.userId, remaining: rate.remaining, provider, count: items.length });

    return successResponse({ items });
  } catch (error) {
    console.error('[suggest-restaurants]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
