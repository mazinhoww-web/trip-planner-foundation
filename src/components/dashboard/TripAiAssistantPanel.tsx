import { useEffect, useMemo, useState } from 'react';
import { askTripAssistant, TripAiChatMessage, TripAiPriority, TripAiQuickAction } from '@/services/tripAiChat';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Bot, Loader2, MessageSquare, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  priority?: TripAiPriority;
  quickActions?: TripAiQuickAction[];
  createdAt: string;
};

type TripAiAssistantPanelProps = {
  enabled: boolean;
  currentTripId: string | null;
  onNavigateTab?: (tab: string) => void;
};

const STORAGE_PREFIX = 'tp_trip_ai_chat';

function makeStorageKey(tripId: string | null) {
  return `${STORAGE_PREFIX}:${tripId ?? 'none'}`;
}

function priorityLabel(priority: TripAiPriority | undefined) {
  if (priority === 'high') return 'Prioridade alta';
  if (priority === 'low') return 'Prioridade baixa';
  return 'Prioridade média';
}

function priorityClass(priority: TripAiPriority | undefined) {
  if (priority === 'high') return 'border-rose-300 bg-rose-50 text-rose-700';
  if (priority === 'low') return 'border-emerald-300 bg-emerald-50 text-emerald-700';
  return 'border-amber-300 bg-amber-50 text-amber-700';
}

function normalizeStoredMessages(raw: unknown): UiMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      if (record.role !== 'user' && record.role !== 'assistant') return null;
      if (typeof record.content !== 'string' || !record.content.trim()) return null;
      const quickActionsRaw = Array.isArray(record.quickActions) ? record.quickActions : [];
      const quickActions = quickActionsRaw
        .filter((entry): entry is TripAiQuickAction => typeof entry === 'string')
        .slice(0, 3);
      const priority =
        record.priority === 'high' || record.priority === 'medium' || record.priority === 'low'
          ? record.priority
          : undefined;
      return {
        id: typeof record.id === 'string' ? record.id : crypto.randomUUID(),
        role: record.role,
        content: record.content.trim(),
        quickActions,
        priority,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
      } as UiMessage;
    })
    .filter((item): item is UiMessage => !!item)
    .slice(-12);
}

export function TripAiAssistantPanel({ enabled, currentTripId, onNavigateTab }: TripAiAssistantPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!currentTripId) {
      setMessages([]);
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(makeStorageKey(currentTripId));
      if (!raw) {
        setMessages([]);
        return;
      }
      setMessages(normalizeStoredMessages(JSON.parse(raw)));
    } catch {
      setMessages([]);
    }
  }, [currentTripId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentTripId) return;
    window.sessionStorage.setItem(makeStorageKey(currentTripId), JSON.stringify(messages.slice(-12)));
  }, [messages, currentTripId]);

  const recentMessages = useMemo<TripAiChatMessage[]>(
    () =>
      messages
        .slice(-8)
        .map((message) => ({
          role: message.role,
          content: message.content,
        })),
    [messages],
  );

  const sendMessage = async () => {
    if (!enabled) {
      toast.error('Seu plano atual não permite chat de IA.');
      return;
    }
    if (!currentTripId) {
      toast.error('Selecione uma viagem para conversar com a IA.');
      return;
    }

    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) return;

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: normalizedPrompt,
      createdAt: new Date().toISOString(),
    };

    setPrompt('');
    setLastError(null);
    setMessages((prev) => [...prev.slice(-11), userMessage]);
    setIsSending(true);

    const response = await askTripAssistant({
      viagemId: currentTripId,
      message: normalizedPrompt,
      recentMessages: [...recentMessages, { role: 'user', content: normalizedPrompt }].slice(-8),
    });

    if (response.error || !response.data) {
      const errorMessage = response.error ?? 'Não foi possível responder agora.';
      setLastError(errorMessage);
      toast.error(errorMessage);
      setIsSending(false);
      return;
    }

    const assistantMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: response.data.answer,
      priority: response.data.priority,
      quickActions: response.data.quickActions,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev.slice(-11), assistantMessage]);
    setIsSending(false);
  };

  const clearConversation = () => {
    setMessages([]);
    setLastError(null);
    if (typeof window !== 'undefined' && currentTripId) {
      window.sessionStorage.removeItem(makeStorageKey(currentTripId));
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="space-y-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Assistente de viagem com IA
          </span>
          {!enabled ? <Badge variant="outline">Indisponível no plano atual</Badge> : null}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Pergunte sobre lacunas da viagem, próximos passos, organização e orçamento. As sugestões usam seus dados atuais da viagem.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <ScrollArea className="h-[260px] rounded-xl border bg-muted/20 p-3">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
              <div className="space-y-2">
                <MessageSquare className="mx-auto h-5 w-5 text-primary/70" />
                <p>Pergunte, por exemplo: “quais lacunas faltam fechar nesta viagem?”</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl border px-3 py-2 text-sm ${
                    message.role === 'assistant'
                      ? 'border-primary/25 bg-primary/5'
                      : 'ml-4 border-slate-300/60 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      {message.role === 'assistant' ? <Bot className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      {message.role === 'assistant' ? 'Assistente' : 'Você'}
                    </span>
                    {message.role === 'assistant' ? (
                      <Badge variant="outline" className={`text-[10px] ${priorityClass(message.priority)}`}>
                        {priorityLabel(message.priority)}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

                  {message.role === 'assistant' && message.quickActions && message.quickActions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.quickActions.map((tabKey) => (
                        <Button
                          key={`${message.id}:${tabKey}`}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px]"
                          onClick={() => onNavigateTab?.(tabKey)}
                        >
                          Ir para {tabKey}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {lastError ? (
          <p className="rounded-md border border-rose-300/70 bg-rose-50 px-3 py-2 text-xs text-rose-700">{lastError}</p>
        ) : null}

        <div className="grid gap-2">
          <Textarea
            placeholder="Ex.: Mostre as pendências mais críticas da viagem e em qual aba eu devo agir primeiro."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={!enabled || !currentTripId || isSending}
            rows={3}
            maxLength={1200}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={clearConversation} disabled={messages.length === 0 || isSending}>
              Limpar conversa
            </Button>
            <Button
              onClick={() => void sendMessage()}
              disabled={!enabled || !currentTripId || isSending || !prompt.trim()}
              className="min-w-[150px]"
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
