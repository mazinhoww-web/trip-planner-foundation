import { useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TablesInsert } from '@/integrations/supabase/types';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useModuleData } from '@/hooks/useModuleData';
import { generateStayTips } from '@/services/ai';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';
import {
  ExtractedReservation,
  ImportType,
  extractReservationStructured,
  isAllowedImportFile,
  runOcrDocument,
  tryExtractNativeText,
  uploadImportFile,
} from '@/services/importPipeline';
import { FileUp, Loader2, WandSparkles, Check, Circle, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type QueueStatus = 'pending' | 'processing' | 'review' | 'saving' | 'saved' | 'failed';
type VisualStepKey = 'read' | 'identified' | 'saving' | 'photos' | 'tips' | 'done';

type ReviewState = {
  type: ImportType;
  voo: {
    numero: string;
    companhia: string;
    origem: string;
    destino: string;
    data: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
  };
  hospedagem: {
    nome: string;
    localizacao: string;
    check_in: string;
    check_out: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
  };
  transporte: {
    tipo: string;
    operadora: string;
    origem: string;
    destino: string;
    data: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
  };
  restaurante: {
    nome: string;
    cidade: string;
    tipo: string;
    rating: string;
  };
};

type ImportSummary = {
  type: ImportType;
  title: string;
  subtitle: string;
  amount: number | null;
  currency: string;
  estimatedBrl: number | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  stayGapCount: number;
  transportGapCount: number;
  nextSteps: string[];
};

type ImportQueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  visualSteps: Record<VisualStepKey, StepStatus>;
  warnings: string[];
  confidence: number | null;
  missingFields: string[];
  identifiedType: ImportType | null;
  reviewState: ReviewState | null;
  rawText: string;
  summary: ImportSummary | null;
  hotelPhotos: string[];
  photoIndex: number;
};

const VISUAL_STEPS: { key: VisualStepKey; label: string }[] = [
  { key: 'read', label: 'Lendo documento' },
  { key: 'identified', label: 'Tipo detectado' },
  { key: 'saving', label: 'Salvando dados' },
  { key: 'photos', label: 'Buscando fotos' },
  { key: 'tips', label: 'Gerando dicas' },
  { key: 'done', label: 'Concluído' },
];

const defaultVisualSteps = (): Record<VisualStepKey, StepStatus> => ({
  read: 'pending',
  identified: 'pending',
  saving: 'pending',
  photos: 'pending',
  tips: 'pending',
  done: 'pending',
});

function toDateInput(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function filledCount(values: Array<string | number | null | undefined>) {
  return values.reduce((count, value) => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? count + 1 : count;
    }
    if (typeof value === 'string') {
      return value.trim() ? count + 1 : count;
    }
    return count;
  }, 0);
}

function inferTypeScores(extracted: ExtractedReservation) {
  const voo = extracted.data.voo;
  const hospedagem = extracted.data.hospedagem;
  const transporte = extracted.data.transporte;
  const restaurante = extracted.data.restaurante;

  const scores: Record<ImportType, number> = {
    voo: filledCount([voo?.numero, voo?.companhia, voo?.origem, voo?.destino, voo?.data, voo?.valor]),
    hospedagem: filledCount([hospedagem?.nome, hospedagem?.localizacao, hospedagem?.check_in, hospedagem?.check_out, hospedagem?.valor]),
    transporte: filledCount([transporte?.tipo, transporte?.operadora, transporte?.origem, transporte?.destino, transporte?.data, transporte?.valor]),
    restaurante: filledCount([restaurante?.nome, restaurante?.cidade, restaurante?.tipo, restaurante?.rating]),
  };

  const ordered = (Object.entries(scores) as Array<[ImportType, number]>).sort((a, b) => b[1] - a[1]);
  return { scores, bestType: ordered[0]?.[0] ?? 'transporte', bestScore: ordered[0]?.[1] ?? 0 };
}

function detectTypeFromText(raw: string, fileName: string): ImportType {
  const bag = `${raw} ${fileName}`.toLowerCase();

  if (/\b(latam|gol|azul|flight|boarding|voo|aeroporto|pnr|iata|ticket|itiner[áa]rio)\b/.test(bag) || /\b[a-z]{2}\d{3,}[a-z0-9]*\b/i.test(bag)) {
    return 'voo';
  }

  if (/\b(restaurant|restaurante|mesa|reservation at|reserva de mesa|opentable|tripadvisor)\b/.test(bag)) {
    return 'restaurante';
  }

  if (/\b(airbnb|hotel|hospedagem|booking|check-in|check out|checkout|pousada)\b/.test(bag)) {
    return 'hospedagem';
  }

  return 'transporte';
}

function resolveImportType(extracted: ExtractedReservation, rawText: string, fileName: string): ImportType {
  const { scores, bestType, bestScore } = inferTypeScores(extracted);
  const hintType = detectTypeFromText(rawText, fileName);
  const extractedType = extracted.type;

  if (bestScore === 0) return hintType;

  if (extractedType && scores[extractedType] >= Math.max(2, bestScore - 1)) {
    return extractedType;
  }

  if (scores[bestType] <= 1) return hintType;

  if (hintType !== bestType && scores[bestType] <= 2) return hintType;

  return bestType;
}

function inferFallbackExtraction(raw: string, fileName: string, tripDestination?: string | null): ExtractedReservation {
  const type = detectTypeFromText(raw, fileName);
  const amountMatch = raw.match(/(R\$|USD|EUR|CHF|GBP)\s*([0-9][0-9.,]*)/i);
  const amount = amountMatch ? Number((amountMatch[2] || '').replace(/\./g, '').replace(',', '.')) : null;
  const currency = amountMatch?.[1]?.toUpperCase().replace('$', '') ?? null;

  const flightNumber = (raw.match(/\b([A-Z]{2}\d{3,}[A-Z0-9]*)\b/) || fileName.match(/\b([A-Z]{2}\d{3,}[A-Z0-9]*)\b/i))?.[1] ?? null;
  const airline =
    /\blatam\b/i.test(raw) || /\blatam\b/i.test(fileName)
      ? 'LATAM'
      : /\bgol\b/i.test(raw) || /\bgol\b/i.test(fileName)
        ? 'GOL'
        : /\bazul\b/i.test(raw) || /\bazul\b/i.test(fileName)
          ? 'AZUL'
          : null;

  const cleanedName = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();

  return {
    type,
    confidence: 0.4,
    missingFields: ['review_manual_requerida'],
    data: {
      voo:
        type === 'voo'
          ? {
              numero: flightNumber,
              companhia: airline,
              origem: null,
              destino: null,
              data: null,
              status: 'pendente',
              valor: Number.isFinite(amount as number) ? amount : null,
              moeda: currency || 'BRL',
            }
          : null,
      hospedagem:
        type === 'hospedagem'
          ? {
              nome: cleanedName || 'Hospedagem',
              localizacao: tripDestination ?? null,
              check_in: null,
              check_out: null,
              status: 'pendente',
              valor: Number.isFinite(amount as number) ? amount : null,
              moeda: currency || 'BRL',
            }
          : null,
      transporte:
        type === 'transporte'
          ? {
              tipo: cleanedName || 'Transporte',
              operadora: null,
              origem: null,
              destino: null,
              data: null,
              status: 'pendente',
              valor: Number.isFinite(amount as number) ? amount : null,
              moeda: currency || 'BRL',
            }
          : null,
      restaurante:
        type === 'restaurante'
          ? {
              nome: cleanedName || 'Reserva de restaurante',
              cidade: tripDestination ?? null,
              tipo: 'Reserva',
              rating: null,
            }
          : null,
    },
  };
}

function toReviewState(extracted: ExtractedReservation, resolvedType: ImportType): ReviewState {
  return {
    type: resolvedType,
    voo: {
      numero: extracted.data.voo?.numero ?? '',
      companhia: extracted.data.voo?.companhia ?? '',
      origem: extracted.data.voo?.origem ?? '',
      destino: extracted.data.voo?.destino ?? '',
      data: toDateTimeInput(extracted.data.voo?.data),
      status: extracted.data.voo?.status ?? 'pendente',
      valor: extracted.data.voo?.valor != null ? String(extracted.data.voo.valor) : '',
      moeda: extracted.data.voo?.moeda ?? 'BRL',
    },
    hospedagem: {
      nome: extracted.data.hospedagem?.nome ?? '',
      localizacao: extracted.data.hospedagem?.localizacao ?? '',
      check_in: toDateInput(extracted.data.hospedagem?.check_in),
      check_out: toDateInput(extracted.data.hospedagem?.check_out),
      status: extracted.data.hospedagem?.status ?? 'pendente',
      valor: extracted.data.hospedagem?.valor != null ? String(extracted.data.hospedagem.valor) : '',
      moeda: extracted.data.hospedagem?.moeda ?? 'BRL',
    },
    transporte: {
      tipo: extracted.data.transporte?.tipo ?? '',
      operadora: extracted.data.transporte?.operadora ?? '',
      origem: extracted.data.transporte?.origem ?? '',
      destino: extracted.data.transporte?.destino ?? '',
      data: toDateTimeInput(extracted.data.transporte?.data),
      status: extracted.data.transporte?.status ?? 'pendente',
      valor: extracted.data.transporte?.valor != null ? String(extracted.data.transporte.valor) : '',
      moeda: extracted.data.transporte?.moeda ?? 'BRL',
    },
    restaurante: {
      nome: extracted.data.restaurante?.nome ?? '',
      cidade: extracted.data.restaurante?.cidade ?? '',
      tipo: extracted.data.restaurante?.tipo ?? '',
      rating: extracted.data.restaurante?.rating != null ? String(extracted.data.restaurante.rating) : '',
    },
  };
}

function formatCurrency(value?: number | null, currency: string = 'BRL') {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
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
  if (lower.includes('extração') || lower.includes('edge function') || lower.includes('failed to send a request')) {
    return 'A IA não respondeu com dados suficientes agora. Preenchemos um rascunho para revisão.';
  }
  if (lower.includes('metadados')) {
    return 'O registro do anexo não foi concluído, mas você ainda pode salvar a reserva.';
  }
  return 'Alguns dados exigem revisão manual antes de salvar.';
}

function queueStatusLabel(status: QueueStatus) {
  if (status === 'pending') return 'Aguardando';
  if (status === 'processing') return 'Analisando';
  if (status === 'review') return 'Revisar';
  if (status === 'saving') return 'Salvando';
  if (status === 'saved') return 'Salvo';
  return 'Falha';
}

function queueStatusVariant(status: QueueStatus): 'secondary' | 'default' | 'destructive' {
  if (status === 'saved') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

function makeQueueItem(file: File): ImportQueueItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    status: 'pending',
    visualSteps: defaultVisualSteps(),
    warnings: [],
    confidence: null,
    missingFields: [],
    identifiedType: null,
    reviewState: null,
    rawText: '',
    summary: null,
    hotelPhotos: [],
    photoIndex: 0,
  };
}

export function ImportReservationDialog() {
  const { user } = useAuth();
  const { currentTrip, currentTripId } = useTrip();

  const documentsModule = useModuleData('documentos');
  const flightsModule = useModuleData('voos');
  const staysModule = useModuleData('hospedagens');
  const transportsModule = useModuleData('transportes');
  const restaurantsModule = useModuleData('restaurantes');

  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<ImportQueueItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const descriptionId = useId();
  const fileInputId = useId();

  const activeItem = useMemo(() => queue.find((item) => item.id === activeId) ?? null, [queue, activeId]);

  const canProcess = queue.length > 0 && !!user && !!currentTripId && !isProcessingBatch;

  const visualProgress = useMemo(() => {
    if (!activeItem) return 0;
    const total = VISUAL_STEPS.length;
    const done = VISUAL_STEPS.reduce((count, step) => count + (activeItem.visualSteps[step.key] === 'completed' ? 1 : 0), 0);
    return Math.round((done / total) * 100);
  }, [activeItem]);

  const pipelineStatusText = useMemo(() => {
    if (!activeItem) return 'Selecione os arquivos e clique em “Analisar arquivos”.';
    if (activeItem.status === 'processing') return `Analisando ${activeItem.file.name}...`;
    if (activeItem.status === 'saving') return 'Salvando no módulo correto...';
    if (activeItem.status === 'saved') return 'Arquivo salvo com sucesso.';
    if (activeItem.status === 'failed') return 'Não foi possível concluir este arquivo. Você pode tentar novamente.';
    if (activeItem.status === 'review') return 'Revise os campos e salve no módulo detectado.';
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
    const nextQueue = valid.map(makeQueueItem);
    setQueue(nextQueue);
    setActiveId(nextQueue[0]?.id ?? null);
  };

  const processOneFile = async (itemId: string) => {
    const item = queue.find((entry) => entry.id === itemId);
    if (!item || !user || !currentTripId) return;

    const file = item.file;

    setItem(itemId, (current) => ({
      ...current,
      status: 'processing',
      warnings: [],
      confidence: null,
      missingFields: [],
      identifiedType: null,
      reviewState: null,
      rawText: '',
      summary: null,
      hotelPhotos: [],
      photoIndex: 0,
      visualSteps: { ...defaultVisualSteps(), read: 'in_progress' },
    }));

    const localWarnings: string[] = [];

    try {
      const upload = await uploadImportFile(file, user.id, currentTripId);
      if (!upload.uploaded && upload.warning) {
        localWarnings.push(upload.warning);
      }

      try {
        await documentsModule.create({
          nome: file.name,
          tipo: `importacao/${upload.ext}`,
          arquivo_url: upload.path ?? null,
        } as Omit<TablesInsert<'documentos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>);
      } catch (metadataError) {
        console.error('[import][metadata_failure]', { file: file.name, error: metadataError });
        localWarnings.push('Falha ao registrar metadados do anexo.');
      }

      const native = await tryExtractNativeText(file);
      let extractedText = native.text ?? '';

      if (!native.text) {
        try {
          const ocr = await runOcrDocument(file);
          extractedText = ocr.text ?? '';
          localWarnings.push(...ocr.warnings);
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

      const resolvedType = resolveImportType(extracted, extractedText, file.name);
      const review = toReviewState(extracted, resolvedType);

      setItem(itemId, (current) => ({
        ...current,
        status: 'review',
        warnings: localWarnings,
        confidence: extracted.confidence,
        missingFields: extracted.missingFields ?? [],
        identifiedType: resolvedType,
        reviewState: review,
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
    } catch (error) {
      console.error('[import][pipeline_fatal]', { file: file.name, error });
      const fallbackWarning = error instanceof Error ? error.message : 'Falha geral na análise.';
      setItem(itemId, (current) => ({
        ...current,
        status: 'failed',
        warnings: localWarnings.concat(fallbackWarning),
        visualSteps: {
          ...current.visualSteps,
          read: 'failed',
        },
      }));
    }
  };

  const runBatch = async () => {
    if (!canProcess) return;
    setIsProcessingBatch(true);

    const targets = queue.map((item) => item.id);
    for (const itemId of targets) {
      setActiveId(itemId);
      // eslint-disable-next-line no-await-in-loop
      await processOneFile(itemId);
    }

    setIsProcessingBatch(false);
    toast.success('Análise concluída. Revise e salve cada item.');
  };

  const updateActiveReview = (updater: (review: ReviewState) => ReviewState) => {
    if (!activeItem?.reviewState) return;
    setItem(activeItem.id, (item) => {
      if (!item.reviewState) return item;
      return { ...item, reviewState: updater(item.reviewState) };
    });
  };

  const saveActiveReviewed = async () => {
    if (!activeItem?.reviewState) return;

    const reviewState = activeItem.reviewState;
    setIsSaving(true);
    setItem(activeItem.id, (item) => ({ ...item, status: 'saving' }));
    setItemStep(activeItem.id, 'saving', 'in_progress');

    try {
      let flightsAfter = [...flightsModule.data];
      let staysAfter = [...staysModule.data];
      let transportsAfter = [...transportsModule.data];

      let title = 'Reserva importada';
      let subtitle = 'Dados salvos com sucesso';
      let amount: number | null = null;
      let currency = 'BRL';
      let checkIn: string | null = null;
      let checkOut: string | null = null;
      let photos: string[] = [];

      if (reviewState.type === 'voo') {
        const payload: Omit<TablesInsert<'voos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          numero: reviewState.voo.numero || null,
          companhia: reviewState.voo.companhia || null,
          origem: reviewState.voo.origem || null,
          destino: reviewState.voo.destino || null,
          data: reviewState.voo.data ? new Date(reviewState.voo.data).toISOString() : null,
          status: reviewState.voo.status,
          valor: reviewState.voo.valor ? Number(reviewState.voo.valor) : null,
          moeda: reviewState.voo.moeda || 'BRL',
        };
        const created = await flightsModule.create(payload);
        if (created) flightsAfter = [created, ...flightsAfter];

        title = payload.numero || payload.companhia || 'Voo importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      }

      if (reviewState.type === 'hospedagem') {
        const payload: Omit<TablesInsert<'hospedagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          nome: reviewState.hospedagem.nome || null,
          localizacao: reviewState.hospedagem.localizacao || null,
          check_in: reviewState.hospedagem.check_in || null,
          check_out: reviewState.hospedagem.check_out || null,
          status: reviewState.hospedagem.status,
          valor: reviewState.hospedagem.valor ? Number(reviewState.hospedagem.valor) : null,
          moeda: reviewState.hospedagem.moeda || 'BRL',
          dica_viagem: null,
          como_chegar: null,
          atracoes_proximas: null,
          restaurantes_proximos: null,
          dica_ia: null,
        };

        const created = await staysModule.create(payload);
        if (created) {
          staysAfter = [created, ...staysAfter];
          setItemStep(activeItem.id, 'photos', 'in_progress');
          photos = hotelPhotoUrls(created.nome ?? '', created.localizacao ?? '');
          setItemStep(activeItem.id, 'photos', 'completed');

          setItemStep(activeItem.id, 'tips', 'in_progress');
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
          setItemStep(activeItem.id, 'tips', 'completed');
        }

        title = payload.nome || 'Hospedagem importada';
        subtitle = `${payload.localizacao || 'Local não informado'} · ${payload.check_in || 'sem check-in'} a ${payload.check_out || 'sem check-out'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        checkIn = payload.check_in ?? null;
        checkOut = payload.check_out ?? null;
      }

      if (reviewState.type === 'transporte') {
        const payload: Omit<TablesInsert<'transportes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          tipo: reviewState.transporte.tipo || null,
          operadora: reviewState.transporte.operadora || null,
          origem: reviewState.transporte.origem || null,
          destino: reviewState.transporte.destino || null,
          data: reviewState.transporte.data ? new Date(reviewState.transporte.data).toISOString() : null,
          status: reviewState.transporte.status,
          valor: reviewState.transporte.valor ? Number(reviewState.transporte.valor) : null,
          moeda: reviewState.transporte.moeda || 'BRL',
        };

        const created = await transportsModule.create(payload);
        if (created) transportsAfter = [created, ...transportsAfter];

        title = payload.tipo || payload.operadora || 'Transporte importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
      }

      if (reviewState.type === 'restaurante') {
        const payload: Omit<TablesInsert<'restaurantes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
          nome: reviewState.restaurante.nome || 'Restaurante importado',
          cidade: reviewState.restaurante.cidade || null,
          tipo: reviewState.restaurante.tipo || null,
          rating: reviewState.restaurante.rating ? Number(reviewState.restaurante.rating) : null,
          salvo: true,
        };

        await restaurantsModule.create(payload);
        title = payload.nome;
        subtitle = `${payload.cidade || 'Cidade não informada'} · ${payload.tipo || 'Tipo não informado'}`;
        setItemStep(activeItem.id, 'photos', 'skipped');
        setItemStep(activeItem.id, 'tips', 'skipped');
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
        type: reviewState.type,
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

      toast.success(`${typeLabel(reviewState.type)} salvo com sucesso.`);
    } catch (error) {
      console.error('[import][save_failure]', error);
      setItem(activeItem.id, (item) => ({
        ...item,
        status: 'review',
        warnings: item.warnings.concat(error instanceof Error ? error.message : 'Falha ao salvar item.'),
        visualSteps: {
          ...item.visualSteps,
          saving: 'failed',
          done: 'failed',
        },
      }));
      toast.error('Falha ao salvar este item revisado.');
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
        <Button aria-label="Abrir importação de reserva">
          <FileUp className="mr-2 h-4 w-4" />
          Importar reservas
        </Button>
      </DialogTrigger>

      <DialogContent className="tp-scroll max-h-[92vh] overflow-y-auto border-primary/20 bg-gradient-to-b from-white to-slate-50/90 sm:max-w-5xl" aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            Importação inteligente de reservas
          </DialogTitle>
          <DialogDescription id={descriptionId}>
            Envie vários arquivos (voo, hospedagem, transporte ou restaurante). A IA classifica e prepara revisão item a item.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="border-primary/15 bg-white/90 shadow-sm">
            <CardContent className="pt-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor={fileInputId}>Arquivos da viagem</Label>
                  <Input
                    id={fileInputId}
                    type="file"
                    multiple
                    accept=".txt,.html,.eml,.pdf,.png,.jpg,.jpeg,.webp"
                    onChange={(event) => onSelectFiles(event.target.files)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode subir vários arquivos ao mesmo tempo. Formatos: txt, html, eml, pdf, png, jpg e webp.
                  </p>
                </div>
                <div className="flex items-end">
                  <Button onClick={runBatch} disabled={!canProcess} aria-label="Analisar arquivos selecionados">
                    {isProcessingBatch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                    Analisar arquivos
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {queue.length > 0 && (
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
                        onClick={() => setActiveId(item.id)}
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
          )}

          {activeItem && (
            <Card className="border-primary/15 bg-white/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Análise do arquivo selecionado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/20 px-3 py-2">
                  <p className="text-sm font-medium">{activeItem.file.name}</p>
                  <p className="text-xs text-muted-foreground">{pipelineStatusText}</p>
                </div>

                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500 transition-all duration-500"
                      style={{ width: `${visualProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{visualProgress}% concluído</p>
                </div>

                <div className="grid gap-3 md:grid-cols-6">
                  {VISUAL_STEPS.map((step, index) => {
                    const status = activeItem.visualSteps[step.key];
                    const isDone = status === 'completed';
                    const isActive = status === 'in_progress';
                    const isFailed = status === 'failed';
                    return (
                      <div key={step.key} className="relative flex flex-col items-center gap-2 text-center">
                        {index < VISUAL_STEPS.length - 1 && (
                          <span
                            className={`absolute left-[calc(50%+1rem)] top-4 hidden h-0.5 w-[calc(100%-2rem)] md:block ${isDone ? 'bg-primary' : 'bg-border'}`}
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
          )}

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

          {activeItem?.reviewState && (
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Revisão manual assistida</CardTitle>
                  <Badge variant={activeItem.missingFields.length > 0 ? 'destructive' : 'secondary'}>
                    Campos para confirmar: {activeItem.missingFields.length}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo detectado</Label>
                  <Select
                    value={activeItem.reviewState.type}
                    onValueChange={(value: ImportType) => updateActiveReview((review) => ({ ...review, type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voo">Voo</SelectItem>
                      <SelectItem value="hospedagem">Hospedagem</SelectItem>
                      <SelectItem value="transporte">Transporte</SelectItem>
                      <SelectItem value="restaurante">Restaurante</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {activeItem.reviewState.type === 'voo' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Número do voo" value={activeItem.reviewState.voo.numero} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, numero: e.target.value } }))} />
                    <Input placeholder="Companhia" value={activeItem.reviewState.voo.companhia} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, companhia: e.target.value } }))} />
                    <Input placeholder="Origem" value={activeItem.reviewState.voo.origem} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, origem: e.target.value } }))} />
                    <Input placeholder="Destino" value={activeItem.reviewState.voo.destino} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, destino: e.target.value } }))} />
                    <Input type="datetime-local" value={activeItem.reviewState.voo.data} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, data: e.target.value } }))} />
                    <Select value={activeItem.reviewState.voo.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, status: value } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={activeItem.reviewState.voo.valor} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, valor: e.target.value } }))} />
                    <Input placeholder="Moeda" value={activeItem.reviewState.voo.moeda} onChange={(e) => updateActiveReview((review) => ({ ...review, voo: { ...review.voo, moeda: e.target.value.toUpperCase() } }))} />
                  </div>
                )}

                {activeItem.reviewState.type === 'hospedagem' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Nome da hospedagem" value={activeItem.reviewState.hospedagem.nome} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, nome: e.target.value } }))} />
                    <Input placeholder="Localização" value={activeItem.reviewState.hospedagem.localizacao} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, localizacao: e.target.value } }))} />
                    <Input type="date" value={activeItem.reviewState.hospedagem.check_in} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_in: e.target.value } }))} />
                    <Input type="date" value={activeItem.reviewState.hospedagem.check_out} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_out: e.target.value } }))} />
                    <Select value={activeItem.reviewState.hospedagem.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, status: value } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={activeItem.reviewState.hospedagem.valor} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, valor: e.target.value } }))} />
                    <Input placeholder="Moeda" value={activeItem.reviewState.hospedagem.moeda} onChange={(e) => updateActiveReview((review) => ({ ...review, hospedagem: { ...review.hospedagem, moeda: e.target.value.toUpperCase() } }))} />
                  </div>
                )}

                {activeItem.reviewState.type === 'transporte' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Tipo de transporte" value={activeItem.reviewState.transporte.tipo} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, tipo: e.target.value } }))} />
                    <Input placeholder="Operadora" value={activeItem.reviewState.transporte.operadora} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, operadora: e.target.value } }))} />
                    <Input placeholder="Origem" value={activeItem.reviewState.transporte.origem} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, origem: e.target.value } }))} />
                    <Input placeholder="Destino" value={activeItem.reviewState.transporte.destino} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, destino: e.target.value } }))} />
                    <Input type="datetime-local" value={activeItem.reviewState.transporte.data} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, data: e.target.value } }))} />
                    <Select value={activeItem.reviewState.transporte.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, status: value } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={activeItem.reviewState.transporte.valor} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, valor: e.target.value } }))} />
                    <Input placeholder="Moeda" value={activeItem.reviewState.transporte.moeda} onChange={(e) => updateActiveReview((review) => ({ ...review, transporte: { ...review.transporte, moeda: e.target.value.toUpperCase() } }))} />
                  </div>
                )}

                {activeItem.reviewState.type === 'restaurante' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Nome do restaurante" value={activeItem.reviewState.restaurante.nome} onChange={(e) => updateActiveReview((review) => ({ ...review, restaurante: { ...review.restaurante, nome: e.target.value } }))} />
                    <Input placeholder="Cidade" value={activeItem.reviewState.restaurante.cidade} onChange={(e) => updateActiveReview((review) => ({ ...review, restaurante: { ...review.restaurante, cidade: e.target.value } }))} />
                    <Input placeholder="Tipo (ex.: italiano, japonês)" value={activeItem.reviewState.restaurante.tipo} onChange={(e) => updateActiveReview((review) => ({ ...review, restaurante: { ...review.restaurante, tipo: e.target.value } }))} />
                    <Input placeholder="Rating (0-5)" type="number" step="0.1" min="0" max="5" value={activeItem.reviewState.restaurante.rating} onChange={(e) => updateActiveReview((review) => ({ ...review, restaurante: { ...review.restaurante, rating: e.target.value } }))} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeItem?.summary && (
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
                    <div className="flex items-center justify-between border-t bg-background px-3 py-2 text-xs">
                      <span>Foto {activeItem.photoIndex + 1}/{activeItem.hotelPhotos.length}</span>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => setItem(activeItem.id, (item) => ({ ...item, photoIndex: item.photoIndex === 0 ? item.hotelPhotos.length - 1 : item.photoIndex - 1 }))}>Anterior</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setItem(activeItem.id, (item) => ({ ...item, photoIndex: (item.photoIndex + 1) % item.hotelPhotos.length }))}>Próxima</Button>
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
          )}

          {queue.length > 0 && (
            <Card className="border-border/50 bg-muted/20">
              <CardContent className="flex items-center justify-between gap-3 py-3">
                <div className="text-sm text-muted-foreground">
                  {queue.filter((item) => item.status === 'saved').length} de {queue.length} arquivo(s) salvos.
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  Salve cada item revisado para concluir a importação em lote.
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} aria-label="Fechar modal de importação">Fechar</Button>
          {allSaved ? (
            <Button variant="outline" onClick={resetDialogState} aria-label="Iniciar nova importação">
              Nova importação
            </Button>
          ) : (
            <Button onClick={saveActiveReviewed} disabled={!activeItem?.reviewState || isSaving} aria-label="Salvar item revisado">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar item revisado
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
