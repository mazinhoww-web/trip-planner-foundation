import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const ARCEE_MODEL = 'arcee-ai/trinity-large-preview:free';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';

const LIMIT_PER_HOUR = 20;
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
  const all = normalized.match(/\b[A-Z]{3}\b/g) || [];
  if (all.length >= 2) return { origem: all[0], destino: all[1] };
  return { origem: null, destino: null };
}

function inferFlightCode(text: string, fileName: string) {
  const pnr = text.match(/\b([A-Z0-9]{6})\b/);
  const flight = text.match(/\b([A-Z]{2}\d{3,4}[A-Z0-9]*)\b/);
  const fromFile = fileName.match(/\b([A-Z]{2}\d{3,4}[A-Z0-9]*)\b/i);
  return {
    codigo_reserva: pnr?.[1] ?? null,
    numero_voo: flight?.[1] ?? fromFile?.[1] ?? null,
  };
}

function inferDates(text: string) {
  const iso = text.match(/\b(20\d{2})[-/\.](\d{1,2})[-/\.](\d{1,2})\b/);
  const br = text.match(/\b(\d{1,2})[-/\.](\d{1,2})[-/\.](20\d{2})\b/);
  const checkIn = text.match(/(?:check[ -]?in|entrada)\s*[:\-]?\s*([0-9]{1,2}[/.\-][0-9]{1,2}[/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[/.\-][0-9]{1,2}[/.\-][0-9]{1,2})/i);
  const checkOut = text.match(/(?:check[ -]?out|sa[ií]da)\s*[:\-]?\s*([0-9]{1,2}[/.\-][0-9]{1,2}[/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[/.\-][0-9]{1,2}[/.\-][0-9]{1,2})/i);
  return {
    generic: normalizeDateLike(iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[1]}-${br[2]}-${br[3]}` : null),
    checkIn: normalizeDateLike(checkIn?.[1] ?? null),
    checkOut: normalizeDateLike(checkOut?.[1] ?? null),
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
    const dates = inferDates(text);
    const firstTime = inferTime(text);
    const money = inferMoney(text);
    const flight = inferFlightCode(text, fileName);

    canonical.dados_principais.origem = canonical.dados_principais.origem ?? airports.origem ?? null;
    canonical.dados_principais.destino = canonical.dados_principais.destino ?? airports.destino ?? null;
    canonical.dados_principais.data_inicio = canonical.dados_principais.data_inicio ?? (canonical.metadata.tipo === 'Hospedagem' ? dates.checkIn : dates.generic);
    canonical.dados_principais.data_fim = canonical.dados_principais.data_fim ?? (canonical.metadata.tipo === 'Hospedagem' ? dates.checkOut : null);
    canonical.dados_principais.hora_inicio = canonical.dados_principais.hora_inicio ?? firstTime;

    if (canonical.metadata.tipo === 'Voo') {
      canonical.dados_principais.codigo_reserva = canonical.dados_principais.codigo_reserva ?? flight.codigo_reserva;
      canonical.dados_principais.nome_exibicao = canonical.dados_principais.nome_exibicao ?? flight.numero_voo;
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

// ─── AI Provider Calls ───────────────────────────────────────────

type AiResult = { content: string; provider: string; usage?: unknown };

async function callArcee(prompt: string, userContent: string): Promise<AiResult> {
  const apiKey = Deno.env.get('open_router_key');
  if (!apiKey) throw new Error('open_router_key not configured');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
      'X-Title': 'Trip Planner Foundation',
    },
    body: JSON.stringify({
      model: ARCEE_MODEL,
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
    throw new Error(`Arcee ${res.status}: ${raw.slice(0, 120)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Arcee empty content');
  return { content, provider: 'arcee', usage: json?.usage };
}

async function callGemini(prompt: string, userContent: string): Promise<AiResult> {
  const apiKey = Deno.env.get('gemini_api_key');
  if (!apiKey) throw new Error('gemini_api_key not configured');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `${prompt}\n\n${userContent}` }],
      }],
      generationConfig: {
        temperature: 0.05,
        maxOutputTokens: 1300,
      },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Gemini ${res.status}: ${raw.slice(0, 120)}`);
  }

  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Gemini empty content');
  return { content, provider: 'gemini', usage: json?.usageMetadata };
}

async function callLovableAi(prompt: string, userContent: string): Promise<AiResult> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');

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
    throw new Error(`LovableAI ${res.status}: ${raw.slice(0, 120)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('LovableAI empty content');
  return { content, provider: 'lovable_ai', usage: json?.usage };
}

// ─── Parallel extraction with confidence comparison ───────────────

async function extractWithBestProvider(
  userContent: string,
  text: string,
  fileName: string,
  requestId: string,
): Promise<{ canonical: CanonicalPayload; scope: string; provider: string; usage: unknown }> {
  // 1. Run Arcee + Gemini in parallel
  const [arceeResult, geminiResult] = await Promise.allSettled([
    callArcee(SYSTEM_PROMPT, userContent),
    callGemini(SYSTEM_PROMPT, userContent),
  ]);

  type Candidate = { parsed: Record<string, unknown>; canonical: CanonicalPayload; scope: string; provider: string; usage: unknown };
  const candidates: Candidate[] = [];

  for (const [result, name] of [[arceeResult, 'arcee'], [geminiResult, 'gemini']] as const) {
    if (result.status === 'fulfilled') {
      const parsed = extractJson(result.value.content);
      if (parsed) {
        const { canonical, scope } = normalizeCanonical(parsed, text, fileName);
        candidates.push({ parsed, canonical, scope, provider: result.value.provider, usage: result.value.usage });
      } else {
        console.warn(`[extract-reservation] ${requestId} ${name} invalid_json`);
      }
    } else {
      console.warn(`[extract-reservation] ${requestId} ${name} failed:`, result.reason?.message);
    }
  }

  // Pick highest confidence
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.canonical.metadata.confianca - a.canonical.metadata.confianca);
    const best = candidates[0];
    console.info(`[extract-reservation] ${requestId} selected_provider=${best.provider} confianca=${best.canonical.metadata.confianca}`);
    return best;
  }

  // 2. Fallback: Lovable AI
  console.warn(`[extract-reservation] ${requestId} falling_back_to_lovable_ai`);
  const lovableResult = await callLovableAi(SYSTEM_PROMPT, userContent);
  const parsed = extractJson(lovableResult.content);
  if (!parsed) throw new Error('All AI providers returned invalid JSON');
  const { canonical, scope } = normalizeCanonical(parsed, text, fileName);
  return { canonical, scope, provider: 'lovable_ai', usage: lovableResult.usage };
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

    const rate = consumeRateLimit(auth.userId, 'extract-reservation', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de extrações atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.slice(0, 22000) : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : 'arquivo';

    if (!text.trim()) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Texto não informado para extração.', 400);
    }

    const userContent = `Arquivo: ${fileName}\n\nTexto OCR:\n${text}`;

    const { canonical, scope, provider, usage } = await extractWithBestProvider(userContent, text, fileName, requestId);

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
      ai_provider: provider,
    };

    console.info('[extract-reservation]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      tipo: canonical.metadata.tipo,
      scope,
      confianca: canonical.metadata.confianca,
      missing_count: missingFields.length,
      provider,
      usage,
    });

    return successResponse(responsePayload);
  } catch (error) {
    console.error('[extract-reservation]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado na extração.', 500);
  }
});
