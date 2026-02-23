import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type GenerateItineraryInput = {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userHomeCity?: string | null;
  stays?: Array<{
    localizacao?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    atracoes_proximas?: string | null;
    restaurantes_proximos?: string | null;
    dica_viagem?: string | null;
  }>;
  flights?: Array<{ origem?: string | null; destino?: string | null; data?: string | null }>;
};

type ItineraryItem = {
  dia: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  horario_sugerido: string | null;
  categoria: string;
  localizacao: string | null;
  link_maps: string | null;
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const LIMIT_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `Voce é um assistente de viagem que cria roteiros dia-a-dia detalhados.

Com base no destino, datas, hospedagens e dicas já geradas, crie um itinerário prático por dia.

REGRAS:
- Organize por dia (YYYY-MM-DD) com atividades em ordem cronológica
- Cada atividade tem: titulo, descricao curta, horario_sugerido (formato "09:00"), categoria, localizacao, link_maps
- Categorias: "atracoes", "restaurante", "transporte", "livre", "compras"
- Use as atrações e restaurantes já mencionados nas dicas das hospedagens como BASE
- ADICIONE atrações "imperdíveis" do destino mesmo que estejam mais longe (Torre Eiffel em Paris, Coliseu em Roma, etc)
- Considere tempo de deslocamento entre pontos
- Inclua pausas para almoço e jantar com sugestões de tipo de culinária/região
- Manhã (09:00-12:00): atrações. Almoço (12:30-14:00). Tarde (14:30-18:00): atrações/compras. Noite (19:00-22:00): jantar/passeio noturno
- link_maps no formato: https://www.google.com/maps/search/NOME+DO+LUGAR+CIDADE (substitua espaços por +)
- Gere atividades para TODOS os dias entre startDate e endDate

Responda APENAS JSON válido no formato:
{
  "items": [
    {
      "dia": "2026-01-15",
      "ordem": 1,
      "titulo": "string",
      "descricao": "string|null",
      "horario_sugerido": "09:00",
      "categoria": "atracoes|restaurante|transporte|livre|compras",
      "localizacao": "string|null",
      "link_maps": "string|null"
    }
  ]
}`;

function truncate(value: string | null | undefined, max = 300) {
  if (!value) return null;
  return value.slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para gerar roteiro.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'generate-itinerary', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de geração de roteiro atingido.', 429, { resetAt: rate.resetAt });
    }

    const body = (await req.json()) as GenerateItineraryInput;

    const userContent = JSON.stringify({
      destination: truncate(body.destination),
      startDate: truncate(body.startDate, 32),
      endDate: truncate(body.endDate, 32),
      userHomeCity: truncate(body.userHomeCity),
      stays: (body.stays ?? []).slice(0, 10).map((s) => ({
        localizacao: truncate(s.localizacao),
        check_in: truncate(s.check_in, 32),
        check_out: truncate(s.check_out, 32),
        atracoes_proximas: truncate(s.atracoes_proximas, 500),
        restaurantes_proximos: truncate(s.restaurantes_proximos, 500),
        dica_viagem: truncate(s.dica_viagem),
      })),
      flights: (body.flights ?? []).slice(0, 10),
    });

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!apiKey) {
      return errorResponse(requestId, 'MISCONFIGURED', 'LOVABLE_API_KEY não configurada.', 500);
    }

    const res = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        temperature: 0.4,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Contexto da viagem: ${userContent}` },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        return errorResponse(requestId, 'RATE_LIMITED', 'Limite de IA atingido.', 429);
      }
      if (res.status === 402) {
        return errorResponse(requestId, 'RATE_LIMITED', 'Créditos de IA esgotados.', 402);
      }
      const text = await res.text();
      console.error('[generate-itinerary]', requestId, 'AI error:', res.status, text);
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Erro ao gerar roteiro com IA.', 502);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou resposta vazia.', 502);
    }

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    let parsed: { items?: ItineraryItem[] };
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou JSON inválido.', 502);
    }

    const items = (parsed.items ?? [])
      .filter((i) => i.dia && i.titulo)
      .map((i, idx) => ({
        dia: i.dia,
        ordem: i.ordem ?? idx,
        titulo: i.titulo.slice(0, 200),
        descricao: i.descricao?.slice(0, 500) ?? null,
        horario_sugerido: i.horario_sugerido ?? null,
        categoria: ['atracoes', 'restaurante', 'transporte', 'livre', 'compras'].includes(i.categoria) ? i.categoria : 'atracoes',
        localizacao: i.localizacao ?? null,
        link_maps: i.link_maps ?? null,
      }))
      .slice(0, 100);

    console.info('[generate-itinerary]', requestId, 'success', { userId: auth.userId, count: items.length });

    return successResponse({ items });
  } catch (error) {
    console.error('[generate-itinerary]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao gerar roteiro.', 500);
  }
});
