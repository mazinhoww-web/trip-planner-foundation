import { ImportType } from '@/services/importPipeline';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type QueueStatus = 'pending' | 'processing' | 'review' | 'saving' | 'saved' | 'failed';
export type VisualStepKey = 'read' | 'identified' | 'saving' | 'photos' | 'tips' | 'done';

export type ReviewState = {
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

export type ImportSummary = {
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

export type ImportQueueItem = {
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

export const VISUAL_STEPS: { key: VisualStepKey; label: string }[] = [
  { key: 'read', label: 'Lendo documento' },
  { key: 'identified', label: 'Tipo detectado' },
  { key: 'saving', label: 'Salvando dados' },
  { key: 'photos', label: 'Buscando fotos' },
  { key: 'tips', label: 'Gerando dicas' },
  { key: 'done', label: 'Concluído' },
];

export const defaultVisualSteps = (): Record<VisualStepKey, StepStatus> => ({
  read: 'pending',
  identified: 'pending',
  saving: 'pending',
  photos: 'pending',
  tips: 'pending',
  done: 'pending',
});
