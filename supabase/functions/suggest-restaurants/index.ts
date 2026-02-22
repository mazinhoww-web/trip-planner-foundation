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

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const LIMIT_PER_HOUR = 18;
const ONE_HOUR_MS = 60 * 60 * 1000;

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
      console.error('[suggest-restaurants]', requestId, 'unauthorized', auth.error);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar sugestões de IA.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'suggest-restaurants', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      console.error('[suggest-restaurants]', requestId, 'rate_limited', { userId: auth.userId });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de sugestões atingido. Tente novamente mais tarde.', 429, {
        resetAt: rate.resetAt,
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[suggest-restaurants]', requestId, 'missing_OPENAI_API_KEY');
      return errorResponse(requestId, 'MISCONFIGURED', 'Integração de IA não configurada.', 500);
    }

    const body = (await req.json()) as SuggestRestaurantsInput;
    const target = truncate(body.city) ?? truncate(body.location) ?? truncate(body.tripDestination);

    if (!target) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Cidade/localização é obrigatória para sugerir restaurantes.', 400);
    }

    const aiResponse = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 650,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Cidade/Região: ${target}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      console.error('[suggest-restaurants]', requestId, 'openai_error', aiResponse.status, raw.slice(0, 240));
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha ao sugerir restaurantes no momento.', 502);
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    const usage = aiJson?.usage ?? null;

    if (typeof content !== 'string' || !content.trim()) {
      console.error('[suggest-restaurants]', requestId, 'empty_content');
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou conteúdo vazio.', 502);
    }

    const parsed = extractJson(content);
    if (!parsed) {
      console.error('[suggest-restaurants]', requestId, 'invalid_json');
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    const items = sanitizeItems(parsed);
    console.info('[suggest-restaurants]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      usage,
      count: items.length,
    });

    return successResponse({ items });
  } catch (error) {
    console.error('[suggest-restaurants]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao processar IA.', 500);
  }
});
