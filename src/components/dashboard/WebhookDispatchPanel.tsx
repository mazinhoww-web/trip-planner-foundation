import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Lock } from 'lucide-react';
import { dispatchTripWebhook } from '@/services/webhooks';
import { trackProductEvent } from '@/services/productAnalytics';
import { toast } from 'sonner';

type WebhookDispatchPanelProps = {
  enabled: boolean;
  currentTripId?: string | null;
};

export function WebhookDispatchPanel({ enabled, currentTripId }: WebhookDispatchPanelProps) {
  const [eventType, setEventType] = useState('trip.import.completed');
  const [payloadRaw, setPayloadRaw] = useState('{\n  "source": "manual-panel"\n}');
  const [isSending, setIsSending] = useState(false);

  const sendWebhook = async () => {
    if (!currentTripId) {
      toast.error('Selecione uma viagem para testar webhooks.');
      return;
    }

    setIsSending(true);
    try {
      const payload = payloadRaw.trim()
        ? (JSON.parse(payloadRaw) as Record<string, unknown>)
        : {};

      const result = await dispatchTripWebhook({
        eventType: eventType.trim() || 'trip.import.completed',
        viagemId: currentTripId,
        payload,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      await trackProductEvent({
        eventName: 'webhook_dispatched',
        featureKey: 'ff_webhooks_enabled',
        viagemId: currentTripId,
        metadata: {
          eventType: eventType.trim() || 'trip.import.completed',
        },
      });

      toast.success('Webhook enviado com sucesso.');
    } catch {
      toast.error('Payload inválido. Use JSON válido para enviar o webhook.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Integrações por webhook</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!enabled ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <Lock className="h-3.5 w-3.5" />
              Recurso disponível no plano Team
            </div>
            Ative a flag <code>ff_webhooks_enabled</code> para disparar integrações externas.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="webhook-event-type" className="text-xs font-medium text-muted-foreground">
                Event type
              </label>
              <Input
                id="webhook-event-type"
                value={eventType}
                onChange={(event) => setEventType(event.target.value)}
                placeholder="trip.import.completed"
                disabled={isSending}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="webhook-payload" className="text-xs font-medium text-muted-foreground">
                Payload JSON
              </label>
              <Textarea
                id="webhook-payload"
                value={payloadRaw}
                onChange={(event) => setPayloadRaw(event.target.value)}
                rows={5}
                className="font-mono text-xs"
                disabled={isSending}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                O destino é configurado via <code>WEBHOOK_TARGET_URL</code> na edge function.
              </p>
              <Button onClick={() => void sendWebhook()} disabled={isSending || !eventType.trim() || !currentTripId}>
                {isSending ? 'Enviando...' : 'Enviar webhook de teste'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
