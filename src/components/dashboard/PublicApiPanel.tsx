import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trackProductEvent } from '@/services/productAnalytics';
import { fetchPublicTripSnapshot } from '@/services/publicApi';
import { toast } from 'sonner';

type PublicApiPanelProps = {
  enabled: boolean;
  currentTripId: string | null;
};

export function PublicApiPanel({ enabled, currentTripId }: PublicApiPanelProps) {
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">API pública da viagem (M4)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabled ? (
          <>
            <p className="text-sm text-muted-foreground">
              Gere um snapshot autenticado da viagem para integrações externas.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={!currentTripId || isLoadingSnapshot}
                onClick={async () => {
                  if (!currentTripId) return;
                  setIsLoadingSnapshot(true);
                  try {
                    const result = await fetchPublicTripSnapshot(currentTripId);
                    if (result.error || !result.data) {
                      toast.error(result.error ?? 'Falha ao obter snapshot da API pública.');
                      return;
                    }
                    setSnapshotPreview(JSON.stringify(result.data, null, 2));
                    await trackProductEvent({
                      eventName: 'api_snapshot_requested',
                      featureKey: 'ff_public_api_access',
                      viagemId: currentTripId,
                      metadata: { source: 'support_tab' },
                    });
                  } finally {
                    setIsLoadingSnapshot(false);
                  }
                }}
              >
                {isLoadingSnapshot ? 'Carregando...' : 'Gerar snapshot da API'}
              </Button>
            </div>
            {snapshotPreview && (
              <pre className="tp-scroll max-h-52 overflow-auto rounded-lg border bg-muted/20 p-3 text-xs">
                {snapshotPreview}
              </pre>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            API pública disponível no plano Team com a flag `ff_public_api_access`.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
