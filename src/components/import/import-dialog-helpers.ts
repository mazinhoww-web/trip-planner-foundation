import {
  defaultVisualSteps,
  ImportQueueItem,
  ImportSummary,
  QueueStatus,
  ReviewState,
} from '@/components/import/import-types';
import {
  mapCanonicalTypeToImportType,
  toDateInput,
  toTimeInput,
} from '@/components/import/import-helpers';
import { ExtractedReservation, ImportType } from '@/services/importPipeline';

export function toReviewState(extracted: ExtractedReservation, resolvedType: ImportType): ReviewState {
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

export function formatCurrency(value?: number | null, currency: string = 'BRL') {
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

export function convertToBrl(value: number, currency: string) {
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

export function hotelPhotoUrls(name: string, location: string) {
  const base = `${name} ${location}`.trim() || 'hotel viagem';
  const encoded = encodeURIComponent(base);
  return [
    `https://source.unsplash.com/1200x700/?${encoded}`,
    `https://source.unsplash.com/1200x700/?hotel,${encodeURIComponent(location || 'travel')}`,
    `https://picsum.photos/seed/${encodeURIComponent(base)}/1200/700`,
  ];
}

export function typeLabel(type: ImportType | null | undefined) {
  if (type === 'hospedagem') return 'Hospedagem';
  if (type === 'voo') return 'Voo';
  if (type === 'transporte') return 'Transporte';
  if (type === 'restaurante') return 'Restaurante';
  return 'A definir';
}

export function toDateLabel(date?: string | null) {
  if (!date) return '—';
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(parsed);
}

export function diffNights(checkIn?: string | null, checkOut?: string | null) {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn}T00:00:00Z`).getTime();
  const end = new Date(`${checkOut}T00:00:00Z`).getTime();
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

export function toUserWarning(text: string) {
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
  if (lower.includes('campos obrigatórios pendentes')) {
    return 'Preencha os campos obrigatórios destacados para concluir a importação.';
  }
  return 'Alguns dados exigem confirmação antes de salvar.';
}

export function queueStatusLabel(status: QueueStatus) {
  if (status === 'pending') return 'Aguardando';
  if (status === 'processing') return 'Analisando';
  if (status === 'auto_extracted') return 'Extraído';
  if (status === 'needs_confirmation') return 'Confirmar';
  if (status === 'saving') return 'Salvando';
  if (status === 'saved') return 'Salvo';
  return 'Falha';
}

export function queueStatusVariant(status: QueueStatus): 'secondary' | 'default' | 'destructive' {
  if (status === 'saved') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'needs_confirmation') return 'default';
  return 'secondary';
}

export function makeQueueItem(file: File): ImportQueueItem {
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
    summary: null as ImportSummary | null,
    canonical: null,
    extractionHistory: [],
    providerMeta: null,
    hotelPhotos: [],
    photoIndex: 0,
    documentId: null,
  };
}
