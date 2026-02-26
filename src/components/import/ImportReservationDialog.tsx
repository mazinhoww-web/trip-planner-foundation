import { DragEvent, useEffect, useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ImportProgressCard } from '@/components/import/ImportProgressCard';
import { ImportQueuePanel } from '@/components/import/ImportQueuePanel';
import { ImportActiveItemPanel } from '@/components/import/ImportActiveItemPanel';
import { ImportUploadSection } from '@/components/import/ImportUploadSection';
import {
  ImportQueueItem,
  ReviewState,
  StepStatus,
  VISUAL_STEPS,
  VisualStepKey,
} from '@/components/import/import-types';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useDocuments, useFlights, useRestaurants, useStays, useTransports } from '@/hooks/useTripModules';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { trackProductEvent } from '@/services/productAnalytics';
import { isAllowedImportFile } from '@/services/importPipeline';
import {
  computeCriticalMissingFields,
  mergeMissingFields,
} from '@/components/import/import-helpers';
import {
  formatCurrency,
  makeQueueItem,
  queueStatusLabel,
  queueStatusVariant,
  toUserWarning,
  typeLabel,
} from '@/components/import/import-dialog-helpers';
import {
  processImportQueueItem,
  saveReviewedQueueItem,
  updateImportReviewState,
} from '@/components/import/import-dialog-actions';
import { FileUp, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function ImportReservationDialog() {
  const { user } = useAuth();
  const { currentTrip, currentTripId } = useTrip();

  const documentsModule = useDocuments();
  const flightsModule = useFlights();
  const staysModule = useStays();
  const transportsModule = useTransports();
  const restaurantsModule = useRestaurants();
  const batchGate = useFeatureGate('ff_ai_batch_high_volume');
  const reprocessGate = useFeatureGate('ff_ai_reprocess_unlimited');

  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const descriptionId = useId();
  const fileInputId = useId();

  const activeItem = useMemo(() => queue.find((item) => item.id === activeId) ?? null, [queue, activeId]);
  const maxFilesPerBatch = batchGate.enabled ? 20 : 3;
  const maxReprocessAllowed = reprocessGate.enabled ? Number.POSITIVE_INFINITY : 1;
  const canReprocessActive = !!activeItem && activeItem.extractionHistory.length < maxReprocessAllowed;

  const canProcess = queue.length > 0 && !!user && !!currentTripId && !isProcessingBatch && !isReprocessing;

  useEffect(() => {
    setShowAdvancedEditor(false);
  }, [activeId]);

  const visualProgress = useMemo(() => {
    if (!activeItem) return 0;
    const total = VISUAL_STEPS.length;
    const done = VISUAL_STEPS.reduce((count, step) => count + (activeItem.visualSteps[step.key] === 'completed' ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [activeItem]);

  const pipelineStatusText = useMemo(() => {
    if (!activeItem) return 'Selecione os arquivos e clique em “Analisar arquivos”.';
    if (activeItem.status === 'processing') return `Analisando ${activeItem.file.name}...`;
    if (activeItem.status === 'auto_extracted') return 'Dados extraídos automaticamente.';
    if (activeItem.status === 'needs_confirmation') return 'Revise o resumo rápido e confirme para salvar.';
    if (activeItem.status === 'saving') return 'Salvando no módulo correto...';
    if (activeItem.status === 'saved') return 'Arquivo salvo com sucesso.';
    if (activeItem.status === 'failed') return 'Não foi possível concluir este arquivo. Você pode tentar novamente.';
    return 'Pronto para iniciar análise.';
  }, [activeItem]);

  const setItem = (itemId: string, updater: (item: ImportQueueItem) => ImportQueueItem) => {
    setQueue((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
  };

  const setItemStep = (itemId: string, key: VisualStepKey, status: StepStatus) => {
    setItem(itemId, (item) => ({ ...item, visualSteps: { ...item.visualSteps, [key]: status } }));
  };

  const onSelectFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;

    const invalid = picked.filter((file) => !isAllowedImportFile(file));
    if (invalid.length > 0) {
      toast.error('Alguns arquivos foram ignorados por formato inválido.');
    }

    const valid = picked.filter((file) => isAllowedImportFile(file));
    const accepted = valid.slice(0, maxFilesPerBatch);
    if (valid.length > accepted.length) {
      toast.error(`No plano atual, você pode processar até ${maxFilesPerBatch} arquivo(s) por lote.`);
    }
    const nextQueue = accepted.map(makeQueueItem);
    setQueue(nextQueue);
    setActiveId(nextQueue[0]?.id ?? null);
  };

  const handleDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    onSelectFiles(event.dataTransfer?.files ?? null);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  };

  const processOneFile = async (itemId: string, options?: { reprocess?: boolean }) => {
    await processImportQueueItem({
      itemId,
      queue,
      userId: user?.id,
      currentTripId,
      currentTripDestination: currentTrip?.destino,
      documentsModule,
      setItem,
      setItemStep,
      options,
    });
  };

  const reprocessActiveItem = async () => {
    if (!activeItem || !user || !currentTripId || isProcessingBatch || isSaving || isReprocessing) return;
    if (!canReprocessActive) {
      toast.error('Limite de reprocessamento atingido no plano atual.');
      return;
    }
    setIsReprocessing(true);
    try {
      await processOneFile(activeItem.id, { reprocess: true });
      await trackProductEvent({
        eventName: 'import_reprocessed',
        featureKey: 'ff_ai_reprocess_unlimited',
        viagemId: currentTripId,
        metadata: {
          fileName: activeItem.file.name,
          attempts: activeItem.extractionHistory.length + 1,
        },
      });
      toast.success('Reprocessamento concluído. Confira o resumo antes de salvar.');
    } finally {
      setIsReprocessing(false);
    }
  };

  const runBatch = async () => {
    if (!canProcess) return;
    setIsProcessingBatch(true);

    const targets = queue.map((item) => item.id);
    await trackProductEvent({
      eventName: 'import_started',
      featureKey: 'ff_ai_import_enabled',
      viagemId: currentTripId,
      metadata: { files: targets.length },
    });
    for (const itemId of targets) {
      setActiveId(itemId);
      // eslint-disable-next-line no-await-in-loop
      await processOneFile(itemId);
    }

    setIsProcessingBatch(false);
    toast.success('Análise concluída. Confirme cada arquivo para finalizar o salvamento.');
  };

  const updateActiveReview = (updater: (review: ReviewState) => ReviewState) => {
    updateImportReviewState(activeItem, setItem, updater);
  };

  const saveActiveReviewed = async () => {
    if (!activeItem) return;
    if (activeItem.scope === 'trip_related' && !activeItem.reviewState) return;

    const reviewState = activeItem.reviewState;
    if (activeItem.scope === 'trip_related') {
      const computedMissingFields = computeCriticalMissingFields(reviewState?.type, reviewState, activeItem.scope);
      if (computedMissingFields.length > 0) {
        setItem(activeItem.id, (item) => ({
          ...item,
          status: 'needs_confirmation',
          missingFields: mergeMissingFields(item.missingFields, computedMissingFields),
          warnings: item.warnings.concat('Campos obrigatórios pendentes para confirmação final.'),
          visualSteps: {
            ...item.visualSteps,
            saving: 'failed',
          },
        }));
        setShowAdvancedEditor(true);
        toast.error('Preencha os campos críticos antes de confirmar e salvar.');
        return;
      }
    }

    setIsSaving(true);
    setItem(activeItem.id, (item) => ({ ...item, status: 'saving' }));
    setItemStep(activeItem.id, 'saving', 'in_progress');

    try {
      const result = await saveReviewedQueueItem({
        activeItem,
        currentTripId,
        currentTripDataRange: {
          data_inicio: currentTrip?.data_inicio ?? null,
          data_fim: currentTrip?.data_fim ?? null,
        },
        currentTripDestination: currentTrip?.destino,
        documentsModule,
        flightsModule,
        staysModule,
        transportsModule,
        restaurantsModule,
        setItem,
        setItemStep,
      });
      if (!result.ok) {
        setShowAdvancedEditor(true);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const resetDialogState = () => {
    setQueue([]);
    setActiveId(null);
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  const allSaved = queue.length > 0 && queue.every((item) => item.status === 'saved');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetDialogState();
      }}
    >
      <DialogTrigger asChild>
        <Button aria-label="Abrir importação de reserva" className="w-full bg-primary hover:bg-primary/90 sm:w-auto">
          <FileUp className="mr-2 h-4 w-4" />
          Importar reservas
        </Button>
      </DialogTrigger>

      <DialogContent className="tp-scroll max-h-[92vh] w-[calc(100vw-1rem)] overflow-y-auto border-primary/20 bg-gradient-to-b from-white to-slate-50/90 p-3 sm:w-full sm:max-w-5xl sm:p-6" aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Importação inteligente de reservas
          </DialogTitle>
          <DialogDescription id={descriptionId}>
            Envie vários arquivos (voo, hospedagem, transporte ou restaurante). A IA classifica e prepara confirmação final item a item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ImportUploadSection
            isDragActive={isDragActive}
            fileInputId={fileInputId}
            maxFilesPerBatch={maxFilesPerBatch}
            canProcess={canProcess}
            isProcessingBatch={isProcessingBatch}
            isReprocessing={isReprocessing}
            onRunBatch={runBatch}
            onSelectFiles={onSelectFiles}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDropFiles}
          />

          <ImportQueuePanel
            queue={queue}
            activeId={activeId}
            onSelect={setActiveId}
            typeLabel={typeLabel}
            queueStatusLabel={queueStatusLabel}
            queueStatusVariant={queueStatusVariant}
          />

          <ImportProgressCard
            activeItem={activeItem}
            visualProgress={visualProgress}
            pipelineStatusText={pipelineStatusText}
          />

          <ImportActiveItemPanel
            activeItem={activeItem}
            isSaving={isSaving}
            isReprocessing={isReprocessing}
            showAdvancedEditor={showAdvancedEditor}
            canReprocess={canReprocessActive}
            onConfirm={saveActiveReviewed}
            onReprocess={reprocessActiveItem}
            onToggleEditor={() => setShowAdvancedEditor((prev) => !prev)}
            onChangeReview={updateActiveReview}
            onPrevPhoto={() => {
              if (!activeItem) return;
              setItem(activeItem.id, (item) => ({
                ...item,
                photoIndex: item.photoIndex === 0 ? item.hotelPhotos.length - 1 : item.photoIndex - 1,
              }));
            }}
            onNextPhoto={() => {
              if (!activeItem) return;
              setItem(activeItem.id, (item) => ({
                ...item,
                photoIndex: (item.photoIndex + 1) % item.hotelPhotos.length,
              }));
            }}
            toUserWarning={toUserWarning}
            typeLabel={typeLabel}
            formatCurrency={formatCurrency}
          />

          {queue.length > 0 && (
            <Card className="border-border/50 bg-muted/20">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm text-muted-foreground">
                  {queue.filter((item) => item.status === 'saved').length} de {queue.length} arquivo(s) salvos.
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Confirme cada item para concluir a importação em lote.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} aria-label="Fechar modal de importação">Fechar</Button>
          {allSaved && (
            <Button variant="outline" onClick={resetDialogState} aria-label="Iniciar nova importação">
              Nova importação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
