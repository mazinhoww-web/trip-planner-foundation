import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';
import { buildProviderMeta, extractJsonObject, runParallelJsonInference } from '../_shared/ai-providers.ts';

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

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free';
const GEMINI_MODEL = 'gemini-2.0-flash';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const LIMIT_PER_HOUR = 18;
const ONE_HOUR_MS = 60 * 60 * 1000;

type SuggestRestaurantPayload = {
  items: SuggestRestaurantItem[];
};

type RestaurantCandidate = {
  provider: 'openrouter' | 'gemini' | 'lovable_ai';
  payload: SuggestRestaurantPayload;
  score: number;
};

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
      return {
        nome,
        cidade: optional('cidade'),
        tipo: optional('tipo'),
        faixa_preco: optional('faixa_preco'),
        especialidade: optional('especialidade'),
        bairro_regiao: optional('bairro_regiao'),
      } as SuggestRestaurantItem;
    })
    .filter((entry): entry is SuggestRestaurantItem => entry !== null)
    .slice(0, 6);
}

function parseRestaurants(rawText: string): SuggestRestaurantPayload | null {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;
  const items = sanitizeItems(parsed);
  if (items.length === 0) return null;
  return { items };
}

function scoreRestaurants(payload: SuggestRestaurantPayload) {
  const items = payload.items;
  if (items.length === 0) return 0;

  let score = items.length * 18;

  const uniqueNames = new Set(items.map((item) => item.nome.toLowerCase()));
  score += Math.min(20, uniqueNames.size * 4);

  const uniqueTypes = new Set(items.map((item) => (item.tipo ?? '').toLowerCase()).filter(Boolean));
  score += Math.min(18, uniqueTypes.size * 6);

  const uniquePrices = new Set(items.map((item) => (item.faixa_preco ?? '').toLowerCase()).filter(Boolean));
  score += Math.min(12, uniquePrices.size * 4);

  const withNeighborhood = items.filter((item) => !!item.bairro_regiao).length;
  score += Math.min(12, withNeighborhood * 3);

  if (uniqueNames.size < items.length) score -= 15;
  if (items.length < 3) score -= 10;

  return score;
}

function pickBestCandidate(candidates: RestaurantCandidate[]) {
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.provider === 'openrouter') return -1;
    if (b.provider === 'openrouter') return 1;
    return 0;
  });
  return candidates[0] ?? null;
}

async function callLovableRestaurants(userContent: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      payload: null as SuggestRestaurantPayload | null,
      usage: null as unknown,
      error: 'LOVABLE_API_KEY not configured',
    };
  }

  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      temperature: 0.3,
      max_tokens: 650,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return {
      ok: false,
      payload: null as SuggestRestaurantPayload | null,
      usage: null as unknown,
      error: `LovableAI ${res.status}: ${raw.slice(0, 120)}`,
    };
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return {
      ok: false,
      payload: null as SuggestRestaurantPayload | null,
      usage: json?.usage as unknown,
      error: 'LovableAI empty response',
    };
  }

  const parsed = parseRestaurants(content);
  return {
    ok: !!parsed,
    payload: parsed,
    usage: json?.usage as unknown,
    error: parsed ? null : 'LovableAI invalid JSON payload',
  };
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

    const parallel = await runParallelJsonInference<SuggestRestaurantPayload>({
      prompt: PROMPT,
      userPayload: userContent,
      openRouterModel: OPENROUTER_MODEL,
      geminiModel: GEMINI_MODEL,
      timeoutMs: 15_000,
      temperature: 0.3,
      maxTokens: 650,
      parser: parseRestaurants,
    });

    const candidates: RestaurantCandidate[] = [];

    if (parallel.openrouter.ok && parallel.openrouter.parsed) {
      candidates.push({
        provider: 'openrouter',
        payload: parallel.openrouter.parsed,
        score: scoreRestaurants(parallel.openrouter.parsed),
      });
    } else {
      console.warn(`[suggest-restaurants] ${requestId} openrouter failed: ${parallel.openrouter.error}`);
    }

    if (parallel.gemini.ok && parallel.gemini.parsed) {
      candidates.push({
        provider: 'gemini',
        payload: parallel.gemini.parsed,
        score: scoreRestaurants(parallel.gemini.parsed),
      });
    } else {
      console.warn(`[suggest-restaurants] ${requestId} gemini failed: ${parallel.gemini.error}`);
    }

    let selected = pickBestCandidate(candidates);

    if (!selected) {
      const lovable = await callLovableRestaurants(userContent);
      if (lovable.ok && lovable.payload) {
        selected = {
          provider: 'lovable_ai',
          payload: lovable.payload,
          score: scoreRestaurants(lovable.payload),
        };
      } else {
        console.warn(`[suggest-restaurants] ${requestId} lovable_ai failed: ${lovable.error}`);
      }
    }

    if (!selected) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA indisponível no momento para sugerir restaurantes.', 502);
    }

    const providerMeta = buildProviderMeta(selected.provider, {
      openrouter: parallel.openrouter,
      gemini: parallel.gemini,
    });

    if (selected.provider === 'lovable_ai') {
      providerMeta.fallback_used = true;
    }

    console.info('[suggest-restaurants]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      count: selected.payload.items.length,
      provider_meta: providerMeta,
    });

    return successResponse({ items: selected.payload.items, provider_meta: providerMeta });
  } catch (error) {
    console.error('[suggest-restaurants]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
