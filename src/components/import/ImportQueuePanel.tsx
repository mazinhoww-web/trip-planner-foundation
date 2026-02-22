import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportQueueItem, QueueStatus } from '@/components/import/import-types';
import { ImportType } from '@/services/importPipeline';

type Props = {
  queue: ImportQueueItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  typeLabel: (type: ImportType | null | undefined) => string;
  queueStatusLabel: (status: QueueStatus) => string;
  queueStatusVariant: (status: QueueStatus) => 'secondary' | 'default' | 'destructive';
};

export function ImportQueuePanel({
  queue,
  activeId,
  onSelect,
  typeLabel,
  queueStatusLabel,
  queueStatusVariant,
}: Props) {
  if (queue.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Fila de importação</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {queue.map((item) => {
            const isActive = item.id === activeId;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`rounded-lg border p-3 text-left transition ${isActive ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/40'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-medium">{item.file.name}</p>
                  <Badge variant={queueStatusVariant(item.status)}>{queueStatusLabel(item.status)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {typeLabel(item.identifiedType)} {item.confidence != null ? `· confiança ${Math.round(item.confidence * 100)}%` : ''}
                </p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
