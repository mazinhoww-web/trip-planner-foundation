import { corsHeaders } from '../_shared/cors.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[suggest-restaurants]', requestId, 'missing OPENAI_API_KEY');
      return new Response(JSON.stringify({ error: 'Integração de IA não configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as SuggestRestaurantsInput;
    const target = truncate(body.city) ?? truncate(body.location) ?? truncate(body.tripDestination);

    if (!target) {
      return new Response(JSON.stringify({ error: 'Cidade/localização não informada para sugestão.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Cidade/Região: ${target}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      console.error('[suggest-restaurants]', requestId, 'openai_error', aiResponse.status, raw.slice(0, 300));
      return new Response(JSON.stringify({ error: 'Falha ao sugerir restaurantes no momento.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      console.error('[suggest-restaurants]', requestId, 'empty_content');
      return new Response(JSON.stringify({ error: 'Resposta de IA vazia.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch (_err) {
      console.error('[suggest-restaurants]', requestId, 'invalid_json', content.slice(0, 250));
      return new Response(JSON.stringify({ error: 'Formato inválido retornado pela IA.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const items = sanitizeItems(parsed);

    return new Response(JSON.stringify({ data: { items } }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[suggest-restaurants]', requestId, 'unexpected_error', error);
    return new Response(JSON.stringify({ error: 'Erro inesperado ao processar IA.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
