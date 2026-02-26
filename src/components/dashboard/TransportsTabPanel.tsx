import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tables } from '@/integrations/supabase/types';
import { Bus, Clock3, ExternalLink, Pencil, Plus, Route, Trash2 } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

const TripOpenMap = lazy(() =>
  import('@/components/map/TripOpenMap').then((mod) => ({ default: mod.TripOpenMap })),
);

type ReservaStatus = 'confirmado' | 'pendente' | 'cancelado';

type TransportFormState = {
  tipo: string;
  operadora: string;
  origem: string;
  destino: string;
  data: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
};

type DayChip = {
  day: string;
  label: string;
  count: number;
  allConfirmed: boolean;
};

type CurrencyTotal = {
  currency: string;
  total: number;
};

type TransportStats = {
  total: number;
  confirmed: number;
  byCurrency: CurrencyTotal[];
};

type TransportInsights = {
  tips: string[];
  risk: string;
};

type Props = {
  canEditTrip: boolean;
  transportDialogOpen: boolean;
  setTransportDialogOpen: (open: boolean) => void;
  openCreateTransport: () => void;
  editingTransport: Tables<'transportes'> | null;
  transportForm: TransportFormState;
  setTransportForm: Dispatch<SetStateAction<TransportFormState>>;
  submitTransport: () => Promise<void> | void;
  isCreatingTransport: boolean;
  isUpdatingTransport: boolean;
  transportSearch: string;
  setTransportSearch: (value: string) => void;
  transportStatus: 'todos' | ReservaStatus;
  setTransportStatus: (value: 'todos' | ReservaStatus) => void;
  transportStats: TransportStats;
  formatByCurrency: (items: CurrencyTotal[]) => string;
  transportDayChips: DayChip[];
  isAnyCrudDialogOpen: boolean;
  stays: Tables<'hospedagens'>[];
  transportFiltered: Tables<'transportes'>[];
  flights: Tables<'voos'>[];
  transportsLoading: boolean;
  onSelectTransport: (transport: Tables<'transportes'>) => void;
  buildMapsUrl: (
    type: 'route' | 'search',
    opts: { origin?: string | null; destination?: string | null; query?: string | null },
  ) => string | null;
  statusBadge: (status: ReservaStatus) => ReactNode;
  openEditTransport: (transport: Tables<'transportes'>) => void;
  removeTransport: (id: string) => Promise<void> | void;
  isRemovingTransport: boolean;
  transportDetailOpen: boolean;
  setTransportDetailOpen: (open: boolean) => void;
  selectedTransport: Tables<'transportes'> | null;
  formatDateTime: (iso?: string | null) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
  transportReservationCode: (transport: Tables<'transportes'>) => string;
  buildTransportInsights: (transport: Tables<'transportes'>) => TransportInsights;
};

export function TransportsTabPanel({
  canEditTrip,
  transportDialogOpen,
  setTransportDialogOpen,
  openCreateTransport,
  editingTransport,
  transportForm,
  setTransportForm,
  submitTransport,
  isCreatingTransport,
  isUpdatingTransport,
  transportSearch,
  setTransportSearch,
  transportStatus,
  setTransportStatus,
  transportStats,
  formatByCurrency,
  transportDayChips,
  isAnyCrudDialogOpen,
  stays,
  transportFiltered,
  flights,
  transportsLoading,
  onSelectTransport,
  buildMapsUrl,
  statusBadge,
  openEditTransport,
  removeTransport,
  isRemovingTransport,
  transportDetailOpen,
  setTransportDetailOpen,
  selectedTransport,
  formatDateTime,
  formatCurrency,
  transportReservationCode,
  buildTransportInsights,
}: Props) {
  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-display text-xl">Linha do tempo de transportes</CardTitle>
            <Dialog open={transportDialogOpen} onOpenChange={setTransportDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateTransport} disabled={!canEditTrip}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo transporte
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingTransport ? 'Editar transporte' : 'Novo transporte'}</DialogTitle>
                  <DialogDescription>
                    Cadastro do trecho para compor a timeline da viagem.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Input placeholder="Ex.: Transfer, Trem, Ônibus" value={transportForm.tipo} onChange={(e) => setTransportForm((s) => ({ ...s, tipo: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Operadora</Label>
                    <Input value={transportForm.operadora} onChange={(e) => setTransportForm((s) => ({ ...s, operadora: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input value={transportForm.origem} onChange={(e) => setTransportForm((s) => ({ ...s, origem: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Destino</Label>
                    <Input value={transportForm.destino} onChange={(e) => setTransportForm((s) => ({ ...s, destino: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data e hora</Label>
                    <Input type="datetime-local" value={transportForm.data} onChange={(e) => setTransportForm((s) => ({ ...s, data: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={transportForm.status} onValueChange={(value: ReservaStatus) => setTransportForm((s) => ({ ...s, status: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Valor</Label>
                    <Input type="number" step="0.01" value={transportForm.valor} onChange={(e) => setTransportForm((s) => ({ ...s, valor: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moeda</Label>
                    <Input value={transportForm.moeda} onChange={(e) => setTransportForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTransportDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => void submitTransport()} disabled={!canEditTrip || isCreatingTransport || isUpdatingTransport}>
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <Input
              placeholder="Buscar por tipo, operadora, origem ou destino"
              value={transportSearch}
              onChange={(e) => setTransportSearch(e.target.value)}
            />
            <Select value={transportStatus} onValueChange={(value: 'todos' | ReservaStatus) => setTransportStatus(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Trechos no filtro</p>
              <p className="text-lg font-semibold">{transportStats.total}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Confirmados</p>
              <p className="text-lg font-semibold">{transportStats.confirmed}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Custo somado</p>
              <p className="text-lg font-semibold">{formatByCurrency(transportStats.byCurrency)}</p>
            </div>
          </div>

          {transportDayChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {transportDayChips.map((chip) => (
                <button
                  key={chip.day}
                  type="button"
                  className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                >
                  <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                  <p className="text-sm font-semibold">{chip.count} trecho(s)</p>
                </button>
              ))}
            </div>
          )}

          {isAnyCrudDialogOpen ? (
            <div className="flex h-[260px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Mapa temporariamente oculto enquanto um modal está aberto.
            </div>
          ) : (
            <Suspense fallback={<div className="h-[260px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
              <TripOpenMap
                stays={stays}
                transports={transportFiltered}
                flights={flights}
                height="clamp(200px, 34vh, 260px)"
                disabled={isAnyCrudDialogOpen}
                background
              />
            </Suspense>
          )}

          {transportsLoading ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Carregando transportes...
            </div>
          ) : transportFiltered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Bus className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum transporte encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {transportFiltered.map((transport) => (
                <div key={transport.id} className="relative pl-8">
                  <div className="absolute left-2 top-2 h-full w-px bg-border" />
                  <div className="absolute left-0 top-2 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                  <Card className="border-border/50">
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => onSelectTransport(transport)}
                      >
                        <div className="flex items-center gap-2">
                          <Route className="h-4 w-4 text-primary" />
                          <p className="font-semibold">{transport.tipo || 'Transporte'}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {transport.origem || 'Origem'} → {transport.destino || 'Destino'} · {transport.operadora || 'Operadora não informada'}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                          {formatDateTime(transport.data)}
                        </p>
                        <p className="text-sm font-medium">{formatCurrency(transport.valor, transport.moeda ?? 'BRL')}</p>
                      </button>
                      {buildMapsUrl('route', { origin: transport.origem, destination: transport.destino }) && (
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                          <a href={buildMapsUrl('route', { origin: transport.origem, destination: transport.destino })!} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3" />
                            Ver rota
                          </a>
                        </Button>
                      )}
                      <div className="flex items-center gap-2">
                        {statusBadge(transport.status)}
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Editar transporte"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditTransport(transport);
                          }}
                          disabled={!canEditTrip}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmActionButton
                          ariaLabel="Remover transporte"
                          title="Remover transporte"
                          description="Esse trecho de transporte será excluído da timeline."
                          confirmLabel="Remover"
                          disabled={!canEditTrip || isRemovingTransport}
                          onConfirm={() => void removeTransport(transport.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmActionButton>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={transportDetailOpen} onOpenChange={setTransportDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do transporte</DialogTitle>
            <DialogDescription>Informações completas do deslocamento selecionado.</DialogDescription>
          </DialogHeader>
          {selectedTransport && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{selectedTransport.origem || 'Origem'} → {selectedTransport.destino || 'Destino'}</p>
                    <p className="text-muted-foreground">{selectedTransport.tipo || 'Transporte'} • {selectedTransport.operadora || 'Operadora não informada'}</p>
                  </div>
                  {statusBadge(selectedTransport.status)}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Data</p>
                    <p className="font-medium">{formatDateTime(selectedTransport.data)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Valor</p>
                    <p className="font-medium">{formatCurrency(selectedTransport.valor, selectedTransport.moeda ?? 'BRL')}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Código da reserva</p>
                    <p className="font-mono text-xs font-semibold">{transportReservationCode(selectedTransport)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Trajeto</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium">{selectedTransport.origem || 'Origem'}</p>
                      <p className="text-xs text-muted-foreground">Embarque</p>
                    </div>
                  </div>
                  <div className="ml-1 h-8 w-px bg-border" />
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-primary/50" />
                    <div>
                      <p className="font-medium">{selectedTransport.destino || 'Destino'}</p>
                      <p className="text-xs text-muted-foreground">Chegada</p>
                    </div>
                  </div>
                </div>
                {buildMapsUrl('route', { origin: selectedTransport.origem, destination: selectedTransport.destino }) && (
                  <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" asChild>
                    <a href={buildMapsUrl('route', { origin: selectedTransport.origem, destination: selectedTransport.destino })!} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Abrir rota no Google Maps
                    </a>
                  </Button>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Insights do trajeto</p>
                <Badge variant="secondary" className="mt-2">{buildTransportInsights(selectedTransport).risk}</Badge>
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Dicas do trajeto</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {buildTransportInsights(selectedTransport).tips.slice(0, 3).map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase text-muted-foreground">Ao chegar</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    <li>Confira plataforma/ponto de desembarque antes de sair.</li>
                    <li>Mantenha comprovante e localização offline no celular.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
