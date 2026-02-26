import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tables } from '@/integrations/supabase/types';
import { CalendarDays } from 'lucide-react';
import { Suspense, lazy } from 'react';

const TripOpenMap = lazy(() =>
  import('@/components/map/TripOpenMap').then((mod) => ({ default: mod.TripOpenMap })),
);

type UpcomingEvent = {
  id: string;
  titulo: string;
  tipo: string;
  data: string | null;
};

type Props = {
  upcomingEvents: UpcomingEvent[];
  formatDateTime: (iso?: string | null) => string;
  stayCoverageGapCount: number;
  transportCoverageGapCount: number;
  restaurantsSavedCount: number;
  documentsCount: number;
  travelersCount: number;
  realTotal: number;
  estimadoTotal: number;
  formatCurrency: (value?: number | null, currency?: string) => string;
  isAnyCrudDialogOpen: boolean;
  stays: Tables<'hospedagens'>[];
  transports: Tables<'transportes'>[];
  flights: Tables<'voos'>[];
};

export function OverviewTabPanel({
  upcomingEvents,
  formatDateTime,
  stayCoverageGapCount,
  transportCoverageGapCount,
  restaurantsSavedCount,
  documentsCount,
  travelersCount,
  realTotal,
  estimadoTotal,
  formatCurrency,
  isAnyCrudDialogOpen,
  stays,
  transports,
  flights,
}: Props) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50 lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-xl">Próximos eventos</CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Sem eventos futuros no momento.
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-start justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{event.titulo}</p>
                      <p className="text-sm text-muted-foreground">{event.tipo}</p>
                    </div>
                    <Badge variant="secondary" className="whitespace-nowrap">
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />
                      {formatDateTime(event.data)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Cobertura da viagem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="font-medium text-emerald-700">
                {stayCoverageGapCount === 0 ? 'Hospedagens cobertas' : `${stayCoverageGapCount} gap(s) de hospedagem`}
              </p>
              <p className="text-xs text-emerald-700/80">
                {stayCoverageGapCount === 0
                  ? 'Sem noites descobertas no intervalo atual.'
                  : 'Revise os períodos sem check-in/check-out registrados.'}
              </p>
            </div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
              <p className="font-medium text-sky-700">
                {transportCoverageGapCount === 0 ? 'Trocas de cidade cobertas' : `${transportCoverageGapCount} trecho(s) sem transporte`}
              </p>
              <p className="text-xs text-sky-700/80">
                {transportCoverageGapCount === 0
                  ? 'Nenhum deslocamento entre cidades ficou descoberto.'
                  : 'Adicione voos/transportes para fechar os deslocamentos faltantes.'}
              </p>
            </div>
            <p><strong>Restaurantes salvos:</strong> {restaurantsSavedCount}</p>
            <p><strong>Documentos:</strong> {documentsCount}</p>
            <p><strong>Viajantes:</strong> {travelersCount}</p>
            <p><strong>Real x estimado:</strong> {formatCurrency(realTotal)} / {formatCurrency(estimadoTotal)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Mapa da viagem (OpenStreetMap)</CardTitle>
        </CardHeader>
        <CardContent>
          {isAnyCrudDialogOpen ? (
            <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Mapa temporariamente oculto enquanto um modal está aberto.
            </div>
          ) : (
            <Suspense fallback={<div className="h-[320px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
              <TripOpenMap
                stays={stays}
                transports={transports}
                flights={flights}
                height="clamp(220px, 42vh, 320px)"
                disabled={isAnyCrudDialogOpen}
                background
              />
            </Suspense>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-emerald-400/60 bg-emerald-50 text-emerald-700">Hospedagens</Badge>
            <Badge variant="outline" className="border-sky-400/60 bg-sky-50 text-sky-700">Transportes</Badge>
            <Badge variant="outline" className="border-indigo-400/60 bg-indigo-50 text-indigo-700">Voos</Badge>
            <span className="self-center">Pins numerados mostram ordem de estadias no roteiro.</span>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
