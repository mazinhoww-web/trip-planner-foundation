import { useEffect, useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImportProgressCard } from '@/components/import/ImportProgressCard';
import { ImportQueuePanel } from '@/components/import/ImportQueuePanel';
import { ImportResultSummary } from '@/components/import/ImportResultSummary';
import { ImportReviewFormByType } from '@/components/import/ImportReviewFormByType';
import { ImportConfirmationCard } from '@/components/import/ImportConfirmationCard';
import {
  defaultVisualSteps,
  ImportSummary,
  ImportQueueItem,
  QueueStatus,
  ReviewState,
  StepStatus,
  VISUAL_STEPS,
  VisualStepKey,
} from '@/components/import/import-types';
import { TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useDocuments, useFlights, useRestaurants, useStays, useTransports } from '@/hooks/useTripModules';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { generateStayTips } from '@/services/ai';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';
import { computeFileHash, findImportedDocumentByHash, withImportHash } from '@/services/importPersist';
import { trackProductEvent } from '@/services/productAnalytics';
import { dispatchTripWebhook } from '@/services/webhooks';
import {
  ExtractedReservation,
  ImportType,
  extractReservationStructured,
  isAllowedImportFile,
  runOcrDocument,
  tryExtractNativeText,
  uploadImportFile,
} from '@/services/importPipeline';
import {
  computeCriticalMissingFields,
  inferFallbackExtraction,
  mapCanonicalTypeToImportType,
  mergeMissingFields,
  resolveImportScope,
  resolveImportType,
  toDateInput,
  toDateTimeInput,
  toIsoDateTime,
  toTimeInput,
} from '@/components/import/import-helpers';
import { FileUp, Loader2, WandSparkles, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function toReviewState(extracted: ExtractedReservation, resolvedType: ImportType): ReviewState {
  const canonical = extracted.canonical;
  const tipoFromCanonical = mapCanonicalTypeToImportType(canonical?.metadata?.tipo);
  const finalType = tipoFromCanonical ?? resolvedType;
  const startDate = canonical?.dados_principais?.data_inicio ?? null;
  const endDate = canonical?.dados_principais?.data_fim ?? null;
  const startTime = canonical?.dados_principais?.hora_inicio ?? null;
  const endTime = canonical?.dados_principais?.hora_fim ?? null;
  const provider = canonical?.dados_principais?.provedor ?? '';
  const displayName = canonical?.dados_principais?.nome_exibicao ?? '';
  const reservationCode = canonical?.dados_principais?.codigo_reserva ?? '';
  const guestName = canonical?.dados_principais?.passageiro_hospede ?? '';
  const paymentMethod = canonical?.financeiro?.metodo ?? '';
  const pointsUsed = canonical?.financeiro?.pontos_utilizados != null ? String(canonical.financeiro.pontos_utilizados) : '';
  const financeiroMoeda = canonical?.financeiro?.moeda ?? null;
  const financeiroValor = canonical?.financeiro?.valor_total;

  return {
    type: finalType,
    voo: {
      nome_exibicao: displayName,
      provedor: provider,
      codigo_reserva: reservationCode,
      passageiro_hospede: guestName,
      numero: extracted.data.voo?.numero ?? '',
      companhia: extracted.data.voo?.companhia ?? provider,
      origem: extracted.data.voo?.origem ?? canonical?.dados_principais?.origem ?? '',
      destino: extracted.data.voo?.destino ?? canonical?.dados_principais?.destino ?? '',
      data_inicio: toDateInput(startDate ?? extracted.data.voo?.data ?? null),
      hora_inicio: toTimeInput(startTime),
      data_fim: toDateInput(endDate),
      hora_fim: toTimeInput(endTime),
      status: extracted.data.voo?.status ?? 'pendente',
      valor:
        extracted.data.voo?.valor != null
          ? String(extracted.data.voo.valor)
          : financeiroValor != null
            ? String(financeiroValor)
            : '',
      moeda: extracted.data.voo?.moeda ?? financeiroMoeda ?? 'BRL',
      metodo_pagamento: paymentMethod,
      pontos_utilizados: pointsUsed,
    },
    hospedagem: {
      nome_exibicao: displayName,
      provedor: provider,
      codigo_reserva: reservationCode,
      passageiro_hospede: guestName,
      nome: extracted.data.hospedagem?.nome ?? displayName,
      localizacao: extracted.data.hospedagem?.localizacao ?? canonical?.dados_principais?.destino ?? '',
      check_in: toDateInput(startDate ?? extracted.data.hospedagem?.check_in ?? null),
      hora_inicio: toTimeInput(startTime),
      check_out: toDateInput(endDate ?? extracted.data.hospedagem?.check_out ?? null),
      hora_fim: toTimeInput(endTime),
      status: extracted.data.hospedagem?.status ?? 'pendente',
      valor:
        extracted.data.hospedagem?.valor != null
          ? String(extracted.data.hospedagem.valor)
          : financeiroValor != null
            ? String(financeiroValor)
            : '',
      moeda: extracted.data.hospedagem?.moeda ?? financeiroMoeda ?? 'BRL',
      metodo_pagamento: paymentMethod,
      pontos_utilizados: pointsUsed,
      dica_viagem: canonical?.enriquecimento_ia?.dica_viagem ?? '',
      como_chegar: canonical?.enriquecimento_ia?.como_chegar ?? '',
      atracoes_proximas: canonical?.enriquecimento_ia?.atracoes_proximas ?? '',
      restaurantes_proximos: canonical?.enriquecimento_ia?.restaurantes_proximos ?? '',
      dica_ia: canonical?.enriquecimento_ia?.dica_viagem ?? '',
    },
    transporte: {
      nome_exibicao: displayName,
      provedor: provider,
      codigo_reserva: reservationCode,
      passageiro_hospede: guestName,
      tipo: extracted.data.transporte?.tipo ?? displayName,
      operadora: extracted.data.transporte?.operadora ?? provider,
      origem: extracted.data.transporte?.origem ?? canonical?.dados_principais?.origem ?? '',
      destino: extracted.data.transporte?.destino ?? canonical?.dados_principais?.destino ?? '',
      data_inicio: toDateInput(startDate ?? extracted.data.transporte?.data ?? null),
      hora_inicio: toTimeInput(startTime),
      data_fim: toDateInput(endDate),
      hora_fim: toTimeInput(endTime),
      status: extracted.data.transporte?.status ?? 'pendente',
      valor:
        extracted.data.transporte?.valor != null
          ? String(extracted.data.transporte.valor)
          : financeiroValor != null
            ? String(financeiroValor)
            : '',
      moeda: extracted.data.transporte?.moeda ?? financeiroMoeda ?? 'BRL',
      metodo_pagamento: paymentMethod,
      pontos_utilizados: pointsUsed,
    },
    restaurante: {
      nome: extracted.data.restaurante?.nome ?? displayName,
      cidade: extracted.data.restaurante?.cidade ?? canonical?.dados_principais?.destino ?? '',
      tipo: extracted.data.restaurante?.tipo ?? '',
      rating: extracted.data.restaurante?.rating != null ? String(extracted.data.restaurante.rating) : '',
    },
  };
}

function formatCurrency(value?: number | null, currency: string = 'BRL') {
  if (value == null || Number.isNaN(value)) return '—';
  const validCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'BRL';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: validCurrency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(value);
  }
}

function convertToBrl(value: number, currency: string) {
  const rates: Record<string, number> = {
    BRL: 1,
    EUR: 5.8,
    USD: 5.2,
    CHF: 5.98,
    GBP: 6.5,
  };

  const normalized = (currency || 'BRL').toUpperCase();
  const rate = rates[normalized] ?? 1;
  return value * rate;
}

function hotelPhotoUrls(name: string, location: string) {
  const base = `${name} ${location}`.trim() || 'hotel viagem';
  const encoded = encodeURIComponent(base);
  return [
    `https://source.unsplash.com/1200x700/?${encoded}`,
    `https://source.unsplash.com/1200x700/?hotel,${encodeURIComponent(location || 'travel')}`,
    `https://picsum.photos/seed/${encodeURIComponent(base)}/1200/700`,
  ];
}

function typeLabel(type: ImportType | null | undefined) {
  if (type === 'hospedagem') return 'Hospedagem';
  if (type === 'voo') return 'Voo';
  if (type === 'transporte') return 'Transporte';
  if (type === 'restaurante') return 'Restaurante';
  return 'A definir';
}

function toDateLabel(date?: string | null) {
  if (!date) return '—';
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsed);
}

function diffNights(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

function toUserWarning(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('bucket') || lower.includes('storage')) {
    return 'Não foi possível anexar o arquivo original agora. A importação segue normalmente.';
  }
  if (lower.includes('ocr')) {
    return 'A leitura automática ficou incompleta. Revise os campos antes de salvar.';
  }
  if (lower.includes('baixa qualidade')) {
    return 'O texto foi extraído com baixa qualidade. Confira os principais dados antes de confirmar.';
  }
  if (lower.includes('extração') || lower.includes('edge function') || lower.includes('failed to send a request')) {
    return 'A IA não respondeu com dados suficientes agora. Preenchemos um rascunho para sua confirmação final.';
  }
  if (lower.includes('metadados')) {
    return 'O registro do anexo não foi concluído, mas você ainda pode salvar a reserva.';
  }
  return 'Alguns dados exigem confirmação antes de salvar.';
}

function queueStatusLabel(status: QueueStatus) {
  if (status === 'pending') return 'Aguardando';
  if (status === 'processing') return 'Analisando';
  if (status === 'auto_extracted') return 'Extraído';
  if (status === 'needs_confirmation') return 'Confirmar';
  if (status === 'saving') return 'Salvando';
  if (status === 'saved') return 'Salvo';
  return 'Falha';
}

function queueStatusVariant(status: QueueStatus): 'secondary' | 'default' | 'destructive' {
  if (status === 'saved') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'needs_confirmation') return 'default';
  return 'secondary';
}

function makeQueueItem(file: File): ImportQueueItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    fileHash: null,
    status: 'pending',
    visualSteps: defaultVisualSteps(),
    scope: 'trip_related',
    warnings: [],
    confidence: null,
    typeConfidence: null,
    extractionQuality: 'low',
    missingFields: [],
    identifiedType: null,
    needsUserConfirmation: true,
    reviewState: null,
    rawText: '',
    summary: null,
    canonical: null,
    extractionHistory: [],
    providerMeta: null,
    hotelPhotos: [],
    photoIndex: 0,
    documentId: null,
  };
}

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

  const processOneFile = async (itemId: string, options?: { reprocess?: boolean }) => {
    const item = queue.find((entry) => entry.id === itemId);
    if (!item || !user || !currentTripId) return;

    const file = item.file;
    const previousCanonical = item.canonical;
    const fileHash = item.fileHash ?? await computeFileHash(file).catch(() => null);
    let documentId = item.documentId;
    const alreadyImportedDocument = findImportedDocumentByHash(documentsModule.data, fileHash);

    if (alreadyImportedDocument) {
      setItem(itemId, (current) => ({
        ...current,
        fileHash,
        documentId: alreadyImportedDocument.id,
        status: 'saved',
        warnings: current.warnings.concat('Este arquivo já foi importado anteriormente.'),
        summary: {
          type: 'documento',
          title: file.name,
          subtitle: 'Importação ignorada para evitar duplicidade.',
          amount: null,
          currency: 'BRL',
          estimatedBrl: null,
          checkIn: null,
          checkOut: null,
          nights: null,
          stayGapCount: 0,
          transportGapCount: 0,
          nextSteps: ['Arquivo duplicado detectado pela assinatura do documento.'],
        },
        visualSteps: {
          ...defaultVisualSteps(),
          read: 'completed',
          identified: 'completed',
          saving: 'completed',
          photos: 'skipped',
          tips: 'skipped',
          done: 'completed',
        },
      }));
      return;
    }

    setItem(itemId, (current) => ({
      ...current,
      fileHash,
      status: 'processing',
      scope: 'trip_related',
      warnings: [],
      confidence: null,
      typeConfidence: null,
      extractionQuality: 'low',
      missingFields: [],
      identifiedType: options?.reprocess ? current.identifiedType : null,
      needsUserConfirmation: true,
      reviewState: options?.reprocess ? current.reviewState : null,
      rawText: '',
      summary: null,
      canonical: options?.reprocess ? current.canonical : null,
      providerMeta: null,
      hotelPhotos: [],
      photoIndex: 0,
      documentId,
      visualSteps: { ...defaultVisualSteps(), read: 'in_progress' },
    }));

    const localWarnings: string[] = [];

    try {
      // Run upload + native text extraction in parallel
      const [upload, native] = await Promise.all([
        uploadImportFile(file, user.id, currentTripId),
        tryExtractNativeText(file),
      ]);
      if (!upload.uploaded && upload.warning) {
        localWarnings.push(upload.warning);
      }

      if (!documentId) {
        try {
          const createdDocument = await documentsModule.create({
            nome: file.name,
            tipo: `importacao/${upload.ext}`,
            arquivo_url: upload.path ?? null,
            importado: false,
            origem_importacao: 'arquivo',
          } as Omit<TablesInsert<'documentos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>);
          if (createdDocument?.id) {
            documentId = createdDocument.id;
            setItem(itemId, (current) => ({ ...current, documentId: createdDocument.id }));
          }
        } catch (metadataError) {
          console.error('[import][metadata_failure]', { file: file.name, error: metadataError });
          localWarnings.push('Falha ao registrar metadados do anexo.');
        }
      }
      let extractedText = native.text ?? '';

      if (!native.text) {
        try {
          const ocr = await runOcrDocument(file);
          extractedText = ocr.text ?? '';
          localWarnings.push(...ocr.warnings);
          if (ocr.qualityMetrics && ocr.qualityMetrics.text_length < 80) {
            localWarnings.push('Texto extraído com baixa qualidade.');
          }
        } catch (ocrError) {
          console.error('[import][ocr_failure]', { file: file.name, error: ocrError });
          localWarnings.push(ocrError instanceof Error ? ocrError.message : 'OCR não disponível no momento.');
        }
      }

      setItemStep(itemId, 'read', 'completed');
      setItemStep(itemId, 'identified', 'in_progress');

      let extracted: ExtractedReservation;
      if (extractedText.trim().length > 20) {
        try {
          extracted = await extractReservationStructured(extractedText, file.name);
        } catch (extractError) {
          console.error('[import][extract_failure]', { file: file.name, error: extractError });
          localWarnings.push(extractError instanceof Error ? extractError.message : 'Extração IA incompleta.');
          extracted = inferFallbackExtraction(extractedText, file.name, currentTrip?.destino);
        }
      } else {
        localWarnings.push('Texto insuficiente para extração automática.');
        extracted = inferFallbackExtraction(extractedText, file.name, currentTrip?.destino);
      }

      const resolvedScope = resolveImportScope(extracted, extractedText, file.name);
      const resolvedType = resolveImportType(extracted, extractedText, file.name);
      const review = resolvedScope === 'trip_related' ? toReviewState(extracted, resolvedType) : null;
      const computedMissingFields = computeCriticalMissingFields(review?.type ?? resolvedType, review, resolvedScope);
      const missingFields = mergeMissingFields(extracted.missingFields ?? [], computedMissingFields);
      const quality = extracted.extraction_quality ?? (extractedText.length > 500 ? 'high' : extractedText.length > 120 ? 'medium' : 'low');
      const canonicalForStorage = withImportHash(extracted.canonical, fileHash, file.name);
      const typeConfidenceFromCanonical = extracted.canonical?.metadata?.confianca != null
        ? Math.max(0, Math.min(1, Number(extracted.canonical.metadata.confianca) / 100))
        : null;
      const typeConfidence = typeConfidenceFromCanonical ?? extracted.type_confidence ?? extracted.confidence ?? 0;
      const needsUserConfirmation = true;
      const providerMeta = extracted.provider_meta ?? null;

      if (documentId) {
        try {
          await documentsModule.update({
            id: documentId,
            updates: {
              extracao_tipo: resolvedType,
              extracao_scope: resolvedScope,
              extracao_confianca: Math.round(typeConfidence * 100),
              extracao_payload: canonicalForStorage,
              tipo: resolvedScope === 'outside_scope' ? 'fora_escopo' : resolvedType,
              importado: false,
            } as any,
          });
        } catch (docUpdateError) {
          console.error('[import][document_preconfirm_update_failed]', docUpdateError);
          localWarnings.push('Falha ao atualizar metadados da extração.');
        }
      }

      setItem(itemId, (current) => ({
        ...current,
        status: 'auto_extracted',
        scope: resolvedScope,
        warnings: localWarnings,
        confidence: extracted.confidence,
        typeConfidence,
        extractionQuality: quality,
        missingFields,
        identifiedType: resolvedScope === 'trip_related' ? resolvedType : null,
        needsUserConfirmation,
        reviewState: review,
        canonical: canonicalForStorage,
        extractionHistory:
          options?.reprocess && previousCanonical
            ? [previousCanonical, ...current.extractionHistory].slice(0, 3)
            : current.extractionHistory,
        providerMeta,
        fileHash,
        rawText: extractedText,
        visualSteps: {
          ...current.visualSteps,
          read: 'completed',
          identified: 'completed',
          saving: 'pending',
          photos: 'pending',
          tips: 'pending',
          done: 'pending',
        },
      }));

      setItem(itemId, (current) => ({
        ...current,
        status: needsUserConfirmation ? 'needs_confirmation' : current.status,
      }));
    } catch (error) {
      console.error('[import][pipeline_fatal]', { file: file.name, error });
      const fallbackWarning = error instanceof Error ? error.message : 'Falha geral na análise.';
      setItem(itemId, (current) => ({
        ...current,
        status: 'failed',
        identifiedType: current.identifiedType ?? item.identifiedType,
        reviewState: current.reviewState ?? item.reviewState,
        canonical: current.canonical ?? previousCanonical,
        warnings: localWarnings.concat(fallbackWarning),
        visualSteps: {
          ...current.visualSteps,
          read: 'failed',
        },
      }));
    }
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
    if (!activeItem?.reviewState) return;
    setItem(activeItem.id, (item) => {
      if (!item.reviewState) return item;
      const nextReview = updater(item.reviewState);
      const computedMissingFields = computeCriticalMissingFields(nextReview.type, nextReview, item.scope);
      return {
        ...item,
        reviewState: nextReview,
        missingFields: mergeMissingFields(item.missingFields, computedMissingFields),
      };
    });
  };

  const saveActiveReviewed = async () => {
    if (!activeItem) return;
    if (activeItem.scope === 'trip_related' && !activeItem.reviewState) return;

    const reviewState = activeItem.reviewState;
    setIsSaving(true);
    setItem(activeItem.id, (item) => ({ ...item, status: 'saving' }));
    setItemStep(activeItem.id, 'saving', 'in_progress');

    try {
      let flightsAfter = [...flightsModule.data];
      let staysAfter = [...staysModule.data];
      let transportsAfter = [...transportsModule.data];
      const canonical = activeItem.canonical;
      const canonicalType = canonical?.metadata?.tipo?.toLowerCase() ?? null;
      const canonicalConfidence = canonical?.metadata?.confianca ?? null;
      const extractionScope = activeItem.scope;

      let title = 'Reserva importada';
      let subtitle = 'Dados salvos com sucesso';
      let amount: number | null = null;
      let currency = 'BRL';
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      let photos: string[] = [];

      if (activeItem.scope === 'outside_scope') {
        if (!activeItem.documentId) {
          throw new Error('Não foi possível salvar este arquivo em Documentos agora. Tente novamente.');
        }
        if (activeItem.documentId) {
          try {
            await documentsModule.update({
              id: activeItem.documentId,
              updates: {
                tipo: 'fora_escopo',
                extracao_scope: 'outside_scope',
                extracao_tipo: canonicalType ?? activeItem.identifiedType ?? null,
                extracao_confianca: canonicalConfidence != null ? Math.round(Number(canonicalConfidence)) : null,
                extracao_payload: withImportHash(canonical, activeItem.fileHash, activeItem.file.name),
                importado: true,
                origem_importacao: 'arquivo',
              } as any,
            });
          } catch (docUpdateError) {
            console.error('[import][outside_scope_document_update_failed]', docUpdateError);
          }
        }

        title = activeItem.file.name;
        subtitle = 'Arquivo salvo apenas em Documentos (fora de escopo da viagem).';
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      } else if (reviewState?.type === 'voo') {
        const payload: Omit<TablesInsert<'voos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          numero: reviewState.voo.numero || null,
          companhia: reviewState.voo.companhia || null,
          origem: reviewState.voo.origem || null,
          destino: reviewState.voo.destino || null,
          data: toIsoDateTime(reviewState.voo.data_inicio, reviewState.voo.hora_inicio),
          status: reviewState.voo.status,
          valor: reviewState.voo.valor ? Number(reviewState.voo.valor) : null,
          moeda: reviewState.voo.moeda || 'BRL',
        };
        const displayName = reviewState.voo.nome_exibicao || null;
        const created = await flightsModule.create(payload);
        if (!created) {
          throw new Error('Não foi possível salvar o voo importado.');
        }
        flightsAfter = [created, ...flightsAfter];

        title = displayName || payload.numero || payload.companhia || 'Voo importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      }

      if (reviewState?.type === 'hospedagem') {
        const inferredTips = {
          dica_viagem: reviewState.hospedagem.dica_viagem || canonical?.enriquecimento_ia?.dica_viagem || null,
          como_chegar: reviewState.hospedagem.como_chegar || canonical?.enriquecimento_ia?.como_chegar || null,
          atracoes_proximas: reviewState.hospedagem.atracoes_proximas || canonical?.enriquecimento_ia?.atracoes_proximas || null,
          restaurantes_proximos: reviewState.hospedagem.restaurantes_proximos || canonical?.enriquecimento_ia?.restaurantes_proximos || null,
          dica_ia:
            reviewState.hospedagem.dica_ia ||
            reviewState.hospedagem.dica_viagem ||
            canonical?.enriquecimento_ia?.dica_viagem ||
            null,
        };
        const payload: Omit<TablesInsert<'hospedagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          nome: reviewState.hospedagem.nome || null,
          localizacao: reviewState.hospedagem.localizacao || null,
          check_in: reviewState.hospedagem.check_in || null,
          check_out: reviewState.hospedagem.check_out || null,
          status: reviewState.hospedagem.status,
          valor: reviewState.hospedagem.valor ? Number(reviewState.hospedagem.valor) : null,
          moeda: reviewState.hospedagem.moeda || 'BRL',
          dica_viagem: inferredTips.dica_viagem,
          como_chegar: inferredTips.como_chegar,
          atracoes_proximas: inferredTips.atracoes_proximas,
          restaurantes_proximos: inferredTips.restaurantes_proximos,
          dica_ia: inferredTips.dica_ia,
        };
        const stayDisplayName = reviewState.hospedagem.nome_exibicao || null;

        const created = await staysModule.create(payload);
        if (!created) {
          throw new Error('Não foi possível salvar a hospedagem importada.');
        }
        staysAfter = [created, ...staysAfter];
        setItemStep(activeItem.id, 'photos', 'in_progress');
        photos = hotelPhotoUrls(created.nome ?? '', created.localizacao ?? '');
        setItemStep(activeItem.id, 'photos', 'completed');

        setItemStep(activeItem.id, 'tips', 'in_progress');
        const hasAnyTip = !!(
          inferredTips.dica_viagem ||
          inferredTips.como_chegar ||
          inferredTips.atracoes_proximas ||
          inferredTips.restaurantes_proximos
        );
        if (!hasAnyTip) {
          const tips = await generateStayTips({
            hotelName: created.nome,
            location: created.localizacao,
            checkIn: created.check_in,
            checkOut: created.check_out,
            tripDestination: currentTrip?.destino,
          });

          if (tips.data) {
            try {
              await staysModule.update({ id: created.id, updates: tips.data });
              staysAfter = [{ ...created, ...tips.data }, ...staysAfter.filter((entry) => entry.id !== created.id)];
            } catch (tipError) {
              console.error('[import][stay_tips_update_failed]', tipError);
              setItem(activeItem.id, (item) => ({
                ...item,
                warnings: item.warnings.concat('Reserva salva, mas as dicas IA não puderam ser persistidas agora.'),
              }));
            }
          }

          if (tips.fromFallback) {
            setItem(activeItem.id, (item) => ({
              ...item,
              warnings: item.warnings.concat('Dicas de hospedagem em modo fallback; revise antes da viagem.'),
            }));
          }
        }
        setItemStep(activeItem.id, 'tips', 'completed');

        title = stayDisplayName || payload.nome || 'Hospedagem importada';
        subtitle = `${payload.localizacao || 'Local não informado'} · ${payload.check_in || 'sem check-in'} a ${payload.check_out || 'sem check-out'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        checkIn = payload.check_in ?? null;
        checkOut = payload.check_out ?? null;
      }

      if (reviewState?.type === 'transporte') {
        const payload: Omit<TablesInsert<'transportes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          tipo: reviewState.transporte.tipo || null,
          operadora: reviewState.transporte.operadora || null,
          origem: reviewState.transporte.origem || null,
          destino: reviewState.transporte.destino || null,
          data: toIsoDateTime(reviewState.transporte.data_inicio, reviewState.transporte.hora_inicio),
          status: reviewState.transporte.status,
          valor: reviewState.transporte.valor ? Number(reviewState.transporte.valor) : null,
          moeda: reviewState.transporte.moeda || 'BRL',
        };

        const created = await transportsModule.create(payload);
        if (!created) {
          throw new Error('Não foi possível salvar o transporte importado.');
        }
        transportsAfter = [created, ...transportsAfter];

        title = payload.tipo || payload.operadora || 'Transporte importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      }

      if (reviewState?.type === 'restaurante') {
        const payload: Omit<TablesInsert<'restaurantes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          nome: reviewState.restaurante.nome || 'Restaurante importado',
          cidade: reviewState.restaurante.cidade || null,
          tipo: reviewState.restaurante.tipo || null,
          rating: reviewState.restaurante.rating ? Number(reviewState.restaurante.rating) : null,
          salvo: true,
        };

        const created = await restaurantsModule.create(payload);
        if (!created) {
          throw new Error('Não foi possível salvar o restaurante importado.');
        }
        title = payload.nome;
        subtitle = `${payload.cidade || 'Cidade não informada'} · ${payload.tipo || 'Tipo não informado'}`;
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      }

      if (activeItem.documentId) {
        try {
          await documentsModule.update({
            id: activeItem.documentId,
              updates: {
                tipo: reviewState?.type ?? activeItem.identifiedType ?? (canonicalType as string | null),
                extracao_scope: extractionScope,
                extracao_tipo: canonicalType ?? reviewState?.type ?? activeItem.identifiedType ?? null,
                extracao_confianca: canonicalConfidence != null ? Math.round(Number(canonicalConfidence)) : null,
                extracao_payload: withImportHash(canonical, activeItem.fileHash, activeItem.file.name),
                importado: true,
                origem_importacao: 'arquivo',
              } as any,
          });
        } catch (docUpdateError) {
          console.error('[import][document_update_failed]', docUpdateError);
          setItem(activeItem.id, (item) => ({
            ...item,
            warnings: item.warnings.concat('A reserva foi salva, mas não foi possível atualizar o documento de importação.'),
          }));
        }
      }

      setItemStep(activeItem.id, 'saving', 'completed');

      const stayGaps = calculateStayCoverageGaps(staysAfter, currentTrip?.data_inicio ?? null, currentTrip?.data_fim ?? null);
      const transportGaps = calculateTransportCoverageGaps(staysAfter, transportsAfter, flightsAfter);

      const nextSteps: string[] = [];
      if (stayGaps.length > 0) {
        const firstStayGap = stayGaps[0];
        nextSteps.push(`Hospedagem pendente: ${toDateLabel(firstStayGap.start)}-${toDateLabel(firstStayGap.end)}.`);
      } else {
        nextSteps.push('Hospedagens cobertas no período atual.');
      }

      if (transportGaps.length > 0) {
        const firstTransportGap = transportGaps[0];
        nextSteps.push(`Transporte pendente: ${firstTransportGap.from} → ${firstTransportGap.to}.`);
      } else {
        nextSteps.push('Trechos entre cidades cobertos.');
      }

      const summary: ImportSummary = {
        type: activeItem.scope === 'outside_scope' ? 'documento' : reviewState?.type ?? activeItem.identifiedType ?? 'transporte',
        title,
        subtitle,
        amount,
        currency,
        estimatedBrl: amount != null ? convertToBrl(amount, currency) : null,
        checkIn,
        checkOut,
        nights: diffNights(checkIn, checkOut),
        stayGapCount: stayGaps.length,
        transportGapCount: transportGaps.length,
        nextSteps,
      };

      setItem(activeItem.id, (item) => ({
        ...item,
        status: 'saved',
        summary,
        hotelPhotos: photos,
        photoIndex: 0,
        visualSteps: {
          ...item.visualSteps,
          saving: 'completed',
          done: 'completed',
        },
      }));

      toast.success(
        activeItem.scope === 'outside_scope'
          ? 'Arquivo salvo em documentos como fora de escopo.'
          : `${typeLabel(reviewState?.type)} salvo com sucesso.`,
      );

      await trackProductEvent({
        eventName: 'import_confirmed',
        featureKey: 'ff_ai_import_enabled',
        viagemId: currentTripId,
        metadata: {
          fileName: activeItem.file.name,
          scope: activeItem.scope,
          type: reviewState?.type ?? activeItem.identifiedType ?? null,
        },
      });

      if (currentTripId) {
        const webhookPayload = {
          itemType: reviewState?.type ?? activeItem.identifiedType ?? 'documento',
          scope: activeItem.scope,
          fileName: activeItem.file.name,
          documentId: activeItem.documentId,
        };
        const webhook = await dispatchTripWebhook({
          eventType: 'import.confirmed',
          viagemId: currentTripId,
          payload: webhookPayload,
        });
        if (webhook.error) {
          await trackProductEvent({
            eventName: 'webhook_dispatched',
            featureKey: 'ff_webhooks_enabled',
            viagemId: currentTripId,
            metadata: {
              status: 'failed',
              source: 'import.confirmed',
              error: webhook.error,
            },
          });
          setItem(activeItem.id, (item) => ({
            ...item,
            warnings: item.warnings.concat('Reserva salva, mas o webhook de integração não pôde ser enviado.'),
          }));
        } else {
          await trackProductEvent({
            eventName: 'webhook_dispatched',
            featureKey: 'ff_webhooks_enabled',
            viagemId: currentTripId,
            metadata: {
              status: 'success',
              source: 'import.confirmed',
            },
          });
        }
      }
    } catch (error) {
      console.error('[import][save_failure]', error);
      setItem(activeItem.id, (item) => ({
        ...item,
        status: 'needs_confirmation',
        warnings: item.warnings.concat(error instanceof Error ? error.message : 'Falha ao salvar item.'),
        visualSteps: {
          ...item.visualSteps,
          saving: 'failed',
          done: 'failed',
        },
      }));
      toast.error('Falha ao confirmar e salvar este item.');
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
          <Card className="border-primary/15 bg-white/95 shadow-sm">
            <CardContent className="pt-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor={fileInputId}>Arquivos da viagem</Label>
                  <Input
                    id={fileInputId}
                    type="file"
                    multiple
                    accept=".txt,.html,.eml,.pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => onSelectFiles(event.target.files)}
                    className="h-11 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    {`Você pode subir até ${maxFilesPerBatch} arquivo(s) por lote. Formatos: txt, html, eml, pdf, png, jpg e webp.`}
                  </p>
                </div>
                <div className="w-full space-y-2">
                  <Button
                    onClick={runBatch}
                    disabled={!canProcess}
                    aria-label="Analisar arquivos selecionados"
                    className="h-11 w-full bg-primary text-sm font-semibold hover:bg-primary/90"
                  >
                    {isProcessingBatch || isReprocessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                    Analisar arquivos
                  </Button>
                  <p className="text-[11px] text-muted-foreground lg:text-center">
                    OCR + IA classifica cada arquivo e prepara confirmação final.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

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

          {activeItem && activeItem.warnings.length > 0 && (
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

          {activeItem?.status === 'failed' && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Não foi possível finalizar este arquivo. Você pode tentar o processamento novamente.
                </p>
                <Button type="button" variant="outline" onClick={reprocessActiveItem} disabled={isReprocessing || isSaving}>
                  {isReprocessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          )}

          {activeItem && activeItem.status !== 'saved' && (
            <ImportConfirmationCard
              activeItem={activeItem}
              isSaving={isSaving}
              showAdvancedEditor={showAdvancedEditor}
              onConfirm={saveActiveReviewed}
              onReprocess={reprocessActiveItem}
              canReprocess={!isReprocessing && !isSaving && activeItem.status !== 'saving' && canReprocessActive}
              onToggleEditor={() => setShowAdvancedEditor((prev) => !prev)}
              typeLabel={typeLabel}
              formatCurrency={formatCurrency}
            />
          )}

          {activeItem?.reviewState && showAdvancedEditor && (
            <ImportReviewFormByType
              reviewState={activeItem.reviewState}
              missingFieldsCount={activeItem.missingFields.length}
              onChange={updateActiveReview}
            />
          )}

          {activeItem?.summary && (
            <ImportResultSummary
              activeItem={activeItem}
              formatCurrency={formatCurrency}
              onPrevPhoto={() => setItem(activeItem.id, (item) => ({ ...item, photoIndex: item.photoIndex === 0 ? item.hotelPhotos.length - 1 : item.photoIndex - 1 }))}
              onNextPhoto={() => setItem(activeItem.id, (item) => ({ ...item, photoIndex: (item.photoIndex + 1) % item.hotelPhotos.length }))}
            />
          )}

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
