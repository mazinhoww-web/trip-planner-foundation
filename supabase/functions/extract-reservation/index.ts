import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';
import { buildProviderMeta, runParallelJsonInference } from '../_shared/ai-providers.ts';
import {
  isFeatureEnabled,
  loadFeatureGateContext,
  resolveAiRateLimit,
  resolveAiTimeout,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const ARCEE_MODEL = 'arcee-ai/trinity-large-preview:free';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';

const BASE_LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `Role: Você é o motor de inteligência do "Trip Planner Foundation". Sua função é processar texto bruto de OCR de documentos de viagem e retornar um JSON estruturado.

Diretrizes obrigatórias:
- Normalização de Datas: retorne no formato ISO YYYY-MM-DD.
- Normalização Monetária: use números com duas casas decimais para valor_total.
- Tratamento de Ausência: se impossível determinar, use null. Nunca invente dados.
- Gere enriquecimento_ia curto e útil quando o destino for identificável.
- Se o documento não fizer sentido para planejamento de viagem, retorne metadata.tipo = null.

Responda SOMENTE JSON válido no schema abaixo:
{
  "metadata": {
    "tipo": "Voo | Hospedagem | Transporte | Restaurante | null",
    "confianca": "0-100",
    "status": "Pendente"
  },
  "dados_principais": {
    "nome_exibicao": "string|null",
    "provedor": "string|null",
    "codigo_reserva": "string|null",
    "passageiro_hospede": "string|null",
    "data_inicio": "YYYY-MM-DD|null",
    "hora_inicio": "HH:MM|null",
    "data_fim": "YYYY-MM-DD|null",
    "hora_fim": "HH:MM|null",
    "origem": "string|null",
    "destino": "string|null"
  },
  "financeiro": {
    "valor_total": 0.00,
    "moeda": "BRL | USD | EUR | CHF | GBP | null",
    "metodo": "string|null",
    "pontos_utilizados": 0
  },
  "enriquecimento_ia": {
    "dica_viagem": "string|null",
    "como_chegar": "string|null",
    "atracoes_proximas": "string|null",
    "restaurantes_proximos": "string|null"
  }
}`;

type CanonicalPayload = {
  metadata: {
    tipo: 'Voo' | 'Hospedagem' | 'Transporte' | 'Restaurante' | null;
    confianca: number;
    status: 'Pendente' | 'Confirmado' | 'Cancelado' | null;
  };
  dados_principais: {
    nome_exibicao: string | null;
    provedor: string | null;
    codigo_reserva: string | null;
    passageiro_hospede: string | null;
    data_inicio: string | null;
    hora_inicio: string | null;
    data_fim: string | null;
    hora_fim: string | null;
    origem: string | null;
    destino: string | null;
  };
  financeiro: {
    valor_total: number | null;
    moeda: string | null;
    metodo: string | null;
    pontos_utilizados: number | null;
  };
  enriquecimento_ia: {
    dica_viagem: string | null;
    como_chegar: string | null;
    atracoes_proximas: string | null;
    restaurantes_proximos: string | null;
  };
};

const allowedTipo = new Set(['voo', 'hospedagem', 'transporte', 'restaurante']);
const MONTH_INDEX: Record<string, string> = {
  jan: '01',
  janeiro: '01',
  january: '01',
  fev: '02',
  fevereiro: '02',
  feb: '02',
  february: '02',
  mar: '03',
  março: '03',
  marco: '03',
  march: '03',
  abr: '04',
  abril: '04',
  apr: '04',
  april: '04',
  mai: '05',
  maio: '05',
  may: '05',
  jun: '06',
  junho: '06',
  june: '06',
  jul: '07',
  julho: '07',
  july: '07',
  ago: '08',
  agosto: '08',
  aug: '08',
  august: '08',
  set: '09',
  setembro: '09',
  sep: '09',
  september: '09',
  out: '10',
  outubro: '10',
  oct: '10',
  october: '10',
  nov: '11',
  novembro: '11',
  november: '11',
  dez: '12',
  dezembro: '12',
  dec: '12',
  december: '12',
};

function strOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const sanitized = value.replace(/[^0-9,.-]/g, '').trim();
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
  }
  return null;
}

function normalizeDateLike(value: unknown): string | null {
  const raw = strOrNull(value);
  if (!raw) return null;
  const iso = raw.match(/\b(20\d{2})[-/\.](\d{1,2})[-/\.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const br = raw.match(/\b(\d{1,2})[-/\.](\d{1,2})[-/\.](20\d{2})\b/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  const textMonth = raw.match(
    /\b(\d{1,2})\s*(?:de\s*)?([A-Za-zÀ-ÿ]{3,12})\.?,?\s*(?:de\s*)?(20\d{2})\b/i,
  );
  if (textMonth) {
    const day = textMonth[1].padStart(2, '0');
    const monthToken = textMonth[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const month = MONTH_INDEX[monthToken];
    if (month) return `${textMonth[3]}-${month}-${day}`;
  }
  return null;
}

function normalizeTimeLike(value: unknown): string | null {
  const raw = strOrNull(value);
  if (!raw) return null;
  const match = raw.match(/\b([01]\d|2[0-3])[:h]([0-5]\d)\b/i);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function normalizeMoney(value: unknown): number | null {
  const parsed = numOrNull(value);
  if (parsed == null) return null;
  return Number(parsed.toFixed(2));
}

function normalizeConfidence0to100(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed <= 1) return Math.max(0, Math.min(100, Math.round(parsed * 100)));
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function confidenceToUnit(value: number): number {
  return Math.max(0, Math.min(1, Number((value / 100).toFixed(4))));
}

function normalizeTipo(raw: unknown): CanonicalPayload['metadata']['tipo'] {
  const value = strOrNull(raw);
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'voo') return 'Voo';
  if (normalized === 'hospedagem') return 'Hospedagem';
  if (normalized === 'transporte') return 'Transporte';
  if (normalized === 'restaurante') return 'Restaurante';
  return null;
}

function normalizeStatus(raw: unknown): CanonicalPayload['metadata']['status'] {
  const value = strOrNull(raw);
  if (!value) return 'Pendente';
  const normalized = value.toLowerCase();
  if (normalized === 'confirmado') return 'Confirmado';
  if (normalized === 'cancelado') return 'Cancelado';
  return 'Pendente';
}

function mapTipoToLegacy(tipo: CanonicalPayload['metadata']['tipo']) {
  if (!tipo) return null;
  const lower = tipo.toLowerCase();
  return allowedTipo.has(lower) ? (lower as 'voo' | 'hospedagem' | 'transporte' | 'restaurante') : null;
}

function extractJson(content: string) {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const maybe = content.slice(start, end + 1);
  try {
    return JSON.parse(maybe) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferScopeAndTypeHints(text: string, fileName: string) {
  const bag = `${text} ${fileName}`.toLowerCase();
  const travelSignal =
    /\b(voo|flight|airbnb|hotel|hospedagem|check-in|check-out|airport|aeroporto|pnr|iata|itiner[áa]rio|booking|trip|restaurante)\b/.test(bag) ||
    /\b(latam|gol|azul|air france|lufthansa|booking\.com|airbnb)\b/.test(bag);
  if (!travelSignal) return { scope: 'outside_scope' as const, forcedType: null };
  if (/\b(latam|gol|azul|flight|boarding|pnr|iata|ticket|itiner[áa]rio)\b/.test(bag))
    return { scope: 'trip_related' as const, forcedType: 'Voo' as const };
  if (/\b(airbnb|hotel|hospedagem|booking|check-in|checkout|check out|pousada)\b/.test(bag))
    return { scope: 'trip_related' as const, forcedType: 'Hospedagem' as const };
  if (/\b(restaurante|restaurant|reserva de mesa|opentable)\b/.test(bag))
    return { scope: 'trip_related' as const, forcedType: 'Restaurante' as const };
  return { scope: 'trip_related' as const, forcedType: null };
}

function inferAirportCodes(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const withArrow = normalized.match(/\b([A-Z]{3})\s*(?:-|->|→|\/)\s*([A-Z]{3})\b/);
  if (withArrow) return { origem: withArrow[1], destino: withArrow[2] };
  const labeled = normalized.match(/(?:origem|from)\s*[:\-]?\s*([A-Z]{3}).*?(?:destino|to)\s*[:\-]?\s*([A-Z]{3})/i);
  if (labeled) return { origem: labeled[1].toUpperCase(), destino: labeled[2].toUpperCase() };
  const ignoredCodes = new Set(['USD', 'EUR', 'CHF', 'BRL', 'GBP']);
  const all = (normalized.match(/\b[A-Z]{3}\b/g) || []).filter((code) => !ignoredCodes.has(code));
  if (all.length >= 2) {
    if (all[0] !== all[1]) return { origem: all[0], destino: all[1] };
    return { origem: all[0], destino: null };
  }
  return { origem: null, destino: null };
}

function inferRouteByCityNames(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const arrowMatch = normalized.match(/\b([A-Za-zÀ-ÿ' -]{3,40})\s*(?:->|→| para |\/|-)\s*([A-Za-zÀ-ÿ' -]{3,40})\b/i);
  if (arrowMatch) {
    const origem = arrowMatch[1]?.trim() ?? null;
    const destino = arrowMatch[2]?.trim() ?? null;
    if (origem && destino && origem.toLowerCase() !== destino.toLowerCase()) {
      return { origem, destino };
    }
  }

  const fromToMatch = normalized.match(/(?:de|from)\s+([A-Za-zÀ-ÿ' -]{3,40})\s+(?:para|to)\s+([A-Za-zÀ-ÿ' -]{3,40})/i);
  if (fromToMatch) {
    const origem = fromToMatch[1]?.trim() ?? null;
    const destino = fromToMatch[2]?.trim() ?? null;
    if (origem && destino && origem.toLowerCase() !== destino.toLowerCase()) {
      return { origem, destino };
    }
  }

  return { origem: null as string | null, destino: null as string | null };
}

function inferFlightCode(text: string, fileName: string) {
  const pnrLabeled = text.match(/(?:c[óo]digo\s+de\s+reserva|localizador|pnr|booking\s+code)\s*[:\-]?\s*([A-Z0-9]{6,8})\b/i);
  const pnrFromFileCombined = fileName.match(/(?:^|[-_])(?:[A-Z]{2}\d{3,4})([A-Z0-9]{6,8})(?:\b|[-_.])/i);
  const pnr = pnrLabeled ?? pnrFromFileCombined ?? text.match(/\b([A-Z0-9]{6,8})\b/);
  const flight = text.match(/\b([A-Z]{2}\d{3,4}[A-Z0-9]*)\b/);
  const fromFile = fileName.match(/\b([A-Z]{2}\d{3,4})\b/i);
  return {
    codigo_reserva: pnr?.[1] ?? null,
    numero_voo: flight?.[1] ?? fromFile?.[1] ?? null,
  };
}

function inferDates(text: string) {
  const collectDateCandidates = () => {
    const candidates: string[] = [];
    const normalizedText = text.replace(/\s+/g, ' ');

    const numericRegex = /\b(?:20\d{2}[-/\.]\d{1,2}[-/\.]\d{1,2}|\d{1,2}[-/\.]\d{1,2}[-/\.]20\d{2})\b/g;
    let numericMatch: RegExpExecArray | null = null;
    while ((numericMatch = numericRegex.exec(normalizedText)) !== null) {
      const isoDate = normalizeDateLike(numericMatch[0]);
      if (isoDate) candidates.push(isoDate);
    }

    const monthRegex = /\b\d{1,2}\s*(?:de\s*)?[A-Za-zÀ-ÿ]{3,12}\.?,?\s*(?:de\s*)?20\d{2}\b/gi;
    let monthMatch: RegExpExecArray | null = null;
    while ((monthMatch = monthRegex.exec(normalizedText)) !== null) {
      const isoDate = normalizeDateLike(monthMatch[0]);
      if (isoDate) candidates.push(isoDate);
    }

    return Array.from(new Set(candidates));
  };

  const iso = text.match(/\b(20\d{2})[-/\.](\d{1,2})[-/\.](\d{1,2})\b/);
  const br = text.match(/\b(\d{1,2})[-/\.](\d{1,2})[-/\.](20\d{2})\b/);
  const checkIn = text.match(/(?:check[ -]?in|entrada)\s*[:\-]?\s*([0-9]{1,2}[/.\-][0-9]{1,2}[/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[/.\-][0-9]{1,2}[/.\-][0-9]{1,2})/i);
  const checkOut = text.match(/(?:check[ -]?out|sa[ií]da)\s*[:\-]?\s*([0-9]{1,2}[/.\-][0-9]{1,2}[/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[/.\-][0-9]{1,2}[/.\-][0-9]{1,2})/i);
  const checkInMonth = text.match(/(?:check[ -]?in|entrada)\s*[:\-]?\s*(\d{1,2}\s*(?:de\s*)?[A-Za-zÀ-ÿ]{3,12}\.?,?\s*(?:de\s*)?20\d{2})/i);
  const checkOutMonth = text.match(/(?:check[ -]?out|sa[ií]da)\s*[:\-]?\s*(\d{1,2}\s*(?:de\s*)?[A-Za-zÀ-ÿ]{3,12}\.?,?\s*(?:de\s*)?20\d{2})/i);
  const candidates = collectDateCandidates();

  const normalizedCheckIn = normalizeDateLike(checkIn?.[1] ?? checkInMonth?.[1] ?? null);
  const normalizedCheckOut = normalizeDateLike(checkOut?.[1] ?? checkOutMonth?.[1] ?? null);
  const genericPrimary = normalizeDateLike(iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[1]}-${br[2]}-${br[3]}` : null);
  const generic = genericPrimary ?? candidates[0] ?? null;
  const secondary = candidates.length > 1 ? candidates[1] : null;

  return {
    generic,
    secondary,
    checkIn: normalizedCheckIn ?? candidates[0] ?? null,
    checkOut: normalizedCheckOut ?? (candidates.length > 1 ? candidates[1] : null),
  };
}

function inferTime(text: string) {
  const match = text.match(/\b([01]\d|2[0-3])[:h]([0-5]\d)\b/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function inferMoney(text: string) {
  const hit = text.match(/(?:R\$|USD|EUR|CHF|GBP|\$)\s*([0-9][0-9.,]*)/i);
  const value = normalizeMoney(hit?.[1] ?? null);
  const symbol = text.match(/\b(R\$|USD|EUR|CHF|GBP)\b/i)?.[1]?.toUpperCase() ?? null;
  const moeda = symbol?.replace('$', '') ?? (text.includes('R$') ? 'BRL' : null);
  return { valor_total: value, moeda };
}

function inferProvider(text: string, fileName: string) {
  const bag = `${text} ${fileName}`.toLowerCase();
  if (/\blatam\b/.test(bag)) return 'LATAM';
  if (/\bgol\b/.test(bag)) return 'GOL';
  if (/\bazul\b/.test(bag)) return 'AZUL';
  if (/\blufthansa\b/.test(bag)) return 'Lufthansa';
  if (/\bair france\b/.test(bag)) return 'Air France';
  if (/\bairbnb\b/.test(bag)) return 'Airbnb';
  if (/\bbooking\b/.test(bag) || /\bbooking\.com\b/.test(bag)) return 'Booking.com';
  if (/\bexpedia\b/.test(bag)) return 'Expedia';
  return null;
}

function inferStayAddress(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const labeled = normalized.match(/(?:endere[çc]o|address)\s*[:\-]?\s*([^|]{8,120})/i);
  if (labeled) return labeled[1].trim();
  const streetLike = normalized.match(
    /\b\d{1,4}[A-Za-z]?\s+[A-Za-zÀ-ÿ' -]{2,70}\s(?:rua|street|st|avenida|av|road|rd|boulevard|blvd|allee|platz|rue)\b[^|]{0,90}/i,
  );
  if (streetLike) return streetLike[0].trim();
  const zipcodeLike = normalized.match(/\b\d{4,5}\s+[A-Za-zÀ-ÿ' -]{2,40}\b[^|]{0,80}/);
  if (zipcodeLike) return zipcodeLike[0].trim();
  return null;
}

function inferStayName(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.length >= 4 && line.length <= 90);
  const fromReservation = lines.find((line) =>
    /(?:room|apartamento|apartment|hotel|hostel|studio|reserva|booking|airbnb)/i.test(line),
  );
  if (fromReservation) return fromReservation;
  const titleLike = lines.find((line) => /^[A-Za-zÀ-ÿ0-9'"\- ,]{6,80}$/.test(line));
  if (titleLike) return titleLike;
  return null;
}

function normalizeCanonical(raw: Record<string, unknown>, text: string, fileName: string) {
  const metadataRaw = (raw.metadata ?? {}) as Record<string, unknown>;
  const dadosRaw = (raw.dados_principais ?? {}) as Record<string, unknown>;
  const financeiroRaw = (raw.financeiro ?? {}) as Record<string, unknown>;
  const enrichRaw = (raw.enriquecimento_ia ?? {}) as Record<string, unknown>;
  const hints = inferScopeAndTypeHints(text, fileName);

  const canonical: CanonicalPayload = {
    metadata: {
      tipo: normalizeTipo(metadataRaw.tipo) ?? hints.forcedType,
      confianca: normalizeConfidence0to100(metadataRaw.confianca),
      status: normalizeStatus(metadataRaw.status),
    },
    dados_principais: {
      nome_exibicao: strOrNull(dadosRaw.nome_exibicao),
      provedor: strOrNull(dadosRaw.provedor),
      codigo_reserva: strOrNull(dadosRaw.codigo_reserva),
      passageiro_hospede: strOrNull(dadosRaw.passageiro_hospede),
      data_inicio: normalizeDateLike(dadosRaw.data_inicio),
      hora_inicio: normalizeTimeLike(dadosRaw.hora_inicio),
      data_fim: normalizeDateLike(dadosRaw.data_fim),
      hora_fim: normalizeTimeLike(dadosRaw.hora_fim),
      origem: strOrNull(dadosRaw.origem),
      destino: strOrNull(dadosRaw.destino),
    },
    financeiro: {
      valor_total: normalizeMoney(financeiroRaw.valor_total),
      moeda: strOrNull(financeiroRaw.moeda)?.toUpperCase() ?? null,
      metodo: strOrNull(financeiroRaw.metodo),
      pontos_utilizados: numOrNull(financeiroRaw.pontos_utilizados),
    },
    enriquecimento_ia: {
      dica_viagem: strOrNull(enrichRaw.dica_viagem),
      como_chegar: strOrNull(enrichRaw.como_chegar),
      atracoes_proximas: strOrNull(enrichRaw.atracoes_proximas),
      restaurantes_proximos: strOrNull(enrichRaw.restaurantes_proximos),
    },
  };

  const scope = canonical.metadata.tipo ? hints.scope : 'outside_scope';

  if (scope === 'trip_related') {
    const airports = inferAirportCodes(text);
    const cityRoute = inferRouteByCityNames(text);
    const dates = inferDates(text);
    const firstTime = inferTime(text);
    const money = inferMoney(text);
    const flight = inferFlightCode(text, fileName);
    const provider = inferProvider(text, fileName);
    const stayAddress = inferStayAddress(text);
    const stayName = inferStayName(text);

    canonical.dados_principais.provedor = canonical.dados_principais.provedor ?? provider;

    canonical.dados_principais.origem =
      canonical.dados_principais.origem ??
      airports.origem ??
      cityRoute.origem ??
      null;
    canonical.dados_principais.destino =
      canonical.dados_principais.destino ??
      airports.destino ??
      (canonical.metadata.tipo === 'Hospedagem' ? stayAddress ?? cityRoute.destino : cityRoute.destino) ??
      null;
    canonical.dados_principais.data_inicio = canonical.dados_principais.data_inicio ?? (canonical.metadata.tipo === 'Hospedagem' ? dates.checkIn : dates.generic);
    canonical.dados_principais.data_fim =
      canonical.dados_principais.data_fim ??
      (canonical.metadata.tipo === 'Hospedagem' ? dates.checkOut : dates.secondary ?? null);
    canonical.dados_principais.hora_inicio = canonical.dados_principais.hora_inicio ?? firstTime;

    if (canonical.metadata.tipo === 'Voo') {
      canonical.dados_principais.codigo_reserva = canonical.dados_principais.codigo_reserva ?? flight.codigo_reserva;
      canonical.dados_principais.nome_exibicao = canonical.dados_principais.nome_exibicao ?? flight.numero_voo;
      canonical.dados_principais.provedor = canonical.dados_principais.provedor ?? provider;
    }

    if (canonical.metadata.tipo === 'Hospedagem') {
      canonical.dados_principais.nome_exibicao =
        canonical.dados_principais.nome_exibicao ??
        stayName ??
        (provider ? `${provider} reserva` : null);
      canonical.dados_principais.destino = canonical.dados_principais.destino ?? stayAddress ?? null;
    }

    canonical.financeiro.valor_total = canonical.financeiro.valor_total ?? money.valor_total;
    canonical.financeiro.moeda = canonical.financeiro.moeda ?? money.moeda;
  }

  return { canonical, scope };
}

function missingFromCanonical(payload: CanonicalPayload, scope: 'trip_related' | 'outside_scope') {
  if (scope === 'outside_scope') return [] as string[];
  const tipo = payload.metadata.tipo;
  const missing: string[] = [];
  const d = payload.dados_principais;

  if (!tipo) { missing.push('metadata.tipo'); return missing; }

  if (tipo === 'Voo') {
    if (!d.origem) missing.push('voo.origem');
    if (!d.destino) missing.push('voo.destino');
    if (!d.data_inicio) missing.push('voo.data_inicio');
    if (!d.codigo_reserva && !d.nome_exibicao) missing.push('voo.identificador');
  }
  if (tipo === 'Hospedagem') {
    if (!d.nome_exibicao) missing.push('hospedagem.nome_exibicao');
    if (!d.data_inicio) missing.push('hospedagem.data_inicio');
    if (!d.data_fim) missing.push('hospedagem.data_fim');
    if (!payload.financeiro.valor_total) missing.push('hospedagem.valor_total');
  }
  if (tipo === 'Transporte') {
    if (!d.origem) missing.push('transporte.origem');
    if (!d.destino) missing.push('transporte.destino');
    if (!d.data_inicio) missing.push('transporte.data_inicio');
  }
  if (tipo === 'Restaurante') {
    if (!d.nome_exibicao) missing.push('restaurante.nome');
    if (!d.destino) missing.push('restaurante.cidade');
  }
  return missing;
}

function toLegacyData(payload: CanonicalPayload) {
  const tipo = mapTipoToLegacy(payload.metadata.tipo);
  const status = payload.metadata.status?.toLowerCase();
  const normalizedStatus = status === 'confirmado' || status === 'cancelado' ? status : 'pendente';
  return {
    voo: tipo === 'voo' ? {
      numero: payload.dados_principais.nome_exibicao,
      companhia: payload.dados_principais.provedor,
      origem: payload.dados_principais.origem,
      destino: payload.dados_principais.destino,
      data: payload.dados_principais.data_inicio,
      status: normalizedStatus,
      valor: payload.financeiro.valor_total,
      moeda: payload.financeiro.moeda,
    } : null,
    hospedagem: tipo === 'hospedagem' ? {
      nome: payload.dados_principais.nome_exibicao,
      localizacao: payload.dados_principais.destino,
      check_in: payload.dados_principais.data_inicio,
      check_out: payload.dados_principais.data_fim,
      status: normalizedStatus,
      valor: payload.financeiro.valor_total,
      moeda: payload.financeiro.moeda,
    } : null,
    transporte: tipo === 'transporte' ? {
      tipo: payload.dados_principais.nome_exibicao,
      operadora: payload.dados_principais.provedor,
      origem: payload.dados_principais.origem,
      destino: payload.dados_principais.destino,
      data: payload.dados_principais.data_inicio,
      status: normalizedStatus,
      valor: payload.financeiro.valor_total,
      moeda: payload.financeiro.moeda,
    } : null,
    restaurante: tipo === 'restaurante' ? {
      nome: payload.dados_principais.nome_exibicao,
      cidade: payload.dados_principais.destino,
      tipo: payload.dados_principais.provedor,
      rating: null,
    } : null,
  };
}

function fieldConfidenceMap(payload: CanonicalPayload) {
  const d = payload.dados_principais;
  return {
    'voo.origem_destino': d.origem && d.destino ? 0.9 : 0.4,
    'voo.data': d.data_inicio ? 0.85 : 0.3,
    'hospedagem.checkin_checkout': d.data_inicio && d.data_fim ? 0.9 : 0.35,
  };
}

// ─── AI Provider Orchestration ────────────────────────────────────

type Candidate = {
  canonical: CanonicalPayload;
  scope: 'trip_related' | 'outside_scope';
  provider: 'openrouter' | 'gemini' | 'lovable_ai';
  usage: unknown;
  score: number;
  missingCount: number;
};

function providerTieBreak(provider: Candidate['provider']) {
  if (provider === 'openrouter') return 3;
  if (provider === 'gemini') return 2;
  return 1;
}

function scoreCandidate(payload: CanonicalPayload, scope: 'trip_related' | 'outside_scope', missingCount: number) {
  let score = 0;
  score += payload.metadata.tipo ? 25 : 0;
  score += Math.round(payload.metadata.confianca * 0.2);
  score += Math.max(0, 40 - missingCount * 8);
  if (scope === 'outside_scope') score += 15;
  if (payload.financeiro.valor_total != null && payload.financeiro.valor_total < 0) score -= 10;
  if (payload.dados_principais.data_inicio && payload.dados_principais.data_fim && payload.dados_principais.data_inicio > payload.dados_principais.data_fim) {
    score -= 15;
  }
  return score;
}

function toCandidate(
  raw: Record<string, unknown>,
  provider: Candidate['provider'],
  usage: unknown,
  text: string,
  fileName: string,
): Candidate {
  const normalized = normalizeCanonical(raw, text, fileName);
  const scope = normalized.scope as 'trip_related' | 'outside_scope';
  const missingCount = missingFromCanonical(normalized.canonical, scope).length;
  const score = scoreCandidate(normalized.canonical, scope, missingCount);
  return {
    canonical: normalized.canonical,
    scope,
    provider,
    usage,
    score,
    missingCount,
  };
}

async function callLovableAi(prompt: string, userContent: string) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    return { ok: false, parsed: null as Record<string, unknown> | null, usage: null as unknown, error: 'LOVABLE_API_KEY not configured' };
  }

  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: LOVABLE_MODEL,
      temperature: 0.05,
      max_tokens: 1300,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return { ok: false, parsed: null as Record<string, unknown> | null, usage: null as unknown, error: `LovableAI ${res.status}: ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, parsed: null as Record<string, unknown> | null, usage: json?.usage as unknown, error: 'LovableAI empty content' };
  }
  return { ok: true, parsed: extractJson(content), usage: json?.usage as unknown, error: null as string | null };
}

async function extractWithBestProvider(
  userContent: string,
  text: string,
  fileName: string,
  requestId: string,
  timeoutMs: number,
) {
  const parallel = await runParallelJsonInference({
    prompt: SYSTEM_PROMPT,
    userPayload: userContent,
    openRouterModel: ARCEE_MODEL,
    geminiModel: 'gemini-2.0-flash',
    timeoutMs,
    temperature: 0.05,
    maxTokens: 1300,
  });

  const candidates: Candidate[] = [];

  if (parallel.openrouter.ok && parallel.openrouter.parsed) {
    candidates.push(toCandidate(parallel.openrouter.parsed, 'openrouter', parallel.openrouter.usage, text, fileName));
  } else {
    console.warn(`[extract-reservation] ${requestId} openrouter failed: ${parallel.openrouter.error}`);
  }

  if (parallel.gemini.ok && parallel.gemini.parsed) {
    candidates.push(toCandidate(parallel.gemini.parsed, 'gemini', parallel.gemini.usage, text, fileName));
  } else {
    console.warn(`[extract-reservation] ${requestId} gemini failed: ${parallel.gemini.error}`);
  }

  let lovableUsed = false;
  if (candidates.length === 0) {
    const lovable = await callLovableAi(SYSTEM_PROMPT, userContent);
    if (lovable.ok && lovable.parsed) {
      candidates.push(toCandidate(lovable.parsed, 'lovable_ai', lovable.usage, text, fileName));
      lovableUsed = true;
    } else {
      console.warn(`[extract-reservation] ${requestId} lovable_ai failed: ${lovable.error}`);
    }
  }

  if (candidates.length === 0) {
    throw new Error('All AI providers returned invalid JSON');
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return providerTieBreak(b.provider) - providerTieBreak(a.provider);
  });

  const winner = candidates[0];
  const providerMeta = buildProviderMeta(winner.provider, {
    openrouter: parallel.openrouter,
    gemini: parallel.gemini,
  });

  if (lovableUsed && winner.provider === 'lovable_ai') {
    providerMeta.fallback_used = true;
  }

  return { ...winner, providerMeta };
}

// ─── Main handler ─────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      console.error('[extract-reservation]', requestId, 'unauthorized', auth.error);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar extração.', 401);
    }

    const featureContext = await loadFeatureGateContext(auth.userId);
    if (!isFeatureEnabled(featureContext, 'ff_ai_import_enabled')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'extract-reservation', status: 'blocked', reason: 'feature_disabled' },
      });
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'Seu plano atual não permite novas extrações com IA.',
        403,
      );
    }

    const limitPerHour = resolveAiRateLimit(BASE_LIMIT_PER_HOUR, featureContext);
    const timeoutMs = resolveAiTimeout(15_000, featureContext);

    const rate = consumeRateLimit(auth.userId, 'extract-reservation', limitPerHour, ONE_HOUR_MS);
    if (!rate.allowed) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'extract-reservation', status: 'blocked', reason: 'rate_limit' },
      });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de extrações atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.slice(0, 22000) : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : 'arquivo';

    if (!text.trim()) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Texto não informado para extração.', 400);
    }

    const userContent = `Arquivo: ${fileName}\n\nTexto OCR:\n${text}`;

    const { canonical, scope, provider, usage, providerMeta } = await extractWithBestProvider(
      userContent,
      text,
      fileName,
      requestId,
      timeoutMs,
    );

    const tipoLegacy = mapTipoToLegacy(canonical.metadata.tipo);
    const missingFields = missingFromCanonical(canonical, scope as 'trip_related' | 'outside_scope');
    const typeConfidence = confidenceToUnit(canonical.metadata.confianca);
    const extractionQuality: 'high' | 'medium' | 'low' =
      canonical.metadata.confianca >= 75 ? 'high' : canonical.metadata.confianca >= 55 ? 'medium' : 'low';

    const responsePayload = {
      metadata: canonical.metadata,
      dados_principais: canonical.dados_principais,
      financeiro: canonical.financeiro,
      enriquecimento_ia: canonical.enriquecimento_ia,
      type: scope === 'outside_scope' ? null : tipoLegacy,
      scope,
      confidence: typeConfidence,
      type_confidence: typeConfidence,
      field_confidence: fieldConfidenceMap(canonical),
      extraction_quality: extractionQuality,
      missingFields,
      data: toLegacyData(canonical),
      canonical,
      provider_meta: providerMeta,
    };

    console.info('[extract-reservation]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      limit_per_hour: limitPerHour,
      tipo: canonical.metadata.tipo,
      scope,
      confianca: canonical.metadata.confianca,
      missing_count: missingFields.length,
      provider,
      provider_meta: providerMeta,
      usage,
    });

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: 'ff_ai_import_enabled',
      viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
      metadata: {
        operation: 'extract-reservation',
        status: 'success',
        provider,
        scope,
        confidence: canonical.metadata.confianca,
      },
    });

    return successResponse(responsePayload);
  } catch (error) {
    if (error instanceof Error && error.message) {
      console.warn('[extract-reservation]', requestId, 'track_failed_event', error.message);
    }
    console.error('[extract-reservation]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado na extração.', 500);
  }
});
