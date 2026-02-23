import { Check, Circle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportQueueItem, VISUAL_STEPS } from '@/components/import/import-types';

type Props = {
  activeItem: ImportQueueItem | null;
  visualProgress: number;
  pipelineStatusText: string;
};

export function ImportProgressCard({ activeItem, visualProgress, pipelineStatusText }: Props) {
  if (!activeItem) return null;

  return (
    <Card className="border-primary/15 bg-white/95 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Análise do arquivo selecionado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/20 px-3 py-2" role="status" aria-live="polite">
          <p className="text-sm font-medium">{activeItem.file.name}</p>
          <p className="text-xs text-muted-foreground">{pipelineStatusText}</p>
        </div>

        <div className="space-y-2" aria-label={`Progresso ${visualProgress}%`}>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
              style={{ width: `${visualProgress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{visualProgress}% concluído</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {VISUAL_STEPS.map((step, index) => {
            const status = activeItem.visualSteps[step.key];
            const isDone = status === 'completed';
            const isActive = status === 'in_progress';
            const isFailed = status === 'failed';
            return (
              <div key={step.key} className="relative flex flex-col items-center gap-2 text-center">
                {index < VISUAL_STEPS.length - 1 && (
                  <span
                    className={`absolute left-[calc(50%+1rem)] top-4 hidden h-0.5 w-[calc(100%-2rem)] lg:block ${isDone ? 'bg-primary' : 'bg-border'}`}
                  />
                )}
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                    isDone
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isActive
                        ? 'border-primary bg-primary/10 text-primary'
                        : isFailed
                          ? 'border-amber-500 bg-amber-500/10 text-amber-700'
                          : 'border-border bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4" /> : isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-3 w-3" />}
                </div>
                <p className="text-xs">{step.label}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
