import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportQueueItem } from '@/components/import/import-types';
import { ImportType } from '@/services/importPipeline';
import { Loader2 } from 'lucide-react';

type Props = {
  activeItem: ImportQueueItem;
  isSaving: boolean;
  showAdvancedEditor: boolean;
  onConfirm: () => void;
  onReprocess: () => void;
  canReprocess: boolean;
  onToggleEditor: () => void;
  typeLabel: (type: ImportType | null | undefined) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
};

const MISSING_FIELD_LABELS: Record<string, string> = {
  'metadata.tipo': 'Tipo da reserva',
  'metadata.confianca': 'Confiança da extração',
  'dados_principais.nome_exibicao': 'Nome para exibição',
  'dados_principais.provedor': 'Provedor/companhia',
  'dados_principais.codigo_reserva': 'Código da reserva',
  'dados_principais.passageiro_hospede': 'Passageiro/hóspede',
  'dados_principais.data_inicio': 'Data de início',
  'dados_principais.hora_inicio': 'Hora de início',
  'dados_principais.data_fim': 'Data de fim',
  'dados_principais.hora_fim': 'Hora de fim',
  'dados_principais.origem': 'Origem',
  'dados_principais.destino': 'Destino',
  'financeiro.valor_total': 'Valor total',
  'financeiro.moeda': 'Moeda',
  'financeiro.metodo': 'Método de pagamento',
  'financeiro.pontos_utilizados': 'Pontos/milhas utilizados',
  'enriquecimento_ia.dica_viagem': 'Dica de viagem',
  'enriquecimento_ia.como_chegar': 'Como chegar',
  'enriquecimento_ia.atracoes_proximas': 'Atrações próximas',
  'enriquecimento_ia.restaurantes_proximos': 'Restaurantes próximos',
  'voo.origem': 'Origem do voo',
  'voo.destino': 'Destino do voo',
  'voo.data_inicio': 'Data do voo',
  'voo.identificador': 'Código da reserva ou número do voo',
  'hospedagem.nome_exibicao': 'Nome da hospedagem',
  'hospedagem.data_inicio': 'Check-in',
  'hospedagem.data_fim': 'Check-out',
  'hospedagem.valor_total': 'Valor total da hospedagem',
  'transporte.origem': 'Origem do transporte',
  'transporte.destino': 'Destino do transporte',
  'transporte.data_inicio': 'Data do transporte',
  'restaurante.nome': 'Nome do restaurante',
  'restaurante.cidade': 'Cidade do restaurante',
  review_manual_requerida: 'Validação manual recomendada',
};

const MISSING_FIELD_PRIORITY: Record<string, number> = {
  'voo.origem': 1,
  'voo.destino': 2,
  'voo.data_inicio': 3,
  'voo.identificador': 4,
  'hospedagem.nome_exibicao': 1,
  'hospedagem.data_inicio': 2,
  'hospedagem.data_fim': 3,
  'hospedagem.valor_total': 4,
  'transporte.origem': 1,
  'transporte.destino': 2,
  'transporte.data_inicio': 3,
  'restaurante.nome': 1,
  'restaurante.cidade': 2,
};

export function toMissingFieldLabel(field: string) {
  return MISSING_FIELD_LABELS[field] ?? field;
}

function confidenceBadge(confidence: number | null) {
  if (confidence == null) return <Badge variant="secondary">Confiança não informada</Badge>;
  if (confidence >= 0.75) return <Badge className="bg-emerald-600">Confiança alta · {Math.round(confidence * 100)}%</Badge>;
  if (confidence >= 0.55) return <Badge className="bg-amber-500 text-amber-950">Confiança média · {Math.round(confidence * 100)}%</Badge>;
  return <Badge variant="destructive">Confiança baixa · {Math.round(confidence * 100)}%</Badge>;
}

function qualityLabel(value: ImportQueueItem['extractionQuality']) {
  if (value === 'high') return 'Qualidade alta';
  if (value === 'medium') return 'Qualidade média';
  return 'Qualidade baixa';
}

function formatSnapshotDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed);
}

function prioritizeMissingFields(fields: string[]) {
  return [...fields].sort((a, b) => {
    const priorityA = MISSING_FIELD_PRIORITY[a] ?? 99;
    const priorityB = MISSING_FIELD_PRIORITY[b] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;
    return a.localeCompare(b);
  });
}

export function ImportConfirmationCard({
  activeItem,
  isSaving,
  showAdvancedEditor,
  onConfirm,
  onReprocess,
  canReprocess,
  onToggleEditor,
  typeLabel,
  formatCurrency,
}: Props) {
  if (activeItem.status !== 'needs_confirmation' && activeItem.status !== 'saving') return null;

  const review = activeItem.reviewState;
  const scopeOutside = activeItem.scope === 'outside_scope';
  const flightDateLabel = review?.voo.data_inicio ? `${review.voo.data_inicio}${review.voo.hora_inicio ? ` ${review.voo.hora_inicio}` : ''}` : 'Data não identificada';
  const stayDateLabel = review?.hospedagem.check_in
    ? `${review.hospedagem.check_in}${review.hospedagem.hora_inicio ? ` ${review.hospedagem.hora_inicio}` : ''}`
    : 'Check-in ?';
  const stayEndDateLabel = review?.hospedagem.check_out
    ? `${review.hospedagem.check_out}${review.hospedagem.hora_fim ? ` ${review.hospedagem.hora_fim}` : ''}`
    : 'Check-out ?';
  const transportDateLabel = review?.transporte.data_inicio
    ? `${review.transporte.data_inicio}${review.transporte.hora_inicio ? ` ${review.transporte.hora_inicio}` : ''}`
    : 'Data não identificada';
  const missingCritical = prioritizeMissingFields([...new Set(activeItem.missingFields)])
    .slice(0, 5)
    .map(toMissingFieldLabel);
  const lastSnapshot = activeItem.extractionHistory[0];

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Confirmação final</CardTitle>
          <div className="flex items-center gap-2">
            {confidenceBadge(activeItem.typeConfidence ?? activeItem.confidence)}
            <Badge variant="outline">{qualityLabel(activeItem.extractionQuality)}</Badge>
            <Badge variant="outline">{scopeOutside ? 'Fora de escopo' : typeLabel(activeItem.identifiedType)}</Badge>
            {activeItem.providerMeta?.selected ? (
              <Badge variant="outline">Fonte IA: {activeItem.providerMeta.selected}</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {missingCritical.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="font-medium text-amber-950">Campos críticos para confirmar</p>
            <p className="mt-1 text-amber-900">
              {missingCritical.join(' · ')}
            </p>
          </div>
        )}
        {activeItem.extractionHistory.length > 0 && (
          <div className="rounded-lg border border-muted bg-background p-3 text-xs text-muted-foreground">
            <p>
              Este item já foi reprocessado {activeItem.extractionHistory.length}x. A versão anterior foi preservada para comparação.
            </p>
            {lastSnapshot ? (
              <p className="mt-1">
                Última versão anterior: {formatSnapshotDate(lastSnapshot.capturedAt)}
                {lastSnapshot.provider ? ` · ${lastSnapshot.provider}` : ''}
                {lastSnapshot.confidence != null ? ` · ${Math.round(lastSnapshot.confidence * 100)}%` : ''}
              </p>
            ) : null}
          </div>
        )}

        {scopeOutside ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-medium">Arquivo sem relação direta com planejamento de viagem.</p>
            <p className="mt-1 text-muted-foreground">
              O arquivo será mantido apenas em Documentos, sem criar reserva em voo/hospedagem/transporte.
            </p>
          </div>
        ) : review?.type === 'voo' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.voo.nome_exibicao || review.voo.numero || 'Voo sem número'} · {review.voo.companhia || review.voo.provedor || 'Companhia não identificada'}</p>
            <p className="text-muted-foreground">{review.voo.origem || 'Origem'} → {review.voo.destino || 'Destino'}</p>
            <p className="text-muted-foreground">{flightDateLabel}</p>
            <p className="mt-1 font-medium">{formatCurrency(review.voo.valor ? Number(review.voo.valor) : null, review.voo.moeda || 'BRL')}</p>
          </div>
        ) : review?.type === 'hospedagem' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.hospedagem.nome || review.hospedagem.nome_exibicao || 'Hospedagem sem nome'}</p>
            <p className="text-muted-foreground">{review.hospedagem.localizacao || 'Local não identificado'}</p>
            <p className="text-muted-foreground">
              {stayDateLabel} até {stayEndDateLabel}
            </p>
            <p className="mt-1 font-medium">{formatCurrency(review.hospedagem.valor ? Number(review.hospedagem.valor) : null, review.hospedagem.moeda || 'BRL')}</p>
          </div>
        ) : review?.type === 'transporte' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.transporte.nome_exibicao || review.transporte.tipo || 'Transporte'}</p>
            <p className="text-muted-foreground">{review.transporte.origem || 'Origem'} → {review.transporte.destino || 'Destino'}</p>
            <p className="text-muted-foreground">{transportDateLabel}</p>
            <p className="mt-1 font-medium">{formatCurrency(review.transporte.valor ? Number(review.transporte.valor) : null, review.transporte.moeda || 'BRL')}</p>
          </div>
        ) : review?.type === 'restaurante' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.restaurante.nome || 'Restaurante sem nome'}</p>
            <p className="text-muted-foreground">{review.restaurante.cidade || 'Cidade não identificada'}</p>
            <p className="text-muted-foreground">{review.restaurante.tipo || 'Tipo não identificado'}</p>
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-3 text-sm text-muted-foreground">
            Não foi possível montar o resumo automaticamente.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onReprocess} disabled={!canReprocess}>
            Reprocessar IA
          </Button>
          {!scopeOutside && review && (
            <Button type="button" variant="outline" onClick={onToggleEditor}>
              {showAdvancedEditor ? 'Ocultar edição detalhada' : 'Editar detalhes'}
            </Button>
          )}
          <Button type="button" onClick={onConfirm} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {scopeOutside ? 'Confirmar: salvar só em documentos' : 'Confirmar e salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
