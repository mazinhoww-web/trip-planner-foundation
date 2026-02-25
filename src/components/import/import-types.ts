import { ArceeExtractionPayload, ImportType } from '@/services/importPipeline';

export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type QueueStatus = 'pending' | 'processing' | 'auto_extracted' | 'needs_confirmation' | 'saving' | 'saved' | 'failed';
export type VisualStepKey = 'read' | 'identified' | 'saving' | 'photos' | 'tips' | 'done';
export type ImportScope = 'trip_related' | 'outside_scope';

export type ReviewState = {
  type: ImportType;
  voo: {
    nome_exibicao: string;
    provedor: string;
    codigo_reserva: string;
    passageiro_hospede: string;
    numero: string;
    companhia: string;
    origem: string;
    destino: string;
    data_inicio: string;
    hora_inicio: string;
    data_fim: string;
    hora_fim: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
    metodo_pagamento: string;
    pontos_utilizados: string;
  };
  hospedagem: {
    nome_exibicao: string;
    provedor: string;
    codigo_reserva: string;
    passageiro_hospede: string;
    nome: string;
    localizacao: string;
    check_in: string;
    hora_inicio: string;
    check_out: string;
    hora_fim: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
    metodo_pagamento: string;
    pontos_utilizados: string;
    dica_viagem: string;
    como_chegar: string;
    atracoes_proximas: string;
    restaurantes_proximos: string;
    dica_ia: string;
  };
  transporte: {
    nome_exibicao: string;
    provedor: string;
    codigo_reserva: string;
    passageiro_hospede: string;
    tipo: string;
    operadora: string;
    origem: string;
    destino: string;
    data_inicio: string;
    hora_inicio: string;
    data_fim: string;
    hora_fim: string;
    status: 'confirmado' | 'pendente' | 'cancelado';
    valor: string;
    moeda: string;
    metodo_pagamento: string;
    pontos_utilizados: string;
  };
  restaurante: {
    nome: string;
    cidade: string;
    tipo: string;
    rating: string;
  };
};

export type ImportSummary = {
  type: ImportType | 'documento';
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
  fileHash: string | null;
  status: QueueStatus;
  visualSteps: Record<VisualStepKey, StepStatus>;
  scope: ImportScope;
  warnings: string[];
  confidence: number | null;
  typeConfidence: number | null;
  extractionQuality: 'high' | 'medium' | 'low';
  missingFields: string[];
  identifiedType: ImportType | null;
  needsUserConfirmation: boolean;
  reviewState: ReviewState | null;
  rawText: string;
  summary: ImportSummary | null;
  canonical: ArceeExtractionPayload | null;
  extractionHistory: ArceeExtractionPayload[];
  providerMeta: {
    selected?: string;
    openrouter_ok?: boolean;
    gemini_ok?: boolean;
    openrouter_ms?: number;
    gemini_ms?: number;
    fallback_used?: boolean;
  } | null;
  hotelPhotos: string[];
  photoIndex: number;
  documentId: string | null;
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
