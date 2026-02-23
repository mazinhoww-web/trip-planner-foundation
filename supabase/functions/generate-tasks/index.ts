import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

type GenerateTasksInput = {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userHomeCity?: string | null;
  flights?: Array<{ origem?: string | null; destino?: string | null }>;
  stays?: Array<{ localizacao?: string | null; check_in?: string | null }>;
  existingTasks?: string[];
};

type SuggestedTask = {
  titulo: string;
  categoria: string;
  prioridade: 'baixa' | 'media' | 'alta';
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';
const LIMIT_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `Voce é um assistente de viagem especializado em gerar checklists de tarefas para viajantes.

Com base no destino, datas, cidade de origem e voos do viajante, gere uma lista de tarefas praticas e categorizadas.

CATEGORIAS OBRIGATÓRIAS (use exatamente estes nomes):
- Documentos: passaporte, visto, ESTA, carteira de vacinação, seguro viagem, CNH internacional
- Bagagem: roupas adequadas ao clima, adaptadores, itens de higiene, medicamentos
- Transporte: reservas de transfer, cartões de transporte local, apps necessários
- Saúde: vacinas, medicamentos, seguro saúde
- Financeiro: câmbio, cartões internacionais, notificar banco
- Tecnologia: chip internacional, apps offline, mapas baixados, powerbank
- Legal: cópias de documentos, contatos de emergência, embaixada

REGRAS:
- Brasileiro viajando pela América do Sul: NÃO precisa de passaporte (RG basta) nem visto
- Brasileiro para Europa (Schengen): NÃO precisa de visto para até 90 dias, mas PRECISA de seguro viagem Schengen obrigatório
- Brasileiro para EUA: PRECISA de visto B1/B2 ou ESTA se tiver visto válido
- Brasileiro para Canadá: PRECISA de eTA
- Considere o clima do destino nas datas da viagem para sugerir roupas adequadas
- NÃO duplique tarefas que já existem (lista fornecida)
- Prioridade alta: documentos obrigatórios, vistos, seguro. Media: reservas, câmbio. Baixa: conforto, extras

Responda APENAS JSON válido no formato:
{
  "tasks": [
    {"titulo": "string", "categoria": "string", "prioridade": "baixa|media|alta"}
  ]
}

Gere entre 10 e 25 tarefas relevantes.`;

function truncate(value: string | null | undefined, max = 220) {
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para gerar tarefas.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'generate-tasks', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de geração de tarefas atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = (await req.json()) as GenerateTasksInput;

    const userContent = JSON.stringify({
      destination: truncate(body.destination),
      startDate: truncate(body.startDate, 32),
      endDate: truncate(body.endDate, 32),
      userHomeCity: truncate(body.userHomeCity),
      flights: (body.flights ?? []).slice(0, 10),
      stays: (body.stays ?? []).slice(0, 10),
      existingTasks: (body.existingTasks ?? []).slice(0, 50),
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
        temperature: 0.3,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Contexto da viagem: ${userContent}` },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        return errorResponse(requestId, 'RATE_LIMITED', 'Limite de IA atingido. Tente novamente em alguns minutos.', 429);
      }
      if (res.status === 402) {
        return errorResponse(requestId, 'RATE_LIMITED', 'Créditos de IA esgotados.', 402);
      }
      const text = await res.text();
      console.error('[generate-tasks]', requestId, 'AI error:', res.status, text);
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Erro ao gerar tarefas com IA.', 502);
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || !content.trim()) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou resposta vazia.', 502);
    }

    // Extract JSON
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou formato inválido.', 502);
    }

    let parsed: { tasks?: SuggestedTask[] };
    try {
      parsed = JSON.parse(content.slice(start, end + 1));
    } catch {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'IA retornou JSON inválido.', 502);
    }

    const tasks = (parsed.tasks ?? [])
      .filter((t) => t.titulo && t.categoria)
      .map((t) => ({
        titulo: t.titulo.slice(0, 200),
        categoria: t.categoria.slice(0, 100),
        prioridade: ['baixa', 'media', 'alta'].includes(t.prioridade) ? t.prioridade : 'media',
      }))
      .slice(0, 30);

    console.info('[generate-tasks]', requestId, 'success', { userId: auth.userId, count: tasks.length });

    return successResponse({ tasks });
  } catch (error) {
    console.error('[generate-tasks]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado ao gerar tarefas.', 500);
  }
});
