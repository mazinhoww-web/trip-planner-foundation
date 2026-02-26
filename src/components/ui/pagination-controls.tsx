import { Button } from '@/components/ui/button';

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
  label?: string;
};

export function PaginationControls({
  page,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  label = 'itens',
}: PaginationControlsProps) {
  if (totalItems <= 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/15 p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Exibindo {startIndex + 1}-{endIndex} de {totalItems} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={!canPrevious}>
          Anterior
        </Button>
        <span className="text-xs text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={!canNext}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
