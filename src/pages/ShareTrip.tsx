import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchSharedTripSnapshot, PublicTripSnapshot } from '@/services/publicApi';
import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function ShareTrip() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>('idle');
  const [snapshot, setSnapshot] = useState<PublicTripSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMessage('Link de compartilhamento inválido.');
      return;
    }

    const load = async () => {
      setState('loading');
      const result = await fetchSharedTripSnapshot(token);
      if (result.error || !result.data) {
        setState('error');
        setErrorMessage(result.error ?? 'Não foi possível carregar os dados compartilhados.');
        return;
      }
      setSnapshot(result.data);
      setState('ready');
    };

    void load();
  }, [token]);

  const trip = snapshot?.trip ?? {};
  const tripName = String(trip.nome ?? 'Viagem compartilhada');
  const tripDestination = String(trip.destino ?? 'Destino a definir');
  const tripPeriod = [trip.data_inicio, trip.data_fim].filter(Boolean).join(' - ');

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-50/70 to-slate-100/70 dark:via-slate-900/65 dark:to-slate-950/75">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <BrandLogo variant="co-brand" className="h-8" />
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </div>

        {state === 'loading' && (
          <Card className="border-border/50">
            <CardContent className="p-8 text-center text-muted-foreground">Carregando viagem compartilhada...</CardContent>
          </Card>
        )}

        {state === 'error' && (
          <Card className="border-rose-500/40 bg-rose-500/5">
            <CardContent className="space-y-2 p-6 text-sm">
              <p className="font-medium text-rose-700">Não foi possível abrir este compartilhamento.</p>
              <p className="text-rose-700/90">{errorMessage}</p>
            </CardContent>
          </Card>
        )}

        {state === 'ready' && snapshot && (
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="font-display text-2xl">{tripName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {tripDestination}
                </p>
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {tripPeriod || 'Período não informado'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Snapshot gerado em {new Date(snapshot.exportedAt).toLocaleString('pt-BR')}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(snapshot.totals).map(([key, value]) => (
                <Card key={key} className="border-border/50">
                  <CardContent className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{key}</p>
                    <p className="mt-1 text-2xl font-semibold">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {(['voos', 'hospedagens', 'transportes', 'roteiro'] as const).map((moduleKey) => {
              const rows = snapshot.modules[moduleKey] ?? [];
              if (!Array.isArray(rows) || rows.length === 0) return null;

              return (
                <Card key={moduleKey} className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base capitalize">{moduleKey}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {rows.slice(0, 8).map((item, index) => {
                      const row = item as Record<string, unknown>;
                      return (
                        <div key={`${moduleKey}-${index}`} className="rounded-lg border p-3">
                          <p className="font-medium">
                            {String(row.titulo ?? row.nome ?? row.numero ?? row.tipo ?? `Item ${index + 1}`)}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {row.origem && row.destino ? (
                              <Badge variant="outline">
                                {String(row.origem)} → {String(row.destino)}
                              </Badge>
                            ) : null}
                            {row.data ? <Badge variant="outline">{String(row.data)}</Badge> : null}
                            {row.check_in && row.check_out ? (
                              <Badge variant="outline">
                                {String(row.check_in)} - {String(row.check_out)}
                              </Badge>
                            ) : null}
                            {row.categoria ? <Badge variant="outline">{String(row.categoria)}</Badge> : null}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
