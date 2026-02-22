import { useMemo, useState } from 'react';
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
import {
  ExtractedReservation,
  ImportType,
  extractReservationStructured,
  isAllowedImportFile,
  runOcrDocument,
  tryExtractNativeText,
  uploadImportFile,
} from '@/services/importPipeline';
import { CheckCircle2, CircleDashed, FileUp, Loader2, TriangleAlert, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

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

function toReviewState(extracted: ExtractedReservation): ReviewState {
  const defaultType: ImportType = extracted.type ?? (extracted.data.hospedagem ? 'hospedagem' : extracted.data.transporte ? 'transporte' : 'voo');
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rawText, setRawText] = useState('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);

  const canProcess = !!file && !!user && !!currentTripId && !isProcessing;

  const pipelineStatusText = useMemo(() => {
    if (isProcessing) return 'Processando importação...';
    if (!reviewState) return 'Selecione um arquivo e execute o pipeline.';
    return 'Revisão pronta. Ajuste os campos e salve no módulo correto.';
  }, [isProcessing, reviewState]);

  const setStep = (key: StepKey, status: StepStatus) => {
    setSteps((prev) => ({ ...prev, [key]: status }));
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
    setSteps(defaultSteps());

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
          setWarnings((prev) => prev.concat('OCR falhou. Revise manualmente os campos antes de salvar.'));
          setStep('ocr', 'failed');
        }
      }

      setRawText(extractedText || '');

      setStep('extract', 'in_progress');
      if (extractedText && extractedText.trim().length > 20) {
        try {
          const extracted = await extractReservationStructured(extractedText, file.name);
          setConfidence(extracted.confidence);
          setMissingFields(extracted.missingFields || []);
          setReviewState(toReviewState(extracted));
          setStep('extract', 'completed');
        } catch (extractError) {
          console.error('[import][extract_failure]', { file: file.name, error: extractError });
          setWarnings((prev) => prev.concat('Falha na extração IA. Fluxo segue em revisão assistida.'));
          setStep('extract', 'failed');
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
      toast.error('Falha no pipeline de importação. Verifique o arquivo e tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveReviewed = async () => {
    if (!reviewState) return;
    setIsSaving(true);
    try {
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
        await flightsModule.create(payload);
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
        await staysModule.create(payload);
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
        await transportsModule.create(payload);
      }

      setStep('review', 'completed');
      toast.success('Reserva importada e salva com sucesso.');
      setOpen(false);
      setFile(null);
      setReviewState(null);
      setWarnings([]);
      setRawText('');
      setSteps(defaultSteps());
    } catch (error) {
      console.error('[import][save_failure]', error);
      toast.error('Falha ao salvar reserva revisada.');
      setStep('review', 'failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="mr-2 h-4 w-4" />
          Importar reserva
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importação completa de reserva</DialogTitle>
          <DialogDescription>
            Upload + OCR + IA + revisão assistida para salvar em voo, hospedagem ou transporte.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>Arquivo da reserva</Label>
              <Input
                type="file"
                accept=".txt,.html,.eml,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: txt, html, eml, pdf, png, jpg, webp.
              </p>
            </div>
            <div className="flex items-end">
              <Button onClick={runPipeline} disabled={!canProcess}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                Executar pipeline
              </Button>
            </div>
          </div>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pipeline (6 etapas)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {PIPELINE_STEPS.map((step) => {
                const status = steps[step.key];
                return (
                  <div key={step.key} className="flex items-center justify-between rounded-md border p-2">
                    <span className="text-sm">{step.label}</span>
                    <div className="flex items-center gap-2">
                      {status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {status === 'failed' && <TriangleAlert className="h-4 w-4 text-amber-600" />}
                      {status === 'pending' && <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                      {status === 'skipped' && <Badge variant="secondary">Não necessário</Badge>}
                      <Badge variant={status === 'failed' ? 'destructive' : 'secondary'}>{status}</Badge>
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-xs text-muted-foreground">{pipelineStatusText}</p>
            </CardContent>
          </Card>

          {warnings.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          <Button onClick={saveReviewed} disabled={!reviewState || isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar reserva revisada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
