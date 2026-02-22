import { corsHeaders } from '../_shared/cors.ts';

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

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      console.error('[generate-tips]', requestId, 'missing OPENAI_API_KEY');
      return new Response(JSON.stringify({ error: 'Integração de IA não configurada.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as GenerateTipsInput;
    const payload = {
      hotelName: truncate(body.hotelName),
      location: truncate(body.location),
      checkIn: truncate(body.checkIn, 32),
      checkOut: truncate(body.checkOut, 32),
      tripDestination: truncate(body.tripDestination),
    };

    const promptData = JSON.stringify(payload);

    const aiResponse = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: 'system', content: PROMPT },
          { role: 'user', content: `Dados da hospedagem: ${promptData}` },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      console.error('[generate-tips]', requestId, 'openai_error', aiResponse.status, raw.slice(0, 300));
      return new Response(JSON.stringify({ error: 'Falha ao gerar dicas no momento.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      console.error('[generate-tips]', requestId, 'empty_content');
      return new Response(JSON.stringify({ error: 'Resposta de IA vazia.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch (_err) {
      console.error('[generate-tips]', requestId, 'invalid_json', content.slice(0, 250));
      return new Response(JSON.stringify({ error: 'Formato inválido retornado pela IA.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = sanitizeOutput(parsed);

    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[generate-tips]', requestId, 'unexpected_error', error);
    return new Response(JSON.stringify({ error: 'Erro inesperado ao processar IA.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
