import { ImportScope } from '@/components/import/import-types';
import { ArceeExtractionPayload, ExtractedReservation, ImportType } from '@/services/importPipeline';

export function toDateInput(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function toDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

export function toTimeInput(value?: string | null) {
  if (!value) return '';
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (match) return `${match[1]}:${match[2]}`;
  return '';
}

export function toIsoDateTime(date?: string | null, time?: string | null) {
  const normalizedDate = toDateInput(date);
  if (!normalizedDate) return null;
  const normalizedTime = toTimeInput(time) || '00:00';
  return new Date(`${normalizedDate}T${normalizedTime}:00`).toISOString();
}

export function mapCanonicalTypeToImportType(tipo?: string | null): ImportType | null {
  if (!tipo) return null;
  const normalized = tipo.toLowerCase();
  if (normalized === 'voo') return 'voo';
  if (normalized === 'hospedagem') return 'hospedagem';
  if (normalized === 'transporte') return 'transporte';
  if (normalized === 'restaurante') return 'restaurante';
  return null;
}

function filledCount(values: Array<string | number | null | undefined>): number {
  return values.reduce<number>((count, value) => {
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

export function detectTypeFromText(raw: string, fileName: string): ImportType {
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

export function resolveImportType(extracted: ExtractedReservation, rawText: string, fileName: string): ImportType {
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

export function resolveImportScope(extracted: ExtractedReservation, rawText: string, fileName: string): ImportScope {
  if (extracted.scope === 'outside_scope') return 'outside_scope';
  if (extracted.scope === 'trip_related') return 'trip_related';

  const bag = `${rawText} ${fileName}`.toLowerCase();
  const hasTravelSignal =
    /\b(voo|flight|aeroporto|airport|pnr|iata|itiner[áa]rio|airbnb|hotel|booking|check-in|check out|checkout|transporte|trem|bus|restaurante|trip)\b/.test(bag) ||
    /\b(latam|gol|azul|lufthansa|booking\.com|airbnb)\b/.test(bag);

  return hasTravelSignal ? 'trip_related' : 'outside_scope';
}

export function inferFallbackExtraction(raw: string, fileName: string, tripDestination?: string | null): ExtractedReservation {
  const type = detectTypeFromText(raw, fileName);
  const amountMatch = raw.match(/(R\$|USD|EUR|CHF|GBP)\s*([0-9][0-9.,]*)/i);
  const parseAmount = (value: string) => {
    const sanitized = value.replace(/[^0-9,.\-]/g, '').trim();
    if (!sanitized) return null;
    const hasDot = sanitized.includes('.');
    const hasComma = sanitized.includes(',');
    let normalized = sanitized;

    if (hasDot && hasComma) {
      const lastDot = sanitized.lastIndexOf('.');
      const lastComma = sanitized.lastIndexOf(',');
      normalized = lastComma > lastDot ? sanitized.replace(/\./g, '').replace(',', '.') : sanitized.replace(/,/g, '');
    } else if (hasComma) {
      normalized = sanitized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const amount = amountMatch ? parseAmount(amountMatch[2] || '') : null;
  const currency = amountMatch?.[1]?.toUpperCase().replace('$', '') ?? null;
  const rawOneLine = raw.replace(/\s+/g, ' ');

  const airportRouteMatch = rawOneLine.match(/\b([A-Z]{3})\s*(?:-|->|→|\/)\s*([A-Z]{3})\b/);
  const airportLabelMatch = rawOneLine.match(/(?:origem|from)\s*[:\-]?\s*([A-Z]{3}).*?(?:destino|to)\s*[:\-]?\s*([A-Z]{3})/i);
  const airports = rawOneLine.match(/\b[A-Z]{3}\b/g) || [];
  const origem = airportRouteMatch?.[1] || airportLabelMatch?.[1] || airports[0] || null;
  const destino = airportRouteMatch?.[2] || airportLabelMatch?.[2] || airports[1] || null;

  const dateIsoMatch = rawOneLine.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  const dateBrMatch = rawOneLine.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/);
  const inferredDate = dateIsoMatch
    ? `${dateIsoMatch[1]}-${dateIsoMatch[2].padStart(2, '0')}-${dateIsoMatch[3].padStart(2, '0')}`
    : dateBrMatch
      ? `${dateBrMatch[3]}-${dateBrMatch[2].padStart(2, '0')}-${dateBrMatch[1].padStart(2, '0')}`
      : null;

  const checkInMatch = rawOneLine.match(/(?:check[\s-]?in|entrada)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2})/i);
  const checkOutMatch = rawOneLine.match(/(?:check[\s-]?out|sa[ií]da)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2})/i);
  const normalizeDate = (value?: string | null) => {
    if (!value) return null;
    const iso = value.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const br = value.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/);
    if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    return null;
  };
  const checkIn = normalizeDate(checkInMatch?.[1] ?? null);
  const checkOut = normalizeDate(checkOutMatch?.[1] ?? null);

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
  const canonicalType = type === 'voo' ? 'Voo' : type === 'hospedagem' ? 'Hospedagem' : type === 'transporte' ? 'Transporte' : 'Restaurante';
  const canonical: ArceeExtractionPayload = {
    metadata: {
      tipo: canonicalType,
      confianca: 45,
      status: 'Pendente',
    },
    dados_principais: {
      nome_exibicao: cleanedName || null,
      provedor: airline,
      codigo_reserva: flightNumber && /^[A-Z0-9]{6}$/i.test(flightNumber) ? flightNumber.toUpperCase() : null,
      passageiro_hospede: null,
      data_inicio: type === 'hospedagem' ? checkIn : inferredDate,
      hora_inicio: null,
      data_fim: type === 'hospedagem' ? checkOut : null,
      hora_fim: null,
      origem,
      destino: type === 'hospedagem' ? tripDestination ?? null : destino,
    },
    financeiro: {
      valor_total: Number.isFinite(amount as number) ? amount : null,
      moeda: currency || 'BRL',
      metodo: null,
      pontos_utilizados: null,
    },
    enriquecimento_ia: {
      dica_viagem: tripDestination ? `Considere horários fora de pico para deslocamentos em ${tripDestination}.` : null,
      como_chegar: tripDestination ? `Use transporte público ou app de mobilidade até ${tripDestination}.` : null,
      atracoes_proximas: tripDestination ? `Pesquise atrações centrais e parques em ${tripDestination}.` : null,
      restaurantes_proximos: tripDestination ? `Experimente culinária local em ${tripDestination}.` : null,
    },
  };

  return {
    type,
    scope: 'trip_related',
    confidence: 0.4,
    type_confidence: 0.45,
    field_confidence: {},
    extraction_quality: raw.trim().length > 80 ? 'medium' : 'low',
    missingFields: ['review_manual_requerida'],
    canonical,
    data: {
      voo:
        type === 'voo'
          ? {
              numero: flightNumber,
              companhia: airline,
              origem,
              destino,
              data: inferredDate,
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
              check_in: checkIn,
              check_out: checkOut,
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
