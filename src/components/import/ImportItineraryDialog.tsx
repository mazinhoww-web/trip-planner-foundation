import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { supabase } from '@/integrations/supabase/client';
import {
  ExtractedItinerary,
  ExtractedItineraryItem,
  ItineraryItemType,
  extractItineraryStructured,
  isAllowedImportFile,
  runOcrDocument,
  tryExtractNativeText,
} from '@/services/importPipeline';
import { FileUp, Loader2, Plane, Hotel, Bus, Utensils, MapPin, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const TIPO_CONFIG: Record<ItineraryItemType, { label: string; icon: typeof Plane; color: string }> = {
  voo: { label: 'Voo', icon: Plane, color: 'bg-sky-500/15 text-sky-700 border-sky-600/30' },
  hospedagem: { label: 'Hospedagem', icon: Hotel, color: 'bg-emerald-500/15 text-emerald-700 border-emerald-600/30' },
  transporte: { label: 'Transporte', icon: Bus, color: 'bg-amber-500/15 text-amber-700 border-amber-600/30' },
  restaurante: { label: 'Restaurante', icon: Utensils, color: 'bg-rose-500/15 text-rose-700 border-rose-600/30' },
  atividade: { label: 'Atividade', icon: MapPin, color: 'bg-violet-500/15 text-violet-700 border-violet-600/30' },
};

function itemSummary(item: ExtractedItineraryItem): string {
  const d = item.dados;
  switch (item.tipo) {
    case 'voo':
      return [d.companhia, d.numero, d.origem && d.destino ? `${d.origem} → ${d.destino}` : null, d.data].filter(Boolean).join(' · ') || 'Voo';
    case 'hospedagem':
      return [d.nome, d.localizacao, d.check_in && d.check_out ? `${d.check_in} → ${d.check_out}` : d.check_in].filter(Boolean).join(' · ') || 'Hospedagem';
    case 'transporte':
      return [d.tipo, d.operadora, d.origem && d.destino ? `${d.origem} → ${d.destino}` : null, d.data].filter(Boolean).join(' · ') || 'Transporte';
    case 'restaurante':
      return [d.nome, d.cidade, d.tipo].filter(Boolean).join(' · ') || 'Restaurante';
    case 'atividade':
      return [d.titulo, d.dia, d.horario, d.localizacao].filter(Boolean).join(' · ') || 'Atividade';
    default:
      return 'Item';
  }
}

type Step = 'upload' | 'processing' | 'review' | 'saving' | 'done';

export function ImportItineraryDialog() {
  const { user } = useAuth();
  const { currentTripId } = useTrip();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [statusText, setStatusText] = useState('');
  const [itinerary, setItinerary] = useState<ExtractedItinerary | null>(null);
  const [savedCounts, setSavedCounts] = useState<Record<string, number>>({});

  const reset = useCallback(() => {
    setStep('upload');
    setStatusText('');
    setItinerary(null);
    setSavedCounts({});
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isAllowedImportFile(file)) {
      toast.error('Formato não suportado. Use PDF, imagem ou texto.');
      return;
    }

    setStep('processing');
    setStatusText('Lendo documento...');

    try {
      // 1. Extract text
      let text = '';
      const native = await tryExtractNativeText(file);
      if (native.text && native.text.length > 30) {
        text = native.text;
        setStatusText('Texto extraído. Analisando com IA...');
      } else {
        setStatusText('Executando OCR...');
        const ocr = await runOcrDocument(file);
        text = ocr.text;
        setStatusText('OCR concluído. Analisando com IA...');
      }

      // 2. Extract itinerary
      const result = await extractItineraryStructured(text, file.name);

      if (result.items.length === 0) {
        toast.error('Nenhum item de viagem encontrado no documento.');
        setStep('upload');
        return;
      }

      setItinerary(result);
      setStep('review');
      toast.success(`${result.items.length} item(ns) detectado(s)!`);
    } catch (err: any) {
      console.error('Import itinerary error:', err);
      toast.error(err.message || 'Erro ao processar documento.');
      setStep('upload');
    }
  };

  const toggleItem = (index: number) => {
    if (!itinerary) return;
    setItinerary({
      ...itinerary,
      items: itinerary.items.map((item, i) =>
        i === index ? { ...item, selected: !item.selected } : item
      ),
    });
  };

  const updateItemField = (index: number, field: string, value: string) => {
    if (!itinerary) return;
    setItinerary({
      ...itinerary,
      items: itinerary.items.map((item, i) =>
        i === index ? { ...item, dados: { ...item.dados, [field]: value || null } } : item
      ),
    });
  };

  const handleSave = async () => {
    if (!itinerary || !user?.id || !currentTripId) return;

    const selected = itinerary.items.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error('Selecione ao menos um item.');
      return;
    }

    setStep('saving');
    setStatusText('Salvando itens...');
    const counts: Record<string, number> = {};

    for (const item of selected) {
      try {
        const d = item.dados;
        const normalizeStatus = (s: unknown) => {
          const v = String(s ?? 'pendente').toLowerCase();
          return v === 'confirmado' || v === 'cancelado' ? v : 'pendente';
        };

        if (item.tipo === 'voo') {
          const dataStr = d.data ? `${d.data}T${d.hora || '00:00'}:00` : null;
          await supabase.from('voos').insert({
            user_id: user.id,
            viagem_id: currentTripId,
            numero: (d.numero as string) ?? null,
            companhia: (d.companhia as string) ?? null,
            origem: (d.origem as string) ?? null,
            destino: (d.destino as string) ?? null,
            data: dataStr,
            status: normalizeStatus(d.status) as any,
            valor: d.valor != null ? Number(d.valor) : null,
            moeda: (d.moeda as string) ?? 'BRL',
          });
          counts.voo = (counts.voo ?? 0) + 1;
        } else if (item.tipo === 'hospedagem') {
          await supabase.from('hospedagens').insert({
            user_id: user.id,
            viagem_id: currentTripId,
            nome: (d.nome as string) ?? null,
            localizacao: (d.localizacao as string) ?? null,
            check_in: (d.check_in as string) ?? null,
            check_out: (d.check_out as string) ?? null,
            status: normalizeStatus(d.status) as any,
            valor: d.valor != null ? Number(d.valor) : null,
            moeda: (d.moeda as string) ?? 'BRL',
          });
          counts.hospedagem = (counts.hospedagem ?? 0) + 1;
        } else if (item.tipo === 'transporte') {
          const dataStr = d.data ? `${d.data}T${d.hora || '00:00'}:00` : null;
          await supabase.from('transportes').insert({
            user_id: user.id,
            viagem_id: currentTripId,
            tipo: (d.tipo as string) ?? null,
            operadora: (d.operadora as string) ?? null,
            origem: (d.origem as string) ?? null,
            destino: (d.destino as string) ?? null,
            data: dataStr,
            status: normalizeStatus(d.status) as any,
            valor: d.valor != null ? Number(d.valor) : null,
            moeda: (d.moeda as string) ?? 'BRL',
          });
          counts.transporte = (counts.transporte ?? 0) + 1;
        } else if (item.tipo === 'restaurante') {
          await supabase.from('restaurantes').insert({
            user_id: user.id,
            viagem_id: currentTripId,
            nome: (d.nome as string) ?? 'Restaurante',
            cidade: (d.cidade as string) ?? null,
            tipo: (d.tipo as string) ?? null,
          });
          counts.restaurante = (counts.restaurante ?? 0) + 1;
        } else if (item.tipo === 'atividade') {
          const dia = (d.dia as string) ?? itinerary.resumo_viagem.data_inicio ?? new Date().toISOString().slice(0, 10);
          await supabase.from('roteiro_dias').insert({
            user_id: user.id,
            viagem_id: currentTripId,
            titulo: (d.titulo as string) ?? 'Atividade',
            descricao: (d.descricao as string) ?? null,
            dia,
            horario_sugerido: (d.horario as string) ?? null,
            localizacao: (d.localizacao as string) ?? null,
            categoria: (d.categoria as string) ?? null,
            ordem: 0,
          });
          counts.atividade = (counts.atividade ?? 0) + 1;
        }
      } catch (err: any) {
        console.error(`Error saving ${item.tipo}:`, err);
      }
    }

    setSavedCounts(counts);
    setStep('done');
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    toast.success(`${total} item(ns) salvos com sucesso!`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileUp className="h-4 w-4" />
          Importar roteiro
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Importar roteiro completo</DialogTitle>
          <DialogDescription>
            Suba um PDF, imagem ou texto com seu roteiro. A IA extrairá voos, hospedagens, transportes, restaurantes e atividades automaticamente.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Label
              htmlFor="itinerary-file"
              className="flex flex-col items-center gap-3 w-full border-2 border-dashed rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <FileUp className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Clique para selecionar arquivo</span>
              <span className="text-xs text-muted-foreground">PDF, PNG, JPG, TXT, HTML, EML</span>
            </Label>
            <Input
              id="itinerary-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.html,.eml"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
        )}

        {step === 'review' && itinerary && (
          <>
            {itinerary.resumo_viagem.destino && (
              <div className="text-sm text-muted-foreground mb-2">
                Destino detectado: <strong>{itinerary.resumo_viagem.destino}</strong>
                {itinerary.resumo_viagem.data_inicio && ` · ${itinerary.resumo_viagem.data_inicio}`}
                {itinerary.resumo_viagem.data_fim && ` → ${itinerary.resumo_viagem.data_fim}`}
              </div>
            )}
            <ScrollArea className="max-h-[50vh] pr-2">
              <div className="space-y-2">
                {itinerary.items.map((item, idx) => {
                  const config = TIPO_CONFIG[item.tipo] ?? TIPO_CONFIG.atividade;
                  const Icon = config.icon;
                  return (
                    <Card key={idx} className={`transition-opacity ${!item.selected ? 'opacity-50' : ''}`}>
                      <CardContent className="p-3 flex items-start gap-3">
                        <Checkbox
                          checked={item.selected}
                          onCheckedChange={() => toggleItem(idx)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="h-4 w-4 shrink-0" />
                            <Badge variant="outline" className={config.color}>
                              {config.label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.confianca}% confiança
                            </span>
                          </div>
                          <p className="text-sm truncate">{itemSummary(item)}</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { reset(); }}>
                Cancelar
              </Button>
              <Button onClick={handleSave} className="gap-2">
                <Check className="h-4 w-4" />
                Salvar {itinerary.items.filter((i) => i.selected).length} item(ns)
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'saving' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{statusText}</p>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <Check className="h-10 w-10 text-emerald-600" />
            <p className="font-medium">Importação concluída!</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(savedCounts).map(([tipo, count]) => {
                const config = TIPO_CONFIG[tipo as ItineraryItemType];
                return config ? (
                  <Badge key={tipo} variant="outline" className={config.color}>
                    {count}x {config.label}
                  </Badge>
                ) : null;
              })}
            </div>
            <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
