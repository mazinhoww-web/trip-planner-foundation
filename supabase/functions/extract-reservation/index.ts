import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const PROMPT = `Analise este documento de reserva de viagem e extraia somente dados comprovados pelo conteudo.

Regras:
1) Classifique em: voo, hospedagem ou transporte.
2) Se nao houver evidencia para um campo, retorne null.
3) Datas no formato YYYY-MM-DD quando possivel.
4) Horarios no formato HH:MM quando possivel.
5) Nao escreva explicacoes fora do objeto de resposta.
6) Nao invente numeros de reserva, valores ou enderecos.

Retorne SOMENTE JSON no formato:
{
  "type": "voo|hospedagem|transporte|null",
  "confidence": 0.0,
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
    }
  }
}`;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const LIMIT_PER_HOUR = 20;
const ONE_HOUR_MS = 60 * 60 * 1000;

const allowedType = new Set(['voo', 'hospedagem', 'transporte']);
const allowedStatus = new Set(['confirmado', 'pendente', 'cancelado']);

function strOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function numOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').replace(/[^0-9.\-]/g, '');
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

    const confidenceRaw = typeof parsed.confidence === 'number' ? parsed.confidence : Number(parsed.confidence ?? 0);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;

    const missingFields = Array.isArray(parsed.missingFields)
      ? parsed.missingFields.map((item) => strOrNull(item)).filter((item): item is string => !!item)
      : [];

    const data = (parsed.data ?? {}) as Record<string, unknown>;
    const voo = (data.voo ?? {}) as Record<string, unknown>;
    const hospedagem = (data.hospedagem ?? {}) as Record<string, unknown>;
    const transporte = (data.transporte ?? {}) as Record<string, unknown>;

    const normalized = {
      type,
      confidence,
      missingFields,
      data: {
        voo: {
          numero: strOrNull(voo.numero),
          companhia: strOrNull(voo.companhia),
          origem: strOrNull(voo.origem),
          destino: strOrNull(voo.destino),
          data: strOrNull(voo.data),
          status: sanitizeStatus(voo.status),
          valor: numOrNull(voo.valor),
          moeda: strOrNull(voo.moeda),
        },
        hospedagem: {
          nome: strOrNull(hospedagem.nome),
          localizacao: strOrNull(hospedagem.localizacao),
          check_in: strOrNull(hospedagem.check_in),
          check_out: strOrNull(hospedagem.check_out),
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
      },
    };

    console.info('[extract-reservation]', requestId, 'success', {
      userId: auth.userId,
      remaining: rate.remaining,
      usage,
      type: normalized.type,
      confidence: normalized.confidence,
    });

    return successResponse(normalized);
  } catch (error) {
    console.error('[extract-reservation]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado na extração.', 500);
  }
});
