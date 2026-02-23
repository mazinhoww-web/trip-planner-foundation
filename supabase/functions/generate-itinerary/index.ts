import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type GenerateItineraryInput = {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userHomeCity?: string | null;
  stays?: Array<{
    nome?: string | null;
    localizacao?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    atracoes_proximas?: string | null;
    restaurantes_proximos?: string | null;
    dica_viagem?: string | null;
  }>;
  flights?: Array<{ origem?: string | null; destino?: string | null; data?: string | null }>;
  transports?: Array<{ tipo?: string | null; origem?: string | null; destino?: string | null; data?: string | null }>;
  restaurants?: Array<{ nome?: string | null; cidade?: string | null; tipo?: string | null }>;
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

const SYSTEM_PROMPT = `Voce é um assistente de viagem que cria roteiros dia-a-dia detalhados e REALISTAS baseados em TODOS os dados fornecidos.

DADOS DISPONÍVEIS:
- Destino, datas de início e fim da viagem
- Hospedagens com nome, localização, check-in, check-out, atrações próximas, restaurantes próximos e dicas
- Voos com origem, destino e data/hora
- Transportes terrestres/marítimos com tipo, origem, destino e data/hora
- Restaurantes já salvos pelo usuário (nome, cidade, tipo)

REGRAS CRÍTICAS DE HORÁRIO:
1. No dia de CHEGADA de um voo, as atividades só começam DEPOIS do horário de chegada + 1h (deslocamento aeroporto→hotel). Exemplo: voo chega às 14h → primeira atividade às 15h.
2. No dia de PARTIDA de um voo, as atividades terminam ANTES do horário do voo - 3h (deslocamento hotel→aeroporto + check-in). Exemplo: voo às 20h → última atividade termina às 17h.
3. Quando houver troca de cidade (check-out de uma hospedagem + check-in de outra no mesmo dia ou dia seguinte), inclua uma atividade de "Deslocamento [Cidade A] → [Cidade B]" com categoria "transporte" e horário estimado.

REGRAS DE HOSPEDAGEM:
4. Distribua atrações e restaurantes próximos de cada hospedagem SOMENTE nos dias em que o viajante está hospedado ali (entre check_in e check_out).
5. No dia do check-in, inclua atividade "Check-in [Nome do Hotel]" com horário estimado.
6. No dia do check-out, inclua atividade "Check-out [Nome do Hotel]" como primeira atividade do dia.

REGRAS DE GASTRONOMIA:
7. Se o usuário tem restaurantes salvos, use-os como sugestões PRIORITÁRIAS para almoço/jantar nos dias em que está na mesma cidade.
8. Inclua o nome exato do restaurante salvo e sua cidade no título.
9. Complete com sugestões próprias apenas se não houver restaurantes salvos suficientes para cobrir todas as refeições.

REGRAS DE DICAS:
10. Use as dicas de viagem (dica_viagem) e atrações próximas (atracoes_proximas) das hospedagens como BASE principal para atividades turísticas.
11. ADICIONE atrações "imperdíveis" do destino mesmo que estejam mais longe.

REGRAS GERAIS:
- Organize por dia (YYYY-MM-DD) com atividades em ordem cronológica
- Cada atividade tem: titulo, descricao curta, horario_sugerido (formato "09:00"), categoria, localizacao, link_maps
- Categorias: "atracoes", "restaurante", "transporte", "livre", "compras"
- Considere tempo de deslocamento entre pontos
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
        nome: truncate(s.nome, 100),
        localizacao: truncate(s.localizacao),
        check_in: truncate(s.check_in, 32),
        check_out: truncate(s.check_out, 32),
        atracoes_proximas: truncate(s.atracoes_proximas, 500),
        restaurantes_proximos: truncate(s.restaurantes_proximos, 500),
        dica_viagem: truncate(s.dica_viagem),
      })),
      flights: (body.flights ?? []).slice(0, 10).map((f) => ({
        origem: truncate(f.origem, 100),
        destino: truncate(f.destino, 100),
        data: truncate(f.data, 32),
      })),
      transports: (body.transports ?? []).slice(0, 10).map((t) => ({
        tipo: truncate(t.tipo, 50),
        origem: truncate(t.origem, 100),
        destino: truncate(t.destino, 100),
        data: truncate(t.data, 32),
      })),
      restaurants: (body.restaurants ?? []).slice(0, 20).map((r) => ({
        nome: truncate(r.nome, 100),
        cidade: truncate(r.cidade, 100),
        tipo: truncate(r.tipo, 50),
      })),
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
        max_tokens: 6000,
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
