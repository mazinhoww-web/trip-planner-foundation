import { ImportScope, type ReviewState } from '@/components/import/import-types';
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

  if (
    /\b(latam|gol|azul|flight|boarding|voo|aeroporto|pnr|iata|ticket|itiner[áa]rio|localizador|bilhete(?:\s+eletr[oô]nico)?)\b/.test(bag) ||
    /\b[a-z]{2}\s?\d{3,4}[a-z]?\b/i.test(bag)
  ) {
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

const MONTH_ALIASES: Record<string, string> = {
  jan: '01',
  january: '01',
  janeiro: '01',
  fev: '02',
  feb: '02',
  february: '02',
  fevereiro: '02',
  mar: '03',
  march: '03',
  marco: '03',
  março: '03',
  abr: '04',
  apr: '04',
  april: '04',
  abril: '04',
  mai: '05',
  may: '05',
  maio: '05',
  jun: '06',
  june: '06',
  junho: '06',
  jul: '07',
  july: '07',
  julho: '07',
  ago: '08',
  aug: '08',
  august: '08',
  agosto: '08',
  set: '09',
  sep: '09',
  sept: '09',
  september: '09',
  setembro: '09',
  out: '10',
  oct: '10',
  october: '10',
  outubro: '10',
  nov: '11',
  november: '11',
  novembro: '11',
  dez: '12',
  dec: '12',
  december: '12',
  dezembro: '12',
};

function cleanToken(value?: string | null) {
  if (!value) return null;
  const cleaned = value
    .replace(/[|,;]+$/g, '')
    .replace(/^[|,;]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function normalizeDateCandidate(value?: string | null) {
  if (!value) return null;
  const normalizedValue = value.trim();

  const iso = normalizedValue.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const br = normalizedValue.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.]((?:20)?\d{2})\b/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }

  const monthText = normalizedValue.match(/\b(\d{1,2})\s*(?:de\s+)?([a-zA-ZÀ-ÿ]{3,12})[.,]?\s*(?:de\s+)?((?:20)?\d{2})\b/);
  if (monthText) {
    const day = monthText[1].padStart(2, '0');
    const monthKey = monthText[2]
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
    const month = MONTH_ALIASES[monthKey] ?? MONTH_ALIASES[monthKey.slice(0, 3)];
    const year = monthText[3].length === 2 ? `20${monthText[3]}` : monthText[3];
    if (month) return `${year}-${month}-${day}`;
  }

  return null;
}

function normalizeCurrencyToken(value?: string | null) {
  if (!value) return null;
  const token = value.toUpperCase().replace(/\s+/g, '');
  if (token === 'R$' || token === 'BRL') return 'BRL';
  if (token === 'US$' || token === '$' || token === 'USD') return 'USD';
  if (token === 'EUR' || token === '€') return 'EUR';
  if (token === 'CHF') return 'CHF';
  if (token === 'GBP' || token === '£') return 'GBP';
  return null;
}

function normalizeTimeCandidate(value?: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^([01]?\d|2[0-3])[:h]([0-5]\d)$/i);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function inferFallbackExtraction(raw: string, fileName: string, tripDestination?: string | null): ExtractedReservation {
  const type = detectTypeFromText(raw, fileName);
  const rawOneLine = raw.replace(/\s+/g, ' ');
  const amountPrefixMatch = rawOneLine.match(/(R\$|US\$|USD|EUR|CHF|GBP|BRL)\s*([0-9][0-9.,]*)/i);
  const amountSuffixMatch = rawOneLine.match(/([0-9][0-9.,]*)\s*(R\$|US\$|USD|EUR|CHF|GBP|BRL)\b/i);
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
  const amount = amountPrefixMatch
    ? parseAmount(amountPrefixMatch[2] || '')
    : amountSuffixMatch
      ? parseAmount(amountSuffixMatch[1] || '')
      : null;
  const currency = normalizeCurrencyToken(amountPrefixMatch?.[1] ?? amountSuffixMatch?.[2] ?? null);

  const airportRouteMatch = rawOneLine.match(/\b([A-Z]{3})\s*(?:-|->|→|\/)\s*([A-Z]{3})\b/);
  const airportLabelMatch = rawOneLine.match(/(?:origem|from)\s*[:\-]?\s*([A-Z]{3}).*?(?:destino|to)\s*[:\-]?\s*([A-Z]{3})/i);
  const cityRouteByWordsMatch = rawOneLine.match(/\bde\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{1,30}?)\s+(?:para|to)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{1,30})\b/i);
  const cityRouteArrowMatch = rawOneLine.match(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{1,30})\s*(?:->|→)\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{1,30})\b/);
  const originLabelCityMatch = rawOneLine.match(/(?:origem|from)\s*[:\-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{2,35}?)(?=\s+(?:destino|to)\b|$)/i);
  const destinationLabelCityMatch = rawOneLine.match(/(?:destino|to)\s*[:\-]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{2,35}?)(?=\s+(?:valor|data|hora|check|status)\b|$)/i);
  const airports = rawOneLine.match(/\b[A-Z]{3}\b/g) || [];
  const origem = cleanToken(
    airportRouteMatch?.[1] ||
      airportLabelMatch?.[1] ||
      airports[0] ||
      originLabelCityMatch?.[1] ||
      cityRouteByWordsMatch?.[1] ||
      cityRouteArrowMatch?.[1] ||
      null,
  );
  const destino = cleanToken(
    airportRouteMatch?.[2] ||
      airportLabelMatch?.[2] ||
      airports[1] ||
      destinationLabelCityMatch?.[1] ||
      cityRouteByWordsMatch?.[2] ||
      cityRouteArrowMatch?.[2] ||
      null,
  );

  const dateIsoMatch = rawOneLine.match(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/);
  const dateBrMatch = rawOneLine.match(/\b\d{1,2}[-/.]\d{1,2}[-/.](?:20\d{2}|\d{2})\b/);
  const dateTextMatch = rawOneLine.match(/\b\d{1,2}\s*(?:de\s+)?[a-zA-ZÀ-ÿ]{3,12}[.,]?\s*(?:de\s+)?(?:20\d{2}|\d{2})\b/);
  const inferredDate = normalizeDateCandidate(dateIsoMatch?.[0] ?? dateBrMatch?.[0] ?? dateTextMatch?.[0] ?? null);

  const checkInMatch = rawOneLine.match(
    /(?:check[\s-]?in|entrada)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2}|[0-9]{1,2}\s*(?:de\s+)?[a-zA-ZÀ-ÿ]{3,12}[.,]?\s*(?:de\s+)?(?:20[0-9]{2}|[0-9]{2}))/i,
  );
  const checkOutMatch = rawOneLine.match(
    /(?:check[\s-]?out|sa[ií]da)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2}|[0-9]{1,2}\s*(?:de\s+)?[a-zA-ZÀ-ÿ]{3,12}[.,]?\s*(?:de\s+)?(?:20[0-9]{2}|[0-9]{2}))/i,
  );
  const checkIn = normalizeDateCandidate(checkInMatch?.[1] ?? null);
  const checkOut = normalizeDateCandidate(checkOutMatch?.[1] ?? null);
  const genericStartTime = normalizeTimeCandidate(
    rawOneLine.match(/(?:embarque|boarding|partida|departure|check[\s-]?in)\s*[:\-]?\s*([01]?\d[:h][0-5]\d)/i)?.[1] ??
      rawOneLine.match(/\b([01]?\d[:h][0-5]\d)\b/)?.[1] ??
      null,
  );
  const genericEndTime = normalizeTimeCandidate(
    rawOneLine.match(/(?:chegada|arrival|check[\s-]?out|sa[ií]da)\s*[:\-]?\s*([01]?\d[:h][0-5]\d)/i)?.[1] ?? null,
  );
  const addressLabelMatch = rawOneLine.match(
    /(?:endere[cç]o|address|localiza[cç][aã]o|cidade|city)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9' .,#-]{6,120}?)(?=\s{2,}|$)/i,
  );
  const cityCountryMatch = rawOneLine.match(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{2,40}),\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' .-]{2,40})\b/);
  const stayLocation = cleanToken(
    addressLabelMatch?.[1] || (cityCountryMatch ? `${cityCountryMatch[1]}, ${cityCountryMatch[2]}` : null) || tripDestination || destino || null,
  );
  const stayNameMatch = rawOneLine.match(
    /(?:hospedagem|hotel|accommodation|airbnb)\s*[:\-]?\s*([A-Za-zÀ-ÿ0-9' .,#-]{3,90}?)(?=\s+(?:check|entrada|sa[ií]da|valor|total)\b|$)/i,
  );

  const flightNumber = (raw.match(/\b([A-Z]{2}\s?\d{3,4}[A-Z]?)\b/) || fileName.match(/\b([A-Z]{2}\s?\d{3,4}[A-Z]?)\b/i))?.[1]?.replace(/\s+/g, '') ?? null;
  const reservationCode =
    rawOneLine.match(/(?:c[oó]digo(?:\s+de)?\s+reserva|booking(?:\s+code)?|pnr|localizador)\s*[:#-]?\s*([A-Z0-9]{5,8})/i)?.[1]?.toUpperCase() ??
    null;
  const providerBag = `${raw} ${fileName}`.toLowerCase();
  let airline: string | null = null;
  if (/\blatam\b/.test(providerBag)) airline = 'LATAM';
  else if (/\bgol\b/.test(providerBag)) airline = 'GOL';
  else if (/\bazul\b/.test(providerBag)) airline = 'AZUL';
  else if (/\blufthansa\b/.test(providerBag)) airline = 'Lufthansa';
  else if (/\bair france\b/.test(providerBag)) airline = 'Air France';
  else if (/\bamerican airlines\b/.test(providerBag)) airline = 'American Airlines';
  else if (/\bairbnb\b/.test(providerBag)) airline = 'Airbnb';
  else if (/\bbooking(?:\.com)?\b/.test(providerBag)) airline = 'Booking';

  const cleanedName = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').trim();
  const normalizedStayName = cleanToken(stayNameMatch?.[1] ?? null) ?? (type === 'hospedagem' ? cleanedName || 'Hospedagem' : cleanedName || null);
  const canonicalType = type === 'voo' ? 'Voo' : type === 'hospedagem' ? 'Hospedagem' : type === 'transporte' ? 'Transporte' : 'Restaurante';
  const typeSignals =
    type === 'voo'
      ? filledCount([flightNumber, reservationCode, airline, origem, destino, inferredDate, genericStartTime, amount])
      : type === 'hospedagem'
        ? filledCount([normalizedStayName, stayLocation, checkIn, checkOut, amount, currency, genericStartTime, genericEndTime])
        : type === 'transporte'
          ? filledCount([origem, destino, inferredDate, genericStartTime, amount])
          : filledCount([cleanedName, stayLocation]);
  const typeConfidence = Math.min(0.93, 0.35 + typeSignals * 0.08 + (raw.trim().length > 240 ? 0.08 : 0));
  const extractionQuality: 'high' | 'medium' | 'low' = typeSignals >= 6 ? 'high' : typeSignals >= 4 ? 'medium' : 'low';
  const fallbackMissing = typeSignals < 4 ? ['review_manual_requerida'] : [];

  const canonical: ArceeExtractionPayload = {
    metadata: {
      tipo: canonicalType,
      confianca: Math.round(typeConfidence * 100),
      status: 'Pendente',
    },
    dados_principais: {
      nome_exibicao: type === 'hospedagem' ? normalizedStayName : cleanedName || null,
      provedor: airline,
      codigo_reserva:
        (reservationCode && /^[A-Z0-9]{5,8}$/i.test(reservationCode) ? reservationCode.toUpperCase() : null) ||
        (flightNumber && /^[A-Z0-9]{6}$/i.test(flightNumber) ? flightNumber.toUpperCase() : null),
      passageiro_hospede: null,
      data_inicio: type === 'hospedagem' ? checkIn : inferredDate,
      hora_inicio: genericStartTime,
      data_fim: type === 'hospedagem' ? checkOut : null,
      hora_fim: type === 'hospedagem' ? genericEndTime : null,
      origem: type === 'hospedagem' ? null : origem,
      destino: type === 'hospedagem' ? stayLocation : destino,
    },
    financeiro: {
      valor_total: Number.isFinite(amount as number) ? amount : null,
      moeda: currency ?? null,
      metodo: null,
      pontos_utilizados: null,
    },
    enriquecimento_ia: {
      dica_viagem: (stayLocation ?? tripDestination) ? `Considere horários fora de pico para deslocamentos em ${stayLocation ?? tripDestination}.` : null,
      como_chegar: (stayLocation ?? tripDestination) ? `Use transporte público ou app de mobilidade até ${stayLocation ?? tripDestination}.` : null,
      atracoes_proximas: (stayLocation ?? tripDestination) ? `Pesquise atrações centrais e parques em ${stayLocation ?? tripDestination}.` : null,
      restaurantes_proximos: (stayLocation ?? tripDestination) ? `Experimente culinária local em ${stayLocation ?? tripDestination}.` : null,
    },
  };

  return {
    type,
    scope: 'trip_related',
    confidence: Math.max(0.3, typeConfidence - 0.05),
    type_confidence: typeConfidence,
    field_confidence: {},
    extraction_quality: extractionQuality,
    missingFields: fallbackMissing,
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
              moeda: currency ?? null,
            }
          : null,
      hospedagem:
        type === 'hospedagem'
          ? {
              nome: normalizedStayName ?? 'Hospedagem',
              localizacao: stayLocation ?? null,
              check_in: checkIn,
              check_out: checkOut,
              status: 'pendente',
              valor: Number.isFinite(amount as number) ? amount : null,
              moeda: currency ?? null,
            }
          : null,
      transporte:
        type === 'transporte'
          ? {
              tipo: cleanedName || 'Transporte',
              operadora: null,
              origem,
              destino,
              data: inferredDate,
              status: 'pendente',
              valor: Number.isFinite(amount as number) ? amount : null,
              moeda: currency ?? null,
            }
          : null,
      restaurante:
        type === 'restaurante'
          ? {
              nome: cleanedName || 'Reserva de restaurante',
              cidade: stayLocation ?? tripDestination ?? null,
              tipo: 'Reserva',
              rating: null,
            }
          : null,
    },
  };
}

const TYPE_SPECIFIC_PREFIXES = ['voo.', 'hospedagem.', 'transporte.', 'restaurante.'] as const;
const TRANSIENT_MISSING_FIELDS = new Set(['review_manual_requerida']);

function hasValue(value?: string | null) {
  return typeof value === 'string' ? value.trim().length > 0 : false;
}

export function computeCriticalMissingFields(
  type: ImportType | null | undefined,
  reviewState: ReviewState | null,
  scope: ImportScope,
) {
  if (scope === 'outside_scope' || !type || !reviewState) return [] as string[];

  const missing: string[] = [];

  if (type === 'voo') {
    if (!hasValue(reviewState.voo.origem)) missing.push('voo.origem');
    if (!hasValue(reviewState.voo.destino)) missing.push('voo.destino');
    if (!hasValue(reviewState.voo.data_inicio)) missing.push('voo.data_inicio');
    const hasIdentifier =
      hasValue(reviewState.voo.codigo_reserva) ||
      hasValue(reviewState.voo.numero) ||
      hasValue(reviewState.voo.nome_exibicao);
    if (!hasIdentifier) missing.push('voo.identificador');
  }

  if (type === 'hospedagem') {
    const hasName = hasValue(reviewState.hospedagem.nome) || hasValue(reviewState.hospedagem.nome_exibicao);
    if (!hasName) missing.push('hospedagem.nome_exibicao');
    if (!hasValue(reviewState.hospedagem.check_in)) missing.push('hospedagem.data_inicio');
    if (!hasValue(reviewState.hospedagem.check_out)) missing.push('hospedagem.data_fim');
    if (!hasValue(reviewState.hospedagem.valor)) missing.push('hospedagem.valor_total');
  }

  if (type === 'transporte') {
    if (!hasValue(reviewState.transporte.origem)) missing.push('transporte.origem');
    if (!hasValue(reviewState.transporte.destino)) missing.push('transporte.destino');
    if (!hasValue(reviewState.transporte.data_inicio)) missing.push('transporte.data_inicio');
  }

  if (type === 'restaurante') {
    if (!hasValue(reviewState.restaurante.nome)) missing.push('restaurante.nome');
    if (!hasValue(reviewState.restaurante.cidade)) missing.push('restaurante.cidade');
  }

  return missing;
}

export function mergeMissingFields(existing: string[], computed: string[]) {
  const preserved = existing.filter((field) => {
    if (TRANSIENT_MISSING_FIELDS.has(field)) return false;
    return !TYPE_SPECIFIC_PREFIXES.some((prefix) => field.startsWith(prefix));
  });
  return [...new Set([...preserved, ...computed])];
}
