import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tables } from '@/integrations/supabase/types';
import { CalendarDays, ChevronDown, ChevronUp, Clock3, ExternalLink, MapPin, Sparkles, Trash2 } from 'lucide-react';

type Props = {
  canEditTrip: boolean;
  generatingItinerary: boolean;
  onGenerateItinerary: () => Promise<void> | void;
  roteiroLoading: boolean;
  roteiroItems: Tables<'roteiro'>[];
  formatDate: (date?: string | null) => string;
  onReorder: (current: Tables<'roteiro'>, target: Tables<'roteiro'>) => Promise<void> | void;
  onRemove: (id: string) => Promise<void> | void;
};

export function RoteiroTabPanel({
  canEditTrip,
  generatingItinerary,
  onGenerateItinerary,
  roteiroLoading,
  roteiroItems,
  formatDate,
  onReorder,
  onRemove,
}: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-display text-xl">Roteiro da viagem</CardTitle>
          <Button
            variant="outline"
            disabled={!canEditTrip || generatingItinerary}
            onClick={() => void onGenerateItinerary()}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generatingItinerary ? 'Gerando roteiro...' : 'Gerar roteiro com IA'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {roteiroLoading ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Carregando roteiro...
          </div>
        ) : roteiroItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <CalendarDays className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma atividade no roteiro.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clique em "Gerar roteiro com IA" para criar um itinerário dia-a-dia com base na sua viagem.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {(() => {
              const byDay = new Map<string, Tables<'roteiro'>[]>();
              for (const item of roteiroItems) {
                const day = item.dia;
                if (!byDay.has(day)) byDay.set(day, []);
                byDay.get(day)!.push(item);
              }
              const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));

              return sortedDays.map(([day, items]) => {
                const sorted = [...items].sort((a, b) => a.ordem - b.ordem);
                return (
                  <div key={day} className="rounded-xl border bg-muted/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-display text-lg font-semibold">{formatDate(day)}</h3>
                      <Badge variant="secondary">{sorted.length} atividade(s)</Badge>
                    </div>
                    <div className="space-y-2">
                      {sorted.map((item, idx) => (
                        <div key={item.id} className="flex items-start gap-3 rounded-lg border bg-background p-3">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{item.titulo}</p>
                              {item.horario_sugerido && (
                                <Badge variant="outline" className="text-xs">
                                  <Clock3 className="mr-1 h-3 w-3" />
                                  {item.horario_sugerido}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-xs">{item.categoria}</Badge>
                            </div>
                            {item.descricao && (
                              <p className="mt-1 text-sm text-muted-foreground">{item.descricao}</p>
                            )}
                            <div className="mt-1 flex items-center gap-2">
                              {item.localizacao && (
                                <span className="flex items-center text-xs text-muted-foreground">
                                  <MapPin className="mr-1 h-3 w-3" />
                                  {item.localizacao}
                                </span>
                              )}
                              {item.link_maps && (
                                <a
                                  href={item.link_maps}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center text-xs text-primary hover:underline"
                                >
                                  <ExternalLink className="mr-1 h-3 w-3" />
                                  Maps
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={idx === 0 || !canEditTrip}
                              onClick={() => void onReorder(item, sorted[idx - 1])}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={idx === sorted.length - 1 || !canEditTrip}
                              onClick={() => void onReorder(item, sorted[idx + 1])}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            <ConfirmActionButton
                              ariaLabel="Remover atividade"
                              title="Remover atividade"
                              description="Esta atividade será removida do roteiro."
                              confirmLabel="Remover"
                              disabled={!canEditTrip}
                              onConfirm={() => void onRemove(item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </ConfirmActionButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
