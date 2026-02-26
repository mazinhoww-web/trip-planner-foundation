import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

export type TripAiRole = 'user' | 'assistant';

export type TripAiChatMessage = {
  role: TripAiRole;
  content: string;
};

export type TripAiQuickAction =
  | 'visao'
  | 'voos'
  | 'hospedagens'
  | 'transportes'
  | 'tarefas'
  | 'roteiro'
  | 'despesas'
  | 'orcamento'
  | 'gastronomia'
  | 'apoio';

export type TripAiPriority = 'low' | 'medium' | 'high';

export type TripAiProviderMeta = {
  selected: 'openrouter' | 'gemini' | 'heuristic';
  openrouter_ok: boolean;
  gemini_ok: boolean;
  openrouter_ms?: number | null;
  gemini_ms?: number | null;
  fallback_used: boolean;
  reasoning_tokens_openrouter?: number | null;
};

export type TripAiAssistantOutput = {
  answer: string;
  quickActions: TripAiQuickAction[];
  priority: TripAiPriority;
  provider_meta?: TripAiProviderMeta;
};

type FunctionEnvelope<T> = {
  data?: T;
  error?: unknown;
};

const VALID_TABS = new Set<TripAiQuickAction>([
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

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOutput(raw: unknown): TripAiAssistantOutput | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const answer = trimOrNull(record.answer);
  if (!answer) return null;

  const priority: TripAiPriority =
    record.priority === 'high' || record.priority === 'medium' || record.priority === 'low'
      ? record.priority
      : 'medium';

  const rawQuickActions = Array.isArray(record.quickActions) ? record.quickActions : [];
  const quickActions = rawQuickActions
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim() as TripAiQuickAction)
    .filter((item): item is TripAiQuickAction => VALID_TABS.has(item))
    .slice(0, 3);

  return {
    answer,
    quickActions: quickActions.length > 0 ? quickActions : ['visao'],
    priority,
    provider_meta: record.provider_meta as TripAiProviderMeta | undefined,
  };
}

async function invokeWithSingleRetry(
  body: {
    viagemId: string;
    message: string;
    recentMessages: TripAiChatMessage[];
  },
) {
  const run = async () => {
    const { data, error } = await supabase.functions.invoke('trip-ai-chat', { body });
    if (error) {
      throw new Error(parseFunctionError(data ?? error, 'Falha ao consultar o assistente de IA.'));
    }

    const envelope = data as FunctionEnvelope<TripAiAssistantOutput> | null;
    if (envelope?.error) {
      throw new Error(parseFunctionError(envelope, 'Falha ao consultar o assistente de IA.'));
    }

    const normalized = normalizeOutput(envelope?.data);
    if (!normalized) {
      throw new Error('A resposta da IA veio em formato inválido.');
    }

    return normalized;
  };

  try {
    return { data: await run(), error: null as string | null };
  } catch (firstError) {
    try {
      return { data: await run(), error: null as string | null };
    } catch (secondError) {
      const reason = (secondError as Error).message || (firstError as Error).message;
      return { data: null, error: reason || 'Falha ao consultar o assistente de IA.' };
    }
  }
}

export async function askTripAssistant(input: {
  viagemId: string;
  message: string;
  recentMessages: TripAiChatMessage[];
}) {
  const message = trimOrNull(input.message);
  const viagemId = trimOrNull(input.viagemId);
  if (!message || !viagemId) {
    return {
      data: null,
      error: 'Informe a viagem e a mensagem para continuar.',
    };
  }

  const recentMessages = input.recentMessages
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && !!trimOrNull(item.content))
    .map((item) => ({
      role: item.role,
      content: trimOrNull(item.content) ?? '',
    }))
    .slice(-8);

  return invokeWithSingleRetry({
    viagemId,
    message,
    recentMessages,
  });
}
