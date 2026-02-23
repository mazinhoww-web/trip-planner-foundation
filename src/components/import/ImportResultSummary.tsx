import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImportQueueItem } from '@/components/import/import-types';

type Props = {
  activeItem: ImportQueueItem;
  formatCurrency: (value?: number | null, currency?: string) => string;
  onPrevPhoto: () => void;
  onNextPhoto: () => void;
};

export function ImportResultSummary({ activeItem, formatCurrency, onPrevPhoto, onNextPhoto }: Props) {
  if (!activeItem.summary) return null;

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
      <CardHeader>
        <CardTitle className="text-base">Importação concluída</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeItem.summary.type === 'hospedagem' && activeItem.hotelPhotos.length > 0 && (
          <div className="overflow-hidden rounded-xl border">
            <img
              src={activeItem.hotelPhotos[activeItem.photoIndex]}
              alt={activeItem.summary.title}
              className="h-48 w-full object-cover"
              loading="lazy"
            />
            <div className="flex flex-col gap-2 border-t bg-background px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span>Foto {activeItem.photoIndex + 1}/{activeItem.hotelPhotos.length}</span>
              <div className="grid w-full grid-cols-2 gap-1 sm:w-auto sm:flex">
                <Button type="button" size="sm" variant="outline" onClick={onPrevPhoto}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" onClick={onNextPhoto}>Próxima</Button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-background p-4">
          <p className="text-lg font-semibold">{activeItem.summary.title}</p>
          <p className="text-sm text-muted-foreground">{activeItem.summary.subtitle}</p>
          {activeItem.summary.amount != null && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Total original</p>
                <p className="font-semibold">{formatCurrency(activeItem.summary.amount, activeItem.summary.currency)}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Estimado em BRL</p>
                <p className="font-semibold">{formatCurrency(activeItem.summary.estimatedBrl, 'BRL')}</p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
