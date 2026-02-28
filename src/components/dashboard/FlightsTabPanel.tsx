import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePagination } from '@/hooks/usePagination';
import { Tables } from '@/integrations/supabase/types';
import { ExternalLink, Pencil, Plane, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

type ReservaStatus = 'confirmado' | 'pendente' | 'cancelado';

type FlightFormState = {
  numero: string;
  companhia: string;
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

type FlightStats = {
  total: number;
  confirmed: number;
  byCurrency: CurrencyTotal[];
};

type Props = {
  canEditTrip: boolean;
  flightDialogOpen: boolean;
  setFlightDialogOpen: (open: boolean) => void;
  openCreateFlight: () => void;
  editingFlight: Tables<'voos'> | null;
  flightForm: FlightFormState;
  setFlightForm: Dispatch<SetStateAction<FlightFormState>>;
  submitFlight: () => Promise<void> | void;
  isCreatingFlight: boolean;
  isUpdatingFlight: boolean;
  flightSearch: string;
  setFlightSearch: (value: string) => void;
  flightStatus: 'todos' | ReservaStatus;
  setFlightStatus: (value: 'todos' | ReservaStatus) => void;
  flightStats: FlightStats;
  formatByCurrency: (items: CurrencyTotal[]) => string;
  flightDayChips: DayChip[];
  flightsLoading: boolean;
  flightsFiltered: Tables<'voos'>[];
  onSelectFlight: (flight: Tables<'voos'>) => void;
  buildMapsUrl: (
    type: 'route' | 'search',
    opts: { origin?: string | null; destination?: string | null; query?: string | null },
  ) => string | null;
  statusBadge: (status: ReservaStatus) => ReactNode;
  openEditFlight: (flight: Tables<'voos'>) => void;
  removeFlight: (id: string) => Promise<void> | void;
  isRemovingFlight: boolean;
  flightDetailOpen: boolean;
  setFlightDetailOpen: (open: boolean) => void;
  selectedFlight: Tables<'voos'> | null;
  formatDateTime: (iso?: string | null) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
};

function buildGoogleFlightsUrl(origin?: string | null, destination?: string | null, date?: string | null) {
  const from = origin?.trim();
  const to = destination?.trim();
  if (!from || !to) return null;
  const dateToken = typeof date === 'string' && date.trim() ? date.slice(0, 10) : null;
  const query = [from, to, dateToken].filter(Boolean).join(' ');
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

export function FlightsTabPanel({
  canEditTrip,
  flightDialogOpen,
  setFlightDialogOpen,
  openCreateFlight,
  editingFlight,
  flightForm,
  setFlightForm,
  submitFlight,
  isCreatingFlight,
  isUpdatingFlight,
  flightSearch,
  setFlightSearch,
  flightStatus,
  setFlightStatus,
  flightStats,
  formatByCurrency,
  flightDayChips,
  flightsLoading,
  flightsFiltered,
  onSelectFlight,
  buildMapsUrl,
  statusBadge,
  openEditFlight,
  removeFlight,
  isRemovingFlight,
  flightDetailOpen,
  setFlightDetailOpen,
  selectedFlight,
  formatDateTime,
  formatCurrency,
}: Props) {
  const flightsPagination = usePagination(flightsFiltered, {
    pageSize: 8,
    resetKey: `${flightSearch}:${flightStatus}:${flightsFiltered.length}`,
  });
  const visibleFlights = useMemo(() => flightsPagination.pageItems, [flightsPagination.pageItems]);

  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-display text-xl">Gestão de voos</CardTitle>
            <Dialog open={flightDialogOpen} onOpenChange={setFlightDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateFlight} disabled={!canEditTrip}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo voo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingFlight ? 'Editar voo' : 'Novo voo'}</DialogTitle>
                  <DialogDescription>
                    Preencha as informações para salvar no banco real.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Número do voo</Label>
                    <Input value={flightForm.numero} onChange={(e) => setFlightForm((s) => ({ ...s, numero: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Companhia</Label>
                    <Input value={flightForm.companhia} onChange={(e) => setFlightForm((s) => ({ ...s, companhia: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input value={flightForm.origem} onChange={(e) => setFlightForm((s) => ({ ...s, origem: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Destino</Label>
                    <Input value={flightForm.destino} onChange={(e) => setFlightForm((s) => ({ ...s, destino: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Data e hora</Label>
                    <Input type="datetime-local" value={flightForm.data} onChange={(e) => setFlightForm((s) => ({ ...s, data: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={flightForm.status} onValueChange={(value: ReservaStatus) => setFlightForm((s) => ({ ...s, status: value }))}>
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
                    <Input type="number" step="0.01" value={flightForm.valor} onChange={(e) => setFlightForm((s) => ({ ...s, valor: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moeda</Label>
                    <Input value={flightForm.moeda} onChange={(e) => setFlightForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFlightDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => void submitFlight()} disabled={!canEditTrip || isCreatingFlight || isUpdatingFlight}>
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
              placeholder="Buscar por número, companhia, origem ou destino"
              value={flightSearch}
              onChange={(e) => setFlightSearch(e.target.value)}
            />
            <Select value={flightStatus} onValueChange={(value: 'todos' | ReservaStatus) => setFlightStatus(value)}>
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
              <p className="text-xs text-muted-foreground">Voos no filtro</p>
              <p className="text-lg font-semibold">{flightStats.total}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Confirmados</p>
              <p className="text-lg font-semibold">{flightStats.confirmed}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Custo somado</p>
              <p className="text-lg font-semibold">{formatByCurrency(flightStats.byCurrency)}</p>
            </div>
          </div>

          {flightDayChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flightDayChips.map((chip) => (
                <button
                  key={chip.day}
                  type="button"
                  className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                >
                  <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                  <p className="text-sm font-semibold">{chip.count} voo(s)</p>
                </button>
              ))}
            </div>
          )}

          {flightsLoading ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Carregando voos...
            </div>
          ) : flightsFiltered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Plane className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum voo encontrado com os filtros atuais.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleFlights.map((flight) => (
                <Card key={flight.id} className="border-border/50">
                  <CardContent className="flex flex-col gap-3 p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => onSelectFlight(flight)}
                    >
                      <p className="font-semibold">
                        {flight.numero || 'Sem número'} · {flight.companhia || 'Companhia não informada'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {flight.origem || 'Origem'} → {flight.destino || 'Destino'} · {formatDateTime(flight.data)}
                      </p>
                      <p className="mt-1 text-sm font-medium">{formatCurrency(flight.valor, flight.moeda ?? 'BRL')}</p>
                    </button>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      {statusBadge(flight.status)}
                      <div className="flex items-center gap-1.5">
                        {buildMapsUrl('route', { origin: flight.origem, destination: flight.destino }) && (
                          <Button variant="outline" size="icon" className="h-8 w-8" asChild>
                            <a href={buildMapsUrl('route', { origin: flight.origem, destination: flight.destino })!} target="_blank" rel="noopener noreferrer" aria-label="Ver rota">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Editar voo"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditFlight(flight);
                          }}
                          disabled={!canEditTrip}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <ConfirmActionButton
                          ariaLabel="Remover voo"
                          title="Remover voo"
                          description="Essa ação remove o voo definitivamente desta viagem."
                          confirmLabel="Remover"
                          disabled={!canEditTrip || isRemovingFlight}
                          onConfirm={() => void removeFlight(flight.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </ConfirmActionButton>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {!flightsLoading && flightsFiltered.length > 0 && (
            <PaginationControls
              page={flightsPagination.page}
              totalPages={flightsPagination.totalPages}
              totalItems={flightsPagination.totalItems}
              startIndex={flightsPagination.startIndex}
              endIndex={flightsPagination.endIndex}
              onPrevious={flightsPagination.previous}
              onNext={flightsPagination.next}
              canPrevious={flightsPagination.canPrevious}
              canNext={flightsPagination.canNext}
              label="voos"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={flightDetailOpen} onOpenChange={setFlightDetailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes do voo</DialogTitle>
            <DialogDescription>Informações completas do trecho selecionado.</DialogDescription>
          </DialogHeader>
          {selectedFlight && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{selectedFlight.origem || 'Origem'} → {selectedFlight.destino || 'Destino'}</p>
                    <p className="text-muted-foreground">{selectedFlight.companhia || 'Companhia'} • {selectedFlight.numero || 'Sem número'}</p>
                  </div>
                  {statusBadge(selectedFlight.status)}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Data</p>
                    <p className="font-medium">{formatDateTime(selectedFlight.data)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Valor</p>
                    <p className="font-medium">{formatCurrency(selectedFlight.valor, selectedFlight.moeda ?? 'BRL')}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Companhia</p>
                    <p className="font-medium">{selectedFlight.companhia || 'Não informada'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Trajeto</p>
                <div className="mt-3 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                    <div>
                      <p className="font-medium">{selectedFlight.origem || 'Origem'}</p>
                      <p className="text-xs text-muted-foreground">Embarque</p>
                    </div>
                  </div>
                  <div className="ml-1 h-8 w-px bg-border" />
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-3 w-3 rounded-full bg-primary/50" />
                    <div>
                      <p className="font-medium">{selectedFlight.destino || 'Destino'}</p>
                      <p className="text-xs text-muted-foreground">Chegada</p>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {buildMapsUrl('route', { origin: selectedFlight.origem, destination: selectedFlight.destino }) && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                      <a href={buildMapsUrl('route', { origin: selectedFlight.origem, destination: selectedFlight.destino })!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        Abrir rota no Google Maps
                      </a>
                    </Button>
                  )}
                  {buildGoogleFlightsUrl(selectedFlight.origem, selectedFlight.destino, selectedFlight.data) && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                      <a href={buildGoogleFlightsUrl(selectedFlight.origem, selectedFlight.destino, selectedFlight.data)!} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        Buscar no Google Flights
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
