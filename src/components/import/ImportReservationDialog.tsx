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
import { CheckCircle2, CircleDashed, FileUp, Loader2, TriangleAlert, WandSparkles, Check, Circle } from 'lucide-react';
import { toast } from 'sonner';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type VisualStepKey = 'read' | 'identified' | 'saving' | 'photos' | 'tips' | 'done';

type StepKey = 'upload' | 'metadata' | 'native' | 'ocr' | 'extract' | 'review';

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

const PIPELINE_STEPS: { key: StepKey; label: string }[] = [
  { key: 'upload', label: '1. Upload do arquivo' },
  { key: 'metadata', label: '2. Persistência de metadados' },
  { key: 'native', label: '3. Leitura de texto nativo' },
  { key: 'ocr', label: '4. OCR em camadas (fallback)' },
  { key: 'extract', label: '5. Extração IA estruturada' },
  { key: 'review', label: '6. Revisão manual e salvamento' },
];

const defaultSteps = (): Record<StepKey, StepStatus> => ({
  upload: 'pending',
  metadata: 'pending',
  native: 'pending',
  ocr: 'pending',
  extract: 'pending',
  review: 'pending',
});

const VISUAL_STEPS: { key: VisualStepKey; label: string }[] = [
  { key: 'read', label: 'Lendo documento' },
  { key: 'identified', label: 'Reserva identificada' },
  { key: 'saving', label: 'Salvando reserva' },
  { key: 'photos', label: 'Buscando fotos' },
  { key: 'tips', label: 'Gerando dicas' },
  { key: 'done', label: 'Pronto!' },
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

function inferTypeFromData(extracted: ExtractedReservation): ImportType {
  const voo = extracted.data.voo;
  const hospedagem = extracted.data.hospedagem;
  const transporte = extracted.data.transporte;

  const scores: Record<ImportType, number> = {
    voo: filledCount([voo?.numero, voo?.companhia, voo?.origem, voo?.destino, voo?.data, voo?.valor]),
    hospedagem: filledCount([hospedagem?.nome, hospedagem?.localizacao, hospedagem?.check_in, hospedagem?.check_out, hospedagem?.valor]),
    transporte: filledCount([transporte?.tipo, transporte?.operadora, transporte?.origem, transporte?.destino, transporte?.data, transporte?.valor]),
  };

  const ordered = (Object.entries(scores) as Array<[ImportType, number]>).sort((a, b) => b[1] - a[1]);
  return ordered[0][0];
}

function toReviewState(extracted: ExtractedReservation): ReviewState {
  const defaultType: ImportType = extracted.type ?? inferTypeFromData(extracted);
  return {
    type: defaultType,
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

function identifyLabel(type: ImportType | null | undefined) {
  if (type === 'hospedagem') return 'Hotel identificado';
  if (type === 'voo') return 'Voo identificado';
  if (type === 'transporte') return 'Transporte identificado';
  return 'Reserva identificada';
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

export function ImportReservationDialog() {
  const { user } = useAuth();
  const { currentTrip, currentTripId } = useTrip();

  const documentsModule = useModuleData('documentos');
  const flightsModule = useModuleData('voos');
  const staysModule = useModuleData('hospedagens');
  const transportsModule = useModuleData('transportes');

  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(defaultSteps);
  const [visualSteps, setVisualSteps] = useState<Record<VisualStepKey, StepStatus>>(defaultVisualSteps);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [identifiedType, setIdentifiedType] = useState<ImportType | null>(null);
  const [hotelPhotos, setHotelPhotos] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const descriptionId = useId();
  const fileInputId = useId();

  const canProcess = !!file && !!user && !!currentTripId && !isProcessing;

  const visualStepsWithLabel = useMemo(() => {
    const identifiedLabel = identifyLabel(identifiedType ?? reviewState?.type ?? null);
    return VISUAL_STEPS.map((step) => (step.key === 'identified' ? { ...step, label: identifiedLabel } : step));
  }, [identifiedType, reviewState?.type]);

  const extractedPreview = useMemo(() => {
    if (!reviewState) return null;

    if (reviewState.type === 'hospedagem') {
      return {
        title: reviewState.hospedagem.nome || 'Hospedagem identificada',
        subtitle: reviewState.hospedagem.localizacao || 'Localização não informada',
        amount: reviewState.hospedagem.valor ? Number(reviewState.hospedagem.valor) : null,
        currency: reviewState.hospedagem.moeda || 'BRL',
        checkIn: reviewState.hospedagem.check_in || null,
        checkOut: reviewState.hospedagem.check_out || null,
      };
    }

    if (reviewState.type === 'voo') {
      return {
        title: reviewState.voo.numero || reviewState.voo.companhia || 'Voo identificado',
        subtitle: `${reviewState.voo.origem || 'Origem'} → ${reviewState.voo.destino || 'Destino'}`,
        amount: reviewState.voo.valor ? Number(reviewState.voo.valor) : null,
        currency: reviewState.voo.moeda || 'BRL',
        checkIn: null,
        checkOut: null,
      };
    }

    return {
      title: reviewState.transporte.tipo || reviewState.transporte.operadora || 'Transporte identificado',
      subtitle: `${reviewState.transporte.origem || 'Origem'} → ${reviewState.transporte.destino || 'Destino'}`,
      amount: reviewState.transporte.valor ? Number(reviewState.transporte.valor) : null,
      currency: reviewState.transporte.moeda || 'BRL',
      checkIn: null,
      checkOut: null,
    };
  }, [reviewState]);

  const pipelineStatusText = useMemo(() => {
    if (isProcessing) return 'Processando importação...';
    if (isSaving) return 'Salvando reserva e finalizando etapas...';
    if (summary) return 'Importação concluída. Confira o resumo e próximos passos.';
    if (!reviewState) return 'Selecione um arquivo e execute o pipeline.';
    return 'Revisão pronta. Ajuste os campos e salve no módulo correto.';
  }, [isProcessing, isSaving, reviewState, summary]);

  const setStep = (key: StepKey, status: StepStatus) => {
    setSteps((prev) => ({ ...prev, [key]: status }));
  };

  const setVisualStep = (key: VisualStepKey, status: StepStatus) => {
    setVisualSteps((prev) => ({ ...prev, [key]: status }));
  };

  const runPipeline = async () => {
    if (!file || !user || !currentTripId) {
      toast.error('Sessão inválida para importar reserva.');
      return;
    }

    if (!isAllowedImportFile(file)) {
      toast.error('Formato não suportado. Use txt, html, eml, pdf, png, jpg ou webp.');
      return;
    }

    setIsProcessing(true);
    setWarnings([]);
    setRawText('');
    setConfidence(null);
    setMissingFields([]);
    setReviewState(null);
    setIdentifiedType(null);
    setSummary(null);
    setHotelPhotos([]);
    setPhotoIndex(0);
    setSteps(defaultSteps());
    setVisualSteps(defaultVisualSteps());
    setVisualStep('read', 'in_progress');

    try {
      setStep('upload', 'in_progress');
      const upload = await uploadImportFile(file, user.id, currentTripId);
      setStep('upload', 'completed');

      setStep('metadata', 'in_progress');
      await documentsModule.create({
        nome: file.name,
        tipo: `importacao/${upload.ext}`,
        arquivo_url: upload.path,
      } as Omit<TablesInsert<'documentos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>);
      setStep('metadata', 'completed');

      setStep('native', 'in_progress');
      const native = await tryExtractNativeText(file);
      let extractedText = native.text;
      if (native.text) {
        setStep('native', 'completed');
        setStep('ocr', 'skipped');
      } else {
        setStep('native', 'completed');
        setStep('ocr', 'in_progress');
        try {
          const ocr = await runOcrDocument(file);
          extractedText = ocr.text;
          setWarnings((prev) => prev.concat(ocr.warnings));
          setStep('ocr', 'completed');
        } catch (ocrError) {
          console.error('[import][ocr_failure]', { file: file.name, error: ocrError });
          const message = ocrError instanceof Error ? ocrError.message : 'OCR falhou.';
          setWarnings((prev) => prev.concat(`${message} Revise manualmente os campos antes de salvar.`));
          setStep('ocr', 'failed');
        }
      }

      setRawText(extractedText || '');
      setVisualStep('read', 'completed');

      setStep('extract', 'in_progress');
      setVisualStep('identified', 'in_progress');
      if (extractedText && extractedText.trim().length > 20) {
        try {
          const extracted = await extractReservationStructured(extractedText, file.name);
          setConfidence(extracted.confidence);
          setMissingFields(extracted.missingFields || []);
          setIdentifiedType(extracted.type ?? null);
          setReviewState(toReviewState(extracted));
          setStep('extract', 'completed');
          setVisualStep('identified', 'completed');
        } catch (extractError) {
          console.error('[import][extract_failure]', { file: file.name, error: extractError });
          const message = extractError instanceof Error ? extractError.message : 'Falha na extração IA.';
          setWarnings((prev) => prev.concat(`${message} Fluxo segue em revisão assistida.`));
          setStep('extract', 'failed');
          setVisualStep('identified', 'failed');
          setIdentifiedType('hospedagem');
          setReviewState({
            type: 'hospedagem',
            voo: { numero: '', companhia: '', origem: '', destino: '', data: '', status: 'pendente', valor: '', moeda: 'BRL' },
            hospedagem: { nome: '', localizacao: currentTrip?.destino ?? '', check_in: '', check_out: '', status: 'pendente', valor: '', moeda: 'BRL' },
            transporte: { tipo: '', operadora: '', origem: '', destino: '', data: '', status: 'pendente', valor: '', moeda: 'BRL' },
          });
        }
      } else {
        setWarnings((prev) => prev.concat('Sem texto suficiente para IA. Preencha os campos manualmente.'));
        setStep('extract', 'failed');
        setVisualStep('identified', 'failed');
        setIdentifiedType('hospedagem');
        setReviewState({
          type: 'hospedagem',
          voo: { numero: '', companhia: '', origem: '', destino: '', data: '', status: 'pendente', valor: '', moeda: 'BRL' },
          hospedagem: { nome: '', localizacao: currentTrip?.destino ?? '', check_in: '', check_out: '', status: 'pendente', valor: '', moeda: 'BRL' },
          transporte: { tipo: '', operadora: '', origem: '', destino: '', data: '', status: 'pendente', valor: '', moeda: 'BRL' },
        });
      }

      setStep('review', 'in_progress');
      toast.success('Pipeline concluído. Revise os campos antes de salvar.');
    } catch (error) {
      console.error('[import][pipeline_fatal]', { file: file.name, error });
      const message = error instanceof Error ? error.message : 'Falha no pipeline de importação.';
      toast.error(message);
      setVisualStep('read', 'failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveReviewed = async () => {
    if (!reviewState) return;
    setIsSaving(true);
    setVisualStep('saving', 'in_progress');
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
        if (created) {
          flightsAfter = [created, ...flightsAfter];
        }
        title = payload.numero || payload.companhia || 'Voo importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setVisualStep('photos', 'skipped');
        setVisualStep('tips', 'skipped');
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
          setVisualStep('photos', 'in_progress');
          setHotelPhotos(hotelPhotoUrls(created.nome ?? '', created.localizacao ?? ''));
          setPhotoIndex(0);
          setVisualStep('photos', 'completed');

          setVisualStep('tips', 'in_progress');
          const tips = await generateStayTips({
            hotelName: created.nome,
            location: created.localizacao,
            checkIn: created.check_in,
            checkOut: created.check_out,
            tripDestination: currentTrip?.destino,
          });
          if (tips.data) {
            try {
              await staysModule.update({
                id: created.id,
                updates: tips.data,
              });
              staysAfter = [
                { ...created, ...tips.data },
                ...staysAfter.filter((item) => item.id !== created.id),
              ];
            } catch (enrichError) {
              console.error('[import][stay_tips_update_failed]', enrichError);
              setWarnings((prev) => prev.concat('A reserva foi salva, mas as dicas IA não puderam ser persistidas agora.'));
            }
          }
          if (tips.fromFallback) {
            setWarnings((prev) => prev.concat('IA de dicas em fallback: revise manualmente antes da viagem.'));
          }
          setVisualStep('tips', 'completed');
        } else {
          setVisualStep('photos', 'failed');
          setVisualStep('tips', 'failed');
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
        if (created) {
          transportsAfter = [created, ...transportsAfter];
        }
        title = payload.tipo || payload.operadora || 'Transporte importado';
        subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
        amount = payload.valor ?? null;
        currency = payload.moeda ?? 'BRL';
        setVisualStep('photos', 'skipped');
        setVisualStep('tips', 'skipped');
      }

      setStep('review', 'completed');
      setVisualStep('saving', 'completed');

      const stayGaps = calculateStayCoverageGaps(
        staysAfter,
        currentTrip?.data_inicio ?? null,
        currentTrip?.data_fim ?? null,
      );
      const transportGaps = calculateTransportCoverageGaps(
        staysAfter,
        transportsAfter,
        flightsAfter,
      );

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

      setSummary({
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
      });

      setVisualStep('done', 'completed');
      toast.success('Reserva importada e salva com sucesso.');
    } catch (error) {
      console.error('[import][save_failure]', error);
      const message = error instanceof Error ? error.message : 'Falha ao salvar reserva revisada.';
      toast.error(message);
      setStep('review', 'failed');
      setVisualStep('saving', 'failed');
      setVisualStep('done', 'failed');
    } finally {
      setIsSaving(false);
    }
  };

  const resetDialogState = () => {
    setFile(null);
    setWarnings([]);
    setRawText('');
    setConfidence(null);
    setMissingFields([]);
    setReviewState(null);
    setIdentifiedType(null);
    setSummary(null);
    setHotelPhotos([]);
    setPhotoIndex(0);
    setSteps(defaultSteps());
    setVisualSteps(defaultVisualSteps());
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          resetDialogState();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button aria-label="Abrir importação de reserva">
          <FileUp className="mr-2 h-4 w-4" />
          Importar reserva
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl" aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle>Importação completa de reserva</DialogTitle>
          <DialogDescription id={descriptionId}>
            Upload + OCR + IA + revisão assistida para salvar em voo, hospedagem ou transporte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor={fileInputId}>Arquivo da reserva</Label>
              <Input
                id={fileInputId}
                type="file"
                accept=".txt,.html,.eml,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: txt, html, eml, pdf, png, jpg, webp.
              </p>
            </div>
            <div className="flex items-end">
              <Button onClick={runPipeline} disabled={!canProcess} aria-label="Executar pipeline de importação">
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                Executar pipeline
              </Button>
            </div>
          </div>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Importando...</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-6">
                {visualStepsWithLabel.map((step, index) => {
                  const status = visualSteps[step.key];
                  const isDone = status === 'completed';
                  const isActive = status === 'in_progress';
                  const isFailed = status === 'failed';
                  return (
                    <div key={step.key} className="relative flex flex-col items-center gap-2 text-center">
                      {index < visualStepsWithLabel.length - 1 && (
                        <span
                          className={`absolute left-[calc(50%+1rem)] top-4 hidden h-0.5 w-[calc(100%-2rem)] md:block ${
                            isDone ? 'bg-primary' : 'bg-border'
                          }`}
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

              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Analisando com IA: {file?.name || 'arquivo da reserva'}
                </p>
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                {PIPELINE_STEPS.map((step) => {
                  const status = steps[step.key];
                  return (
                    <div key={step.key} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{step.label}</span>
                      <div className="flex items-center gap-2">
                        {status === 'in_progress' && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
                        {status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        {status === 'failed' && <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />}
                        {status === 'pending' && <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
                        {status === 'skipped' && <Badge variant="secondary" className="text-[10px]">Não necessário</Badge>}
                        <Badge variant={status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px]">{status}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="pt-1 text-xs text-muted-foreground" role="status" aria-live="polite">{pipelineStatusText}</p>
            </CardContent>
          </Card>

          {warnings.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5" role="alert">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Avisos de processamento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {warnings.map((warning) => (
                  <p key={warning}>- {warning}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {reviewState && (
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="text-base">Revisão manual assistida</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Confiança IA: {confidence != null ? `${Math.round(confidence * 100)}%` : 'N/A'}</Badge>
                    <Badge variant={missingFields.length > 0 ? 'destructive' : 'secondary'}>
                      Missing fields: {missingFields.length}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {extractedPreview && (
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <p className="text-sm text-muted-foreground">Dados extraídos</p>
                    <p className="text-lg font-semibold">{extractedPreview.title}</p>
                    <p className="text-sm text-muted-foreground">{extractedPreview.subtitle}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border bg-background p-2">
                        <p className="text-[11px] text-muted-foreground">Check-in</p>
                        <p className="font-medium">{toDateLabel(extractedPreview.checkIn)}</p>
                      </div>
                      <div className="rounded-lg border bg-background p-2">
                        <p className="text-[11px] text-muted-foreground">Check-out</p>
                        <p className="font-medium">{toDateLabel(extractedPreview.checkOut)}</p>
                      </div>
                      <div className="rounded-lg border bg-background p-2">
                        <p className="text-[11px] text-muted-foreground">Valor</p>
                        <p className="font-medium">{formatCurrency(extractedPreview.amount, extractedPreview.currency)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Tipo detectado</Label>
                  <Select value={reviewState.type} onValueChange={(value: ImportType) => setReviewState((prev) => prev ? { ...prev, type: value } : prev)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voo">Voo</SelectItem>
                      <SelectItem value="hospedagem">Hospedagem</SelectItem>
                      <SelectItem value="transporte">Transporte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {reviewState.type === 'voo' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Número" value={reviewState.voo.numero} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, numero: e.target.value } } : prev)} />
                    <Input placeholder="Companhia" value={reviewState.voo.companhia} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, companhia: e.target.value } } : prev)} />
                    <Input placeholder="Origem" value={reviewState.voo.origem} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, origem: e.target.value } } : prev)} />
                    <Input placeholder="Destino" value={reviewState.voo.destino} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, destino: e.target.value } } : prev)} />
                    <Input type="datetime-local" value={reviewState.voo.data} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, data: e.target.value } } : prev)} />
                    <Select value={reviewState.voo.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, status: value } } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={reviewState.voo.valor} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, valor: e.target.value } } : prev)} />
                    <Input placeholder="Moeda" value={reviewState.voo.moeda} onChange={(e) => setReviewState((prev) => prev ? { ...prev, voo: { ...prev.voo, moeda: e.target.value.toUpperCase() } } : prev)} />
                  </div>
                )}

                {reviewState.type === 'hospedagem' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Nome" value={reviewState.hospedagem.nome} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, nome: e.target.value } } : prev)} />
                    <Input placeholder="Localização" value={reviewState.hospedagem.localizacao} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, localizacao: e.target.value } } : prev)} />
                    <Input type="date" value={reviewState.hospedagem.check_in} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, check_in: e.target.value } } : prev)} />
                    <Input type="date" value={reviewState.hospedagem.check_out} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, check_out: e.target.value } } : prev)} />
                    <Select value={reviewState.hospedagem.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, status: value } } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={reviewState.hospedagem.valor} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, valor: e.target.value } } : prev)} />
                    <Input placeholder="Moeda" value={reviewState.hospedagem.moeda} onChange={(e) => setReviewState((prev) => prev ? { ...prev, hospedagem: { ...prev.hospedagem, moeda: e.target.value.toUpperCase() } } : prev)} />
                  </div>
                )}

                {reviewState.type === 'transporte' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Tipo" value={reviewState.transporte.tipo} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, tipo: e.target.value } } : prev)} />
                    <Input placeholder="Operadora" value={reviewState.transporte.operadora} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, operadora: e.target.value } } : prev)} />
                    <Input placeholder="Origem" value={reviewState.transporte.origem} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, origem: e.target.value } } : prev)} />
                    <Input placeholder="Destino" value={reviewState.transporte.destino} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, destino: e.target.value } } : prev)} />
                    <Input type="datetime-local" value={reviewState.transporte.data} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, data: e.target.value } } : prev)} />
                    <Select value={reviewState.transporte.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, status: value } } : prev)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="confirmado">Confirmado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Valor" type="number" step="0.01" value={reviewState.transporte.valor} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, valor: e.target.value } } : prev)} />
                    <Input placeholder="Moeda" value={reviewState.transporte.moeda} onChange={(e) => setReviewState((prev) => prev ? { ...prev, transporte: { ...prev.transporte, moeda: e.target.value.toUpperCase() } } : prev)} />
                  </div>
                )}

                {rawText && (
                  <div className="space-y-2">
                    <Label>Texto extraído (resumo)</Label>
                    <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                      {rawText.slice(0, 1500)}
                      {rawText.length > 1500 ? '...' : ''}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {summary && (
            <Card className="border-emerald-500/30 bg-emerald-500/[0.03]">
              <CardHeader>
                <CardTitle className="text-base">Importação concluída</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {summary.type === 'hospedagem' && hotelPhotos.length > 0 && (
                  <div className="overflow-hidden rounded-xl border">
                    <img
                      src={hotelPhotos[photoIndex]}
                      alt={summary.title}
                      className="h-48 w-full object-cover"
                      loading="lazy"
                    />
                    <div className="flex items-center justify-between border-t bg-background px-3 py-2 text-xs">
                      <span>Foto {photoIndex + 1}/{hotelPhotos.length}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPhotoIndex((idx) => (idx === 0 ? hotelPhotos.length - 1 : idx - 1))}
                        >
                          Anterior
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setPhotoIndex((idx) => (idx + 1) % hotelPhotos.length)}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-lg font-semibold">{summary.title}</p>
                  <p className="text-sm text-muted-foreground">{summary.subtitle}</p>
                  {summary.type === 'hospedagem' && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Check-in</p>
                        <p className="font-semibold">{toDateLabel(summary.checkIn)}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Check-out</p>
                        <p className="font-semibold">{toDateLabel(summary.checkOut)}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Noites</p>
                        <p className="font-semibold">{summary.nights ?? '—'}</p>
                      </div>
                    </div>
                  )}
                  {summary.amount != null && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Total original</p>
                        <p className="font-semibold">{formatCurrency(summary.amount, summary.currency)}</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Estimado em BRL</p>
                        <p className="font-semibold">{formatCurrency(summary.estimatedBrl, 'BRL')}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-sm font-semibold">Próximos passos sugeridos</p>
                  <div className="mt-2 space-y-2 text-sm">
                    <p className={`rounded-md border p-2 ${summary.stayGapCount > 0 ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'}`}>
                      {summary.stayGapCount > 0
                        ? `${summary.stayGapCount} período(s) sem hospedagem detectado(s).`
                        : 'Hospedagens cobertas para o período atual.'}
                    </p>
                    <p className={`rounded-md border p-2 ${summary.transportGapCount > 0 ? 'border-amber-400 bg-amber-50' : 'border-emerald-400 bg-emerald-50'}`}>
                      {summary.transportGapCount > 0
                        ? `${summary.transportGapCount} trecho(s) sem transporte entre cidades.`
                        : 'Trechos entre cidades estão cobertos.'}
                    </p>
                    {summary.nextSteps.map((step) => (
                      <p key={step} className="rounded-md border border-border/60 bg-muted/20 p-2 text-muted-foreground">
                        {step}
                      </p>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} aria-label="Fechar modal de importação">Fechar</Button>
          {summary ? (
            <Button
              variant="outline"
              onClick={resetDialogState}
              aria-label="Iniciar nova importação"
            >
              Nova importação
            </Button>
          ) : (
            <Button onClick={saveReviewed} disabled={!reviewState || isSaving} aria-label="Salvar reserva revisada">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar reserva revisada
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
