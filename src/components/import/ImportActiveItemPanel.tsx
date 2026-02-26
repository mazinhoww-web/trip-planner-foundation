import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportConfirmationCard } from '@/components/import/ImportConfirmationCard';
import { ImportResultSummary } from '@/components/import/ImportResultSummary';
import { ImportReviewFormByType } from '@/components/import/ImportReviewFormByType';
import { ImportQueueItem, ReviewState } from '@/components/import/import-types';
import { ImportType } from '@/services/importPipeline';
import { Loader2 } from 'lucide-react';

type ImportActiveItemPanelProps = {
  activeItem: ImportQueueItem | null;
  isSaving: boolean;
  isReprocessing: boolean;
  showAdvancedEditor: boolean;
  canReprocess: boolean;
  onConfirm: () => void;
  onReprocess: () => void;
  onToggleEditor: () => void;
  onChangeReview: (updater: (review: ReviewState) => ReviewState) => void;
  onPrevPhoto: () => void;
  onNextPhoto: () => void;
  toUserWarning: (text: string) => string;
  typeLabel: (type: ImportType | null | undefined) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
};

export function ImportActiveItemPanel({
  activeItem,
  isSaving,
  isReprocessing,
  showAdvancedEditor,
  canReprocess,
  onConfirm,
  onReprocess,
  onToggleEditor,
  onChangeReview,
  onPrevPhoto,
  onNextPhoto,
  toUserWarning,
  typeLabel,
  formatCurrency,
}: ImportActiveItemPanelProps) {
  if (!activeItem) return null;

  return (
    <>
      {activeItem.warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5" role="alert">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ajustes necessários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {activeItem.warnings.map((warning) => (
              <p key={`${activeItem.id}-${warning}`}>- {toUserWarning(warning)}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {activeItem.status === 'failed' && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Não foi possível finalizar este arquivo. Você pode tentar o processamento novamente.
            </p>
            <Button type="button" variant="outline" onClick={onReprocess} disabled={isReprocessing || isSaving}>
              {isReprocessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {activeItem.status !== 'saved' && (
        <ImportConfirmationCard
          activeItem={activeItem}
          isSaving={isSaving}
          showAdvancedEditor={showAdvancedEditor}
          onConfirm={onConfirm}
          onReprocess={onReprocess}
          canReprocess={!isReprocessing && !isSaving && activeItem.status !== 'saving' && canReprocess}
          onToggleEditor={onToggleEditor}
          typeLabel={typeLabel}
          formatCurrency={formatCurrency}
        />
      )}

      {activeItem.reviewState && showAdvancedEditor && (
        <ImportReviewFormByType
          reviewState={activeItem.reviewState}
          missingFieldsCount={activeItem.missingFields.length}
          onChange={onChangeReview}
        />
      )}

      {activeItem.summary && (
        <ImportResultSummary
          activeItem={activeItem}
          formatCurrency={formatCurrency}
          onPrevPhoto={onPrevPhoto}
          onNextPhoto={onNextPhoto}
        />
      )}
    </>
  );
}
