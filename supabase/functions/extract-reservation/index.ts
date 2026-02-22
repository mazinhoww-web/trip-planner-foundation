import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const PROMPT = `Analise este documento de reserva de viagem e extraia somente dados comprovados pelo conteudo.

Regras:
1) Classifique em: voo, hospedagem, transporte ou restaurante.
1.1) Se o arquivo nao for sobre viagem, classifique scope=outside_scope e type=null.
2) Se nao houver evidencia para um campo, retorne null.
3) Datas no formato YYYY-MM-DD quando possivel.
4) Horarios no formato HH:MM quando possivel.
5) Nao escreva explicacoes fora do objeto de resposta.
6) Nao invente numeros de reserva, valores ou enderecos.

Retorne SOMENTE JSON no formato:
{
  "type": "voo|hospedagem|transporte|restaurante|null",
  "scope": "trip_related|outside_scope",
  "confidence": 0.0,
  "type_confidence": 0.0,
  "field_confidence": {
    "voo.origem_destino": 0.0,
    "voo.data": 0.0,
    "hospedagem.checkin_checkout": 0.0
  },
  "extraction_quality": "high|medium|low",
  "missingFields": ["campo1", "campo2"],
  "data": {
    "voo": {
      "numero": null,
      "companhia": null,
      "origem": null,
      "destino": null,
      "data": null,
      "status": null,
      "valor": null,
      "moeda": null
    },
    "hospedagem": {
      "nome": null,
      "localizacao": null,
      "check_in": null,
      "check_out": null,
      "status": null,
      "valor": null,
      "moeda": null
    },
    "transporte": {
      "tipo": null,
      "operadora": null,
      "origem": null,
      "destino": null,
      "data": null,
      "status": null,
      "valor": null,
      "moeda": null
    },
    "restaurante": {
      "nome": null,
      "cidade": null,
      "tipo": null,
      "rating": null
    }
  }
}`;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

const allowedType = new Set(['voo', 'hospedagem', 'transporte', 'restaurante']);
const allowedStatus = new Set(['confirmado', 'pendente', 'cancelado']);
const allowedScope = new Set(['trip_related', 'outside_scope']);
const allowedExtractionQuality = new Set(['high', 'medium', 'low']);

function strOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function numOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const sanitized = value.replace(/[^0-9,.\-]/g, '').trim();
    if (!sanitized) return null;
    const hasDot = sanitized.includes('.');
    const hasComma = sanitized.includes(',');
    let normalized = sanitized;

    if (hasDot && hasComma) {
      const lastDot = sanitized.lastIndexOf('.');
      const lastComma = sanitized.lastIndexOf(',');
      if (lastComma > lastDot) {
        normalized = sanitized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = sanitized.replace(/,/g, '');
      }
    } else if (hasComma) {
      normalized = sanitized.replace(',', '.');
    } else {
      normalized = sanitized;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeStatus(value: unknown) {
  const v = strOrNull(value);
  if (!v || !allowedStatus.has(v)) return null;
  return v;
}

function normalizeDateLike(value: unknown) {
  const raw = strOrNull(value);
  if (!raw) return null;

  const iso = raw.match(/\b(20\d{2})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, '0');
    const d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const br = raw.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d{2})\b/);
  if (br) {
    const d = br[1].padStart(2, '0');
    const m = br[2].padStart(2, '0');
    const y = br[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function clampConfidence(value: unknown) {
  const raw = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

function safeConfidenceMap(value: unknown) {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, raw]) => [key, clampConfidence(raw)] as const)
    .filter(([key]) => !!key.trim());
  return Object.fromEntries(entries);
}

function inferAirportCodes(text: string) {
  const normalized = text.replace(/\s+/g, ' ');
  const withArrow = normalized.match(/\b([A-Z]{3})\s*(?:-|->|→|\/)\s*([A-Z]{3})\b/);
  if (withArrow) {
    return { origem: withArrow[1], destino: withArrow[2] };
  }

  const labeled = normalized.match(/(?:origem|from)\s*[:\-]?\s*([A-Z]{3}).*?(?:destino|to)\s*[:\-]?\s*([A-Z]{3})/i);
  if (labeled) {
    return { origem: labeled[1].toUpperCase(), destino: labeled[2].toUpperCase() };
  }

  const all = normalized.match(/\b[A-Z]{3}\b/g) || [];
  if (all.length >= 2) {
    return { origem: all[0], destino: all[1] };
  }

  return { origem: null, destino: null };
}

function inferFlightDate(text: string) {
  const iso = text.match(/\b(20\d{2}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/);
  if (iso) return normalizeDateLike(iso[1]);

  const br = text.match(/\b(\d{1,2}[-\/.]\d{1,2}[-\/.]20\d{2})\b/);
  if (br) return normalizeDateLike(br[1]);

  return null;
}

function inferStayDates(text: string) {
  const checkInMatch = text.match(/(?:check[\s-]?in|entrada)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2})/i);
  const checkOutMatch = text.match(/(?:check[\s-]?out|sa[ií]da)\s*[:\-]?\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-](?:20[0-9]{2}|[0-9]{2})|20[0-9]{2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{1,2})/i);
  return {
    check_in: normalizeDateLike(checkInMatch?.[1] ?? null),
    check_out: normalizeDateLike(checkOutMatch?.[1] ?? null),
  };
}

function inferMoney(text: string) {
  const hit = text.match(/(?:R\$|USD|EUR|CHF|GBP|\$)\s*([0-9][0-9.,]*)/i);
  if (!hit) return { valor: null, moeda: null };

  const valor = numOrNull(hit[1]);
  const moedaHit = text.match(/\b(R\$|USD|EUR|CHF|GBP)\b/i);
  const moeda = moedaHit?.[1]?.toUpperCase()?.replace('$', '') ?? (text.includes('R$') ? 'BRL' : null);
  return {
    valor: Number.isFinite(valor) ? valor : null,
    moeda,
  };
}

function inferScopeAndTypeHints(text: string, fileName: string) {
  const bag = `${text} ${fileName}`.toLowerCase();
  const travel =
    /\b(voo|flight|airbnb|hotel|hospedagem|check-in|check-out|airport|aeroporto|pnr|iata|itiner[áa]rio|reserva|booking|trip)\b/.test(bag) ||
    /\b(latam|gol|azul|air france|lufthansa|booking\.com|airbnb)\b/.test(bag);

  if (!travel) {
    return { scope: 'outside_scope' as const, forcedType: null };
  }

  if (/\b(latam|gol|azul|flight|boarding|pnr|iata|ticket|itiner[áa]rio)\b/.test(bag)) {
    return { scope: 'trip_related' as const, forcedType: 'voo' as const };
  }
  if (/\b(airbnb|hotel|hospedagem|booking|check-in|checkout|check out|pousada)\b/.test(bag)) {
    return { scope: 'trip_related' as const, forcedType: 'hospedagem' as const };
  }
  if (/\b(restaurante|restaurant|reserva de mesa|opentable)\b/.test(bag)) {
    return { scope: 'trip_related' as const, forcedType: 'restaurante' as const };
  }

  return { scope: 'trip_related' as const, forcedType: null };
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
      console.error('[extract-reservation]', requestId, 'rate_limited', { userId: auth.userId });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de extrações atingido. Tente novamente mais tarde.', 429, {
        resetAt: rate.resetAt,
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return errorResponse(requestId, 'MISCONFIGURED', 'Integração IA não configurada.', 500);
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.slice(0, 20000) : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : 'arquivo';

    if (!text.trim()) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Texto não informado para extração.', 400);
    }

    const aiResponse = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT },
          {
            role: 'user',
            content: `Arquivo: ${fileName}\n\nConteudo:\n${text}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const raw = await aiResponse.text();
      console.error('[extract-reservation]', requestId, 'openai_error', aiResponse.status, raw.slice(0, 240));
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha na extração IA.', 502);
    }

    const aiJson = await aiResponse.json();
    const content = aiJson?.choices?.[0]?.message?.content;
    const usage = aiJson?.usage ?? null;
    if (typeof content !== 'string') {
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Resposta IA vazia.', 502);
    }

    const parsed = extractJson(content);
    if (!parsed) {
      console.error('[extract-reservation]', requestId, 'invalid_json', content.slice(0, 200));
      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Formato inválido na extração IA.', 502);
    }

    const typeRaw = strOrNull(parsed.type);
    const type = typeRaw && allowedType.has(typeRaw) ? typeRaw : null;

    const confidence = clampConfidence(parsed.confidence);
    const typeConfidence = clampConfidence(parsed.type_confidence ?? parsed.confidence);
    const fieldConfidence = safeConfidenceMap(parsed.field_confidence);
    const extractionQualityRaw = strOrNull(parsed.extraction_quality);
    const extractionQuality =
      extractionQualityRaw && allowedExtractionQuality.has(extractionQualityRaw) ? extractionQualityRaw : 'medium';
    const scopeRaw = strOrNull(parsed.scope);
    const heuristic = inferScopeAndTypeHints(text, fileName);
    const scope =
      scopeRaw && allowedScope.has(scopeRaw)
        ? scopeRaw
        : heuristic.scope;

    const missingFields = Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map((item) => strOrNull(item)).filter((item): item is string => !!item)
      : [];

    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const voo = (data.voo ?? {}) as Record<string, unknown>;
    const hospedagem = (data.hospedagem ?? {}) as Record<string, unknown>;
    const transporte = (data.transporte ?? {}) as Record<string, unknown>;
    const restaurante = (data.restaurante ?? {}) as Record<string, unknown>;

    const normalized = {
      type: scope === 'outside_scope' ? null : (type ?? heuristic.forcedType),
      scope,
      confidence,
      type_confidence: typeConfidence,
      field_confidence: fieldConfidence,
      extraction_quality: extractionQuality,
      missingFields,
      data: {
        voo: {
          numero: strOrNull(voo.numero),
          companhia: strOrNull(voo.companhia),
          origem: strOrNull(voo.origem),
          destino: strOrNull(voo.destino),
          data: normalizeDateLike(voo.data),
          status: sanitizeStatus(voo.status),
          valor: numOrNull(voo.valor),
          moeda: strOrNull(voo.moeda),
        },
        hospedagem: {
          nome: strOrNull(hospedagem.nome),
          localizacao: strOrNull(hospedagem.localizacao),
          check_in: normalizeDateLike(hospedagem.check_in),
          check_out: normalizeDateLike(hospedagem.check_out),
          status: sanitizeStatus(hospedagem.status),
          valor: numOrNull(hospedagem.valor),
          moeda: strOrNull(hospedagem.moeda),
        },
        transporte: {
          tipo: strOrNull(transporte.tipo),
          operadora: strOrNull(transporte.operadora),
          origem: strOrNull(transporte.origem),
          destino: strOrNull(transporte.destino),
          data: strOrNull(transporte.data),
          status: sanitizeStatus(transporte.status),
          valor: numOrNull(transporte.valor),
          moeda: strOrNull(transporte.moeda),
        },
        restaurante: {
          nome: strOrNull(restaurante.nome),
          cidade: strOrNull(restaurante.cidade),
          tipo: strOrNull(restaurante.tipo),
          rating: numOrNull(restaurante.rating),
        },
      },
    };

    if (normalized.scope !== 'outside_scope') {
      const airports = inferAirportCodes(text);
      const flightDate = inferFlightDate(text);
      const stayDates = inferStayDates(text);
      const money = inferMoney(text);

      if (normalized.type === 'voo' && normalized.data.voo) {
        normalized.data.voo.origem = normalized.data.voo.origem ?? airports.origem;
        normalized.data.voo.destino = normalized.data.voo.destino ?? airports.destino;
        normalized.data.voo.data = normalized.data.voo.data ?? flightDate;
        normalized.data.voo.valor = normalized.data.voo.valor ?? money.valor;
        normalized.data.voo.moeda = normalized.data.voo.moeda ?? money.moeda;
      }

      if (normalized.type === 'hospedagem' && normalized.data.hospedagem) {
        normalized.data.hospedagem.check_in = normalized.data.hospedagem.check_in ?? stayDates.check_in;
        normalized.data.hospedagem.check_out = normalized.data.hospedagem.check_out ?? stayDates.check_out;
        normalized.data.hospedagem.valor = normalized.data.hospedagem.valor ?? money.valor;
        normalized.data.hospedagem.moeda = normalized.data.hospedagem.moeda ?? money.moeda;
      }
    }

    console.info('[extract-reservation]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      usage,
      type: normalized.type,
      scope: normalized.scope,
      confidence: normalized.confidence,
    });

    return successResponse(normalized);
  } catch (error) {
    console.error('[extract-reservation]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado na extração.', 500);
  }
});
