import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';
import { buildProviderMeta, extractJsonObject, runParallelJsonInference } from '../_shared/ai-providers.ts';
import {
  isFeatureEnabled,
  loadFeatureGateContext,
  resolveAiRateLimit,
  resolveAiTimeout,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';

type RequestBody = {
  viagemId?: unknown;
  message?: unknown;
  recentMessages?: unknown;
};

type ChatRole = 'user' | 'assistant';

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type TripAssistantOutput = {
  answer: string;
  quickActions: string[];
  priority: 'low' | 'medium' | 'high';
};

const OPENROUTER_MODEL = 'arcee-ai/trinity-large-preview:free';
const GEMINI_MODEL = 'gemini-2.0-flash';
const BASE_LIMIT_PER_HOUR = 30;
const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_RECENT_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 1200;
const VALID_TABS = new Set([
  'visao',
  'voos',
  'hospedagens',
  'transportes',
  'tarefas',
  'roteiro',
  'despesas',
  'orcamento',
  'gastronomia',
  'apoio',
]);

const PROMPT = `Você é o assistente do Trip Planner. Responda em português (Brasil), de forma objetiva e acionável.

REGRAS:
- Use SOMENTE os dados de viagem recebidos no payload.
- Se dados estiverem faltando, diga explicitamente o que falta.
- Nunca invente reservas ou valores.
- Traga recomendações práticas e curtas.
- Retorne APENAS JSON válido no formato:
{
  "answer": "texto curto, 2 a 6 frases",
  "quickActions": ["visao","voos","hospedagens","transportes","tarefas","roteiro","despesas","orcamento","gastronomia","apoio"],
  "priority": "low|medium|high"
}

Critérios de prioridade:
- high: risco imediato (conflito de datas, transporte/hospedagem faltando, pendência crítica).
- medium: ajustes importantes mas não bloqueadores.
- low: orientação geral ou otimização.`;

function createAuthedClient(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeMessage(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  return value.slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeRecentMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const role = (item as Record<string, unknown>).role;
      const content = normalizeMessage((item as Record<string, unknown>).content);
      if ((role !== 'user' && role !== 'assistant') || !content) return null;
      return { role, content } as ChatMessage;
    })
    .filter((item): item is ChatMessage => !!item)
    .slice(-MAX_RECENT_MESSAGES);
}

function normalizeOutput(raw: unknown): TripAssistantOutput | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const answer = normalizeMessage(record.answer);
  const quickActionsRaw = Array.isArray(record.quickActions) ? record.quickActions : [];
  const quickActions = quickActionsRaw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => VALID_TABS.has(item));
  const priority = record.priority === 'high' || record.priority === 'medium' || record.priority === 'low'
    ? record.priority
    : 'medium';

  if (!answer) return null;

  return {
    answer,
    quickActions: quickActions.length > 0 ? quickActions.slice(0, 3) : ['visao'],
    priority,
  };
}

function parseAssistant(rawText: string): TripAssistantOutput | null {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;
  return normalizeOutput(parsed);
}

function scoreAssistant(output: TripAssistantOutput) {
  let score = 0;
  if (output.answer.length >= 40) score += 30;
  if (output.answer.length >= 80) score += 20;
  score += Math.min(15, output.quickActions.length * 5);
  if (output.priority === 'high') score += 10;
  if (output.answer.toLowerCase().includes('não sei')) score -= 15;
  return score;
}

function fallbackAssistant(message: string): TripAssistantOutput {
  const normalized = message.toLowerCase();
  if (normalized.includes('voo')) {
    return {
      answer: 'Revise voos pendentes e confirme horário, origem e destino. Se houver lacunas entre cidades, adicione um transporte para fechar o trecho.',
      quickActions: ['voos', 'transportes'],
      priority: 'medium',
    };
  }
  if (normalized.includes('hotel') || normalized.includes('hosped')) {
    return {
      answer: 'Confira check-in/check-out e se todas as noites da viagem estão cobertas. Se faltar algum período, adicione uma nova hospedagem.',
      quickActions: ['hospedagens', 'visao'],
      priority: 'medium',
    };
  }
  if (normalized.includes('gasto') || normalized.includes('orc') || normalized.includes('despesa')) {
    return {
      answer: 'Compare total real e estimado no orçamento. Lance despesas pendentes por categoria para manter a previsão financeira confiável.',
      quickActions: ['orcamento', 'despesas'],
      priority: 'low',
    };
  }

  return {
    answer: 'Posso ajudar com voos, hospedagens, transportes, tarefas e orçamento. Diga o que você quer revisar agora e eu te direciono para o módulo certo.',
    quickActions: ['visao', 'tarefas'],
    priority: 'low',
  };
}

async function loadTripContext(
  authedClient: ReturnType<typeof createAuthedClient>,
  viagemId: string,
) {
  if (!authedClient) return null;

  const { data: canView, error: canViewError } = await authedClient.rpc('can_view_trip', { _viagem_id: viagemId });
  if (canViewError || !canView) {
    return null;
  }

  const { data: trip, error: tripError } = await authedClient
    .from('viagens')
    .select('id, nome, destino, data_inicio, data_fim, status')
    .eq('id', viagemId)
    .maybeSingle();

  if (tripError || !trip) return null;

  const [flights, stays, transports, tasks] = await Promise.all([
    authedClient
      .from('voos')
      .select('numero, companhia, origem, destino, data, status')
      .eq('viagem_id', viagemId)
      .order('data', { ascending: true })
      .limit(5),
    authedClient
      .from('hospedagens')
      .select('nome, localizacao, check_in, check_out, status')
      .eq('viagem_id', viagemId)
      .order('check_in', { ascending: true })
      .limit(5),
    authedClient
      .from('transportes')
      .select('tipo, origem, destino, data, status')
      .eq('viagem_id', viagemId)
      .order('data', { ascending: true })
      .limit(5),
    authedClient
      .from('tarefas')
      .select('titulo, categoria, prioridade, concluida')
      .eq('viagem_id', viagemId)
      .eq('concluida', false)
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return {
    trip,
    flights: flights.data ?? [],
    stays: stays.data ?? [],
    transports: transports.data ?? [],
    pendingTasks: tasks.data ?? [],
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar o chat de IA.', 401);
    }

    const featureContext = await loadFeatureGateContext(auth.userId);
    if (!isFeatureEnabled(featureContext, 'ff_ai_import_enabled')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'trip-ai-chat', status: 'blocked', reason: 'feature_disabled' },
      });
      return errorResponse(requestId, 'UNAUTHORIZED', 'Seu plano atual não permite chat de IA.', 403);
    }

    const limitPerHour = resolveAiRateLimit(BASE_LIMIT_PER_HOUR, featureContext);
    const timeoutMs = resolveAiTimeout(15_000, featureContext);
    const rate = consumeRateLimit(auth.userId, 'trip-ai-chat', limitPerHour, ONE_HOUR_MS);
    if (!rate.allowed) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'trip-ai-chat', status: 'blocked', reason: 'rate_limit' },
      });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de uso do chat de IA atingido. Tente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const viagemId = typeof body.viagemId === 'string' ? body.viagemId.trim() : '';
    const message = normalizeMessage(body.message);
    const recentMessages = normalizeRecentMessages(body.recentMessages);
    if (!viagemId || !message) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Informe viagemId e mensagem para continuar.', 400);
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Sessão ausente.', 401);
    }

    const authedClient = createAuthedClient(authorization);
    if (!authedClient) {
      return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase ausente.', 500);
    }

    const tripContext = await loadTripContext(authedClient, viagemId);
    if (!tripContext) {
      return errorResponse(requestId, 'FORBIDDEN', 'Você não tem acesso a esta viagem.', 403);
    }

    const payload = {
      userMessage: message,
      recentMessages,
      tripContext,
    };

    const parallel = await runParallelJsonInference<TripAssistantOutput>({
      prompt: PROMPT,
      userPayload: JSON.stringify(payload),
      openRouterModel: OPENROUTER_MODEL,
      geminiModel: GEMINI_MODEL,
      timeoutMs,
      temperature: 0.2,
      maxTokens: 700,
      parser: parseAssistant,
    });

    const candidates: Array<{ provider: 'openrouter' | 'gemini'; data: TripAssistantOutput; score: number }> = [];
    if (parallel.openrouter.ok && parallel.openrouter.parsed) {
      candidates.push({ provider: 'openrouter', data: parallel.openrouter.parsed, score: scoreAssistant(parallel.openrouter.parsed) });
    }
    if (parallel.gemini.ok && parallel.gemini.parsed) {
      candidates.push({ provider: 'gemini', data: parallel.gemini.parsed, score: scoreAssistant(parallel.gemini.parsed) });
    }

    candidates.sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.provider === 'openrouter' ? -1 : 1;
    });

    const selected = candidates[0] ?? null;
    const data = selected?.data ?? fallbackAssistant(message);
    const providerMeta = selected
      ? buildProviderMeta(selected.provider, { openrouter: parallel.openrouter, gemini: parallel.gemini })
      : {
          selected: 'heuristic' as const,
          openrouter_ok: parallel.openrouter.ok,
          gemini_ok: parallel.gemini.ok,
          openrouter_ms: parallel.openrouter.elapsedMs,
          gemini_ms: parallel.gemini.elapsedMs,
          fallback_used: true,
          reasoning_tokens_openrouter: null,
        };

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: 'ff_ai_import_enabled',
      viagemId,
      metadata: {
        operation: 'trip-ai-chat',
        status: 'success',
        selected_provider: providerMeta.selected,
      },
    });

    return successResponse({ ...data, provider_meta: providerMeta });
  } catch (error) {
    console.error('[trip-ai-chat]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado no chat de IA.', 500);
  }
});
