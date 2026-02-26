import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tables } from '@/integrations/supabase/types';
import { ExternalLink, Hotel, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';

const TripOpenMap = lazy(() =>
  import('@/components/map/TripOpenMap').then((mod) => ({ default: mod.TripOpenMap })),
);

type ReservaStatus = 'confirmado' | 'pendente' | 'cancelado';

type StayFormState = {
  nome: string;
  localizacao: string;
  check_in: string;
  check_out: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
  dica_viagem: string;
  como_chegar: string;
  atracoes_proximas: string;
  restaurantes_proximos: string;
  dica_ia: string;
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

type StayStats = {
  total: number;
  active: number;
  byCurrency: CurrencyTotal[];
  cities: number;
};

type CoverageGap = {
  start: string;
  end: string;
};

type TransportCoverageGap = {
  from: string;
  to: string;
  reason: string;
};

type Props = {
  canEditTrip: boolean;
  stayDialogOpen: boolean;
  setStayDialogOpen: (open: boolean) => void;
  openCreateStay: () => void;
  editingStay: Tables<'hospedagens'> | null;
  stayForm: StayFormState;
  setStayForm: Dispatch<SetStateAction<StayFormState>>;
  submitStay: () => Promise<void> | void;
  isCreatingStay: boolean;
  isUpdatingStay: boolean;
  staySearch: string;
  setStaySearch: (value: string) => void;
  stayStatus: 'todos' | ReservaStatus;
  setStayStatus: (value: 'todos' | ReservaStatus) => void;
  stayStats: StayStats;
  stayNightsTotal: number;
  formatByCurrency: (items: CurrencyTotal[]) => string;
  stayDayChips: DayChip[];
  isAnyCrudDialogOpen: boolean;
  staysFiltered: Tables<'hospedagens'>[];
  transports: Tables<'transportes'>[];
  flights: Tables<'voos'>[];
  stayCoverageGaps: CoverageGap[];
  transportCoverageGaps: TransportCoverageGap[];
  formatDateShort: (date?: string | null) => string;
  staysLoading: boolean;
  statusBadge: (status: ReservaStatus) => ReactNode;
  buildMapsUrl: (
    type: 'route' | 'search',
    opts: { origin?: string | null; destination?: string | null; query?: string | null },
  ) => string | null;
  onEnrichStay: (stay: Tables<'hospedagens'>) => Promise<void> | void;
  onSuggestRestaurants: (stay: Tables<'hospedagens'>) => Promise<void> | void;
  onOpenStayDetail: (stay: Tables<'hospedagens'>) => void;
  openEditStay: (stay: Tables<'hospedagens'>) => void;
  removeStay: (id: string) => Promise<void> | void;
  isRemovingStay: boolean;
  enrichingStayId: string | null;
  suggestingRestaurantsStayId: string | null;
  stayDetailOpen: boolean;
  setStayDetailOpen: (open: boolean) => void;
  selectedStay: Tables<'hospedagens'> | null;
  formatDate: (date?: string | null) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
  splitInsightList: (value?: string | null) => string[];
  stayHighlight: (stay: Tables<'hospedagens'>) => string;
  selectedStayDocuments: Tables<'documentos'>[];
  openSupportDocument: (path: string | null) => Promise<void> | void;
  openingDocumentPath: string | null;
  downloadSupportDocument: (path: string | null, fileName?: string | null) => Promise<void> | void;
  downloadingDocumentPath: string | null;
  removeDocument: (id: string) => Promise<void> | void;
};

export function StaysTabPanel({
  canEditTrip,
  stayDialogOpen,
  setStayDialogOpen,
  openCreateStay,
  editingStay,
  stayForm,
  setStayForm,
  submitStay,
  isCreatingStay,
  isUpdatingStay,
  staySearch,
  setStaySearch,
  stayStatus,
  setStayStatus,
  stayStats,
  stayNightsTotal,
  formatByCurrency,
  stayDayChips,
  isAnyCrudDialogOpen,
  staysFiltered,
  transports,
  flights,
  stayCoverageGaps,
  transportCoverageGaps,
  formatDateShort,
  staysLoading,
  statusBadge,
  buildMapsUrl,
  onEnrichStay,
  onSuggestRestaurants,
  onOpenStayDetail,
  openEditStay,
  removeStay,
  isRemovingStay,
  enrichingStayId,
  suggestingRestaurantsStayId,
  stayDetailOpen,
  setStayDetailOpen,
  selectedStay,
  formatDate,
  formatCurrency,
  splitInsightList,
  stayHighlight,
  selectedStayDocuments,
  openSupportDocument,
  openingDocumentPath,
  downloadSupportDocument,
  downloadingDocumentPath,
  removeDocument,
}: Props) {
  return (
    <>
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="font-display text-xl">Gestão de hospedagens</CardTitle>
            <Dialog open={stayDialogOpen} onOpenChange={setStayDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreateStay} disabled={!canEditTrip}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova hospedagem
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{editingStay ? 'Editar hospedagem' : 'Nova hospedagem'}</DialogTitle>
                  <DialogDescription>
                    Cadastro completo com detalhes ricos da hospedagem.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-2 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={stayForm.nome} onChange={(e) => setStayForm((s) => ({ ...s, nome: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Localização</Label>
                    <Input value={stayForm.localizacao} onChange={(e) => setStayForm((s) => ({ ...s, localizacao: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Check-in</Label>
                    <Input type="date" value={stayForm.check_in} onChange={(e) => setStayForm((s) => ({ ...s, check_in: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Check-out</Label>
                    <Input type="date" value={stayForm.check_out} onChange={(e) => setStayForm((s) => ({ ...s, check_out: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={stayForm.status} onValueChange={(value: ReservaStatus) => setStayForm((s) => ({ ...s, status: value }))}>
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
                    <Input type="number" step="0.01" value={stayForm.valor} onChange={(e) => setStayForm((s) => ({ ...s, valor: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Moeda</Label>
                    <Input value={stayForm.moeda} onChange={(e) => setStayForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Dica de viagem</Label>
                    <Textarea value={stayForm.dica_viagem} onChange={(e) => setStayForm((s) => ({ ...s, dica_viagem: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Como chegar</Label>
                    <Textarea value={stayForm.como_chegar} onChange={(e) => setStayForm((s) => ({ ...s, como_chegar: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Atrações próximas</Label>
                    <Textarea value={stayForm.atracoes_proximas} onChange={(e) => setStayForm((s) => ({ ...s, atracoes_proximas: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Restaurantes próximos</Label>
                    <Textarea value={stayForm.restaurantes_proximos} onChange={(e) => setStayForm((s) => ({ ...s, restaurantes_proximos: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2 space-y-2">
                    <Label>Dica IA</Label>
                    <Textarea value={stayForm.dica_ia} onChange={(e) => setStayForm((s) => ({ ...s, dica_ia: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setStayDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => void submitStay()} disabled={!canEditTrip || isCreatingStay || isUpdatingStay}>
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
              placeholder="Buscar por nome ou localização"
              value={staySearch}
              onChange={(e) => setStaySearch(e.target.value)}
            />
            <Select value={stayStatus} onValueChange={(value: 'todos' | ReservaStatus) => setStayStatus(value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Hospedagens</p>
              <p className="text-lg font-semibold">{stayStats.total}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Noites cobertas</p>
              <p className="text-lg font-semibold">{stayNightsTotal}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Cidades</p>
              <p className="text-lg font-semibold">{stayStats.cities}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Custo somado</p>
              <p className="text-lg font-semibold">{formatByCurrency(stayStats.byCurrency)}</p>
            </div>
          </div>

          {stayDayChips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stayDayChips.map((chip) => (
                <button
                  key={chip.day}
                  type="button"
                  className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                >
                  <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                  <p className="text-sm font-semibold">{chip.count} check-in(s)</p>
                </button>
              ))}
            </div>
          )}

          {isAnyCrudDialogOpen ? (
            <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              Mapa temporariamente oculto enquanto um modal está aberto.
            </div>
          ) : (
            <Suspense fallback={<div className="h-[280px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
              <TripOpenMap
                stays={staysFiltered}
                transports={transports}
                flights={flights}
                height="clamp(200px, 36vh, 280px)"
                disabled={isAnyCrudDialogOpen}
                background
              />
            </Suspense>
          )}

          {(stayCoverageGaps.length > 0 || transportCoverageGaps.length > 0) && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-3 text-sm">
              {stayCoverageGaps.length > 0 && (
                <p className="mb-1 text-amber-900">
                  {stayCoverageGaps.length} intervalo(s) sem hospedagem: {stayCoverageGaps.slice(0, 2).map((gap) => `${formatDateShort(gap.start)}-${formatDateShort(gap.end)}`).join(', ')}
                </p>
              )}
              {transportCoverageGaps.length > 0 && (
                <p className="text-amber-900">
                  {transportCoverageGaps.length} troca(s) de cidade sem transporte registrado.
                </p>
              )}
            </div>
          )}

          {staysLoading ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Carregando hospedagens...
            </div>
          ) : staysFiltered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Hotel className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma hospedagem encontrada com os filtros atuais.</p>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {staysFiltered.map((stay) => (
                <Card key={stay.id} className="border-border/50">
                  <CardContent className="space-y-2 p-4">
                    <div className="w-full text-left">
                      <p className="font-semibold">{stay.nome || 'Hospedagem sem nome'}</p>
                      <p className="text-sm text-muted-foreground">{stay.localizacao || 'Localização não informada'}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(stay.check_in)} até {formatDate(stay.check_out)}
                      </p>
                      <p className="text-sm font-medium">{formatCurrency(stay.valor, stay.moeda ?? 'BRL')}</p>
                    </div>
                    {buildMapsUrl('search', { query: [stay.nome, stay.localizacao].filter(Boolean).join(' ') }) && (
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                        <a href={buildMapsUrl('search', { query: [stay.nome, stay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                          <MapPin className="h-3 w-3" />
                          Ver no Google Maps
                        </a>
                      </Button>
                    )}
                    <div className="flex items-center justify-between">
                      {statusBadge(stay.status)}
                      <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onEnrichStay(stay);
                          }}
                          disabled={!canEditTrip || enrichingStayId === stay.id}
                        >
                          {enrichingStayId === stay.id ? 'Gerando...' : 'Gerar dicas IA'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={(event) => {
                            event.stopPropagation();
                            void onSuggestRestaurants(stay);
                          }}
                          disabled={!canEditTrip || suggestingRestaurantsStayId === stay.id}
                        >
                          {suggestingRestaurantsStayId === stay.id ? 'Sugerindo...' : 'Sugerir restaurantes'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenStayDetail(stay);
                          }}
                        >
                          Ver detalhes
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Editar hospedagem"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditStay(stay);
                          }}
                          disabled={!canEditTrip}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmActionButton
                          ariaLabel="Remover hospedagem"
                          title="Remover hospedagem"
                          description="A hospedagem será removida do roteiro e não poderá ser recuperada."
                          confirmLabel="Remover"
                          disabled={!canEditTrip || isRemovingStay}
                          onConfirm={() => void removeStay(stay.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ConfirmActionButton>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={stayDetailOpen && !stayDialogOpen} onOpenChange={setStayDetailOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalhes da hospedagem</DialogTitle>
            <DialogDescription>Visão rica com informações de apoio da estadia.</DialogDescription>
          </DialogHeader>
          {selectedStay && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-lg font-semibold">{selectedStay.nome || 'Hospedagem'}</p>
                    <p className="text-muted-foreground">{selectedStay.localizacao || 'Localização não informada'}</p>
                  </div>
                  {statusBadge(selectedStay.status)}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Check-in</p>
                    <p className="font-medium">{formatDate(selectedStay.check_in)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Check-out</p>
                    <p className="font-medium">{formatDate(selectedStay.check_out)}</p>
                  </div>
                  <div className="rounded-lg border bg-background p-2">
                    <p className="text-[11px] text-muted-foreground">Valor</p>
                    <p className="font-medium">{formatCurrency(selectedStay.valor, selectedStay.moeda ?? 'BRL')}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Mapa da hospedagem</p>
                <div className="mt-2">
                  <Suspense fallback={<div className="h-[220px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
                    <TripOpenMap stays={[selectedStay]} transports={[]} height="clamp(180px, 32vh, 220px)" />
                  </Suspense>
                </div>
                {buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') }) && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5 text-xs" asChild>
                    <a href={buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Abrir no Google Maps
                    </a>
                  </Button>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Como chegar</p>
                <p className="mt-2 text-muted-foreground">{selectedStay.como_chegar || 'Sem instruções de chegada ainda.'}</p>
                {buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') }) && (
                  <Button variant="outline" size="sm" className="mt-2 gap-1.5 text-xs" asChild>
                    <a href={buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                      <MapPin className="h-3 w-3" />
                      Abrir no Google Maps
                    </a>
                  </Button>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Atrações turísticas</p>
                {splitInsightList(selectedStay.atracoes_proximas).length === 0 ? (
                  <p className="mt-2 text-muted-foreground">Sem atrações cadastradas.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {splitInsightList(selectedStay.atracoes_proximas).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Restaurantes recomendados</p>
                {splitInsightList(selectedStay.restaurantes_proximos).length === 0 ? (
                  <p className="mt-2 text-muted-foreground">Sem restaurantes sugeridos.</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {splitInsightList(selectedStay.restaurantes_proximos).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border bg-primary/5 p-3">
                <p className="font-semibold text-primary">Dicas personalizadas</p>
                <p className="mt-2 text-muted-foreground">{stayHighlight(selectedStay)}</p>
                {selectedStay.dica_ia && (
                  <div className="mt-2 rounded-md border bg-background/80 p-2 text-xs text-muted-foreground">
                    {selectedStay.dica_ia}
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Checklist de chegada</p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <label className="flex items-center gap-2"><input type="checkbox" /> Validar horário de check-in</label>
                  <label className="flex items-center gap-2"><input type="checkbox" /> Confirmar Wi-Fi / café da manhã</label>
                  <label className="flex items-center gap-2"><input type="checkbox" /> Revisar política de cancelamento</label>
                  <label className="flex items-center gap-2"><input type="checkbox" /> Salvar comprovante offline</label>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="font-semibold">Voucher / Comprovante</p>
                {selectedStayDocuments.length === 0 ? (
                  <p className="mt-2 text-muted-foreground">Nenhum comprovante associado automaticamente.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedStayDocuments.slice(0, 3).map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-md border bg-background p-2">
                        <div>
                          <p className="font-medium">{doc.nome}</p>
                          <p className="text-xs text-muted-foreground">{doc.tipo || 'Documento importado'}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openSupportDocument(doc.arquivo_url)}
                            disabled={openingDocumentPath === doc.arquivo_url}
                          >
                            {openingDocumentPath === doc.arquivo_url ? 'Abrindo...' : 'Abrir'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void downloadSupportDocument(doc.arquivo_url, doc.nome)}
                            disabled={downloadingDocumentPath === doc.arquivo_url}
                          >
                            {downloadingDocumentPath === doc.arquivo_url ? 'Baixando...' : 'Baixar'}
                          </Button>
                          <ConfirmActionButton
                            ariaLabel="Remover comprovante"
                            title="Remover comprovante"
                            description="O comprovante será removido da viagem."
                            confirmLabel="Remover"
                            onConfirm={() => void removeDocument(doc.id)}
                            disabled={!canEditTrip}
                          >
                            <Trash2 className="h-4 w-4" />
                          </ConfirmActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onEnrichStay(selectedStay)}
                  disabled={!canEditTrip || enrichingStayId === selectedStay.id}
                >
                  {enrichingStayId === selectedStay.id ? 'Gerando...' : 'Regenerar dicas IA'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onSuggestRestaurants(selectedStay)}
                  disabled={!canEditTrip || suggestingRestaurantsStayId === selectedStay.id}
                >
                  {suggestingRestaurantsStayId === selectedStay.id ? 'Sugerindo...' : 'Sugerir restaurantes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
