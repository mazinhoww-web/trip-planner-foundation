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
  onToggleEditor: () => void;
  typeLabel: (type: ImportType | null | undefined) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
};

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

export function ImportConfirmationCard({
  activeItem,
  isSaving,
  showAdvancedEditor,
  onConfirm,
  onToggleEditor,
  typeLabel,
  formatCurrency,
}: Props) {
  if (activeItem.status !== 'needs_confirmation' && activeItem.status !== 'saving') return null;

  const review = activeItem.reviewState;
  const scopeOutside = activeItem.scope === 'outside_scope';

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Confirmação final</CardTitle>
          <div className="flex items-center gap-2">
            {confidenceBadge(activeItem.typeConfidence ?? activeItem.confidence)}
            <Badge variant="outline">{qualityLabel(activeItem.extractionQuality)}</Badge>
            <Badge variant="outline">{scopeOutside ? 'Fora de escopo' : typeLabel(activeItem.identifiedType)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {scopeOutside ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-medium">Arquivo sem relação direta com planejamento de viagem.</p>
            <p className="mt-1 text-muted-foreground">
              O arquivo será mantido apenas em Documentos, sem criar reserva em voo/hospedagem/transporte.
            </p>
          </div>
        ) : review?.type === 'voo' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.voo.numero || 'Voo sem número'} · {review.voo.companhia || 'Companhia não identificada'}</p>
            <p className="text-muted-foreground">{review.voo.origem || 'Origem'} → {review.voo.destino || 'Destino'}</p>
            <p className="text-muted-foreground">{review.voo.data || 'Data não identificada'}</p>
            <p className="mt-1 font-medium">{formatCurrency(review.voo.valor ? Number(review.voo.valor) : null, review.voo.moeda || 'BRL')}</p>
          </div>
        ) : review?.type === 'hospedagem' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.hospedagem.nome || 'Hospedagem sem nome'}</p>
            <p className="text-muted-foreground">{review.hospedagem.localizacao || 'Local não identificado'}</p>
            <p className="text-muted-foreground">
              {review.hospedagem.check_in || 'Check-in ?'} até {review.hospedagem.check_out || 'Check-out ?'}
            </p>
            <p className="mt-1 font-medium">{formatCurrency(review.hospedagem.valor ? Number(review.hospedagem.valor) : null, review.hospedagem.moeda || 'BRL')}</p>
          </div>
        ) : review?.type === 'transporte' ? (
          <div className="rounded-lg border bg-background p-3 text-sm">
            <p className="font-semibold">{review.transporte.tipo || 'Transporte'}</p>
            <p className="text-muted-foreground">{review.transporte.origem || 'Origem'} → {review.transporte.destino || 'Destino'}</p>
            <p className="text-muted-foreground">{review.transporte.data || 'Data não identificada'}</p>
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
