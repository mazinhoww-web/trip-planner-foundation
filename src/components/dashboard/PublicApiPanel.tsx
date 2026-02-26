import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trackProductEvent } from '@/services/productAnalytics';
import {
  createPublicTripShareLink,
  fetchPublicTripSnapshot,
  listPublicTripShareLinks,
  PublicShareListItem,
  revokePublicTripShareLink,
} from '@/services/publicApi';
import { toast } from 'sonner';

type PublicApiPanelProps = {
  enabled: boolean;
  currentTripId: string | null;
};

export function PublicApiPanel({ enabled, currentTripId }: PublicApiPanelProps) {
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [shareLinks, setShareLinks] = useState<PublicShareListItem[]>([]);
  const [lastCreatedShareUrl, setLastCreatedShareUrl] = useState<string | null>(null);

  const refreshShareLinks = async () => {
    if (!enabled || !currentTripId) return;
    const result = await listPublicTripShareLinks(currentTripId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setShareLinks(result.data);
  };

  useEffect(() => {
    void refreshShareLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, currentTripId]);

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
              <Button
                type="button"
                variant="default"
                disabled={!currentTripId || isCreatingShare}
                onClick={async () => {
                  if (!currentTripId) return;
                  setIsCreatingShare(true);
                  try {
                    const result = await createPublicTripShareLink(currentTripId);
                    if (result.error || !result.data) {
                      toast.error(result.error ?? 'Falha ao criar link público.');
                      return;
                    }
                    setLastCreatedShareUrl(result.data.url);
                    try {
                      await navigator.clipboard.writeText(result.data.url);
                      toast.success('Link público criado e copiado.');
                    } catch {
                      toast.success('Link público criado. Copie manualmente abaixo.');
                    }
                    await refreshShareLinks();
                    await trackProductEvent({
                      eventName: 'export_triggered',
                      featureKey: 'ff_public_api_access',
                      viagemId: currentTripId,
                      metadata: { source: 'support_tab', mode: 'public_share' },
                    });
                  } finally {
                    setIsCreatingShare(false);
                  }
                }}
              >
                {isCreatingShare ? 'Criando link...' : 'Criar link público'}
              </Button>
            </div>
            {lastCreatedShareUrl && (
              <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                <p className="font-medium text-foreground">Último link gerado</p>
                <p className="mt-1 break-all text-muted-foreground">{lastCreatedShareUrl}</p>
              </div>
            )}
            {snapshotPreview && (
              <pre className="tp-scroll max-h-52 overflow-auto rounded-lg border bg-muted/20 p-3 text-xs">
                {snapshotPreview}
              </pre>
            )}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Links públicos ativos/pendentes</p>
              {shareLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum link público criado até agora.</p>
              ) : (
                <div className="space-y-2">
                  {shareLinks.map((share) => (
                    <div key={share.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs">
                        <p className="font-medium">
                          #{share.token_hint} • {share.ativo ? 'Ativo' : 'Revogado'}
                        </p>
                        <p className="text-muted-foreground">
                          Expira em {new Date(share.expira_em).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      {share.ativo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700"
                          onClick={async () => {
                            if (!currentTripId) return;
                            const result = await revokePublicTripShareLink(currentTripId, share.id);
                            if (result.error) {
                              toast.error(result.error);
                              return;
                            }
                            toast.success('Link público revogado.');
                            await refreshShareLinks();
                          }}
                        >
                          Revogar
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
