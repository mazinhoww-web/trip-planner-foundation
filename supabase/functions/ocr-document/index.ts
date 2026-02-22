import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const OCR_PROMPT = `Extraia todo o texto visivel deste documento de viagem.
Retorne apenas texto bruto.
Nao invente palavras ilegiveis.
Se algo estiver ilegivel, simplesmente omita.`;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const LIMIT_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

function extFromName(fileName: string | null | undefined) {
  if (!fileName) return '';
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function decodePdfTextToken(token: string) {
  return token
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\\d{3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPdfNativeText(base64: string) {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const raw = new TextDecoder('latin1').decode(bytes);
    const parts: string[] = [];

    let current: RegExpExecArray | null = null;
    const simpleMatch = /\(([^()]{2,})\)\s*Tj/g;
    while ((current = simpleMatch.exec(raw)) !== null) {
      const chunk = decodePdfTextToken(current[1]);
      if (chunk) parts.push(chunk);
    }

    const arrayMatch = /\[(.*?)\]\s*TJ/gs;
    while ((current = arrayMatch.exec(raw)) !== null) {
      const inner = current[1];
      const tokenMatch = /\(([^()]{2,})\)/g;
      let token: RegExpExecArray | null = null;
      while ((token = tokenMatch.exec(inner)) !== null) {
        const chunk = decodePdfTextToken(token[1]);
        if (chunk) parts.push(chunk);
      }
    }

    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    return text.length >= 24 ? text : '';
  } catch {
    return '';
  }
}

function qualityMetricsFromText(text: string) {
  const normalized = text || '';
  const lines = normalized.split(/\n+/).filter((line) => line.trim().length > 0);
  const digits = normalized.replace(/[^0-9]/g, '').length;
  const letters = normalized.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  const airportMatches = normalized.match(/\b[A-Z]{3}\b/g) || [];
  const checkinTokens = /(check[\s-]?in|check[\s-]?out|checkin|checkout|entrada|sa[ií]da)/i.test(normalized);

  return {
    text_length: normalized.length,
    line_count: lines.length,
    digit_ratio: normalized.length > 0 ? Number((digits / normalized.length).toFixed(4)) : 0,
    has_airport_codes: airportMatches.length >= 2,
    has_checkin_tokens: checkinTokens,
    has_structured_density: letters > 80 && digits > 10 && lines.length >= 3,
  };
}

async function runOcrSpace(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
  if (!apiKey) {
    return { text: '', error: 'OCR_SPACE_API_KEY não configurada.' };
  }

  const body = new URLSearchParams();
  body.append('apikey', apiKey);
  body.append('language', 'por');
  body.append('isOverlayRequired', 'false');
  body.append('OCREngine', '2');
  body.append('base64Image', `data:${mimeType || 'application/octet-stream'};base64,${base64}`);

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    return { text: '', error: `OCR.space HTTP ${res.status}` };
  }

  const json = await res.json();
  const parsed = Array.isArray(json?.ParsedResults) ? json.ParsedResults : [];
  const text = parsed.map((item: { ParsedText?: string }) => item.ParsedText || '').join('\n').trim();

  if (!text) {
    return { text: '', error: 'OCR.space sem texto extraído.' };
  }

  return { text, error: null as string | null };
}

async function runOpenAiVision(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return { text: '', error: 'OPENAI_API_KEY não configurada.' };
  }

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: OCR_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia texto bruto do documento.' },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType || 'image/png'};base64,${base64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return { text: '', error: `OpenAI vision falhou (${res.status}): ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    return { text: '', error: 'OpenAI vision sem texto extraído.' };
  }

  return { text, error: null as string | null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      console.error('[ocr-document]', requestId, 'unauthorized', auth.error);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar OCR.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'ocr-document', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      console.error('[ocr-document]', requestId, 'rate_limited', { userId: auth.userId });
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de OCR atingido. Tente novamente mais tarde.', 429, {
        resetAt: rate.resetAt,
      });
    }

    const body = await req.json();
    const fileBase64 = typeof body?.fileBase64 === 'string' ? body.fileBase64.slice(0, 6_000_000) : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : null;
    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : null;

    if (!fileBase64) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Arquivo base64 não informado.', 400);
    }

    const ext = extFromName(fileName);
    const warnings: string[] = [];
    const nativePdfText = (ext === 'pdf' || mimeType === 'application/pdf') ? extractPdfNativeText(fileBase64) : '';
    const nativeMetrics = nativePdfText ? qualityMetricsFromText(nativePdfText) : null;

    if (nativePdfText && nativeMetrics?.has_structured_density) {
      console.info('[ocr-document]', requestId, 'success', {
        userId: auth.userId,
        method: 'native_pdf_preferred',
        remaining: rate.remaining,
        qualityMetrics: nativeMetrics,
      });
      return successResponse({
        text: nativePdfText,
        method: 'native_pdf_preferred',
        warnings,
        qualityMetrics: nativeMetrics,
      });
    }

    const ocrResult = await runOcrSpace(fileBase64, mimeType);
    if (!ocrResult.error && ocrResult.text) {
      const metrics = qualityMetricsFromText(ocrResult.text);
      console.info('[ocr-document]', requestId, 'success', {
        userId: auth.userId,
        method: 'ocr_space',
        remaining: rate.remaining,
        qualityMetrics: metrics,
      });
      return successResponse({ text: ocrResult.text, method: 'ocr_space', warnings, qualityMetrics: metrics });
    }

    warnings.push(ocrResult.error || 'OCR.space indisponível.');
    console.error('[ocr-document]', requestId, 'ocr_space_failure', ocrResult.error);

    if (nativePdfText) {
      const metrics = qualityMetricsFromText(nativePdfText);
      if (metrics.text_length > 24) {
        warnings.push('OCR provider falhou. Texto nativo de PDF usado como fallback.');
        console.info('[ocr-document]', requestId, 'success', {
          userId: auth.userId,
          method: 'native_pdf_fallback',
          remaining: rate.remaining,
          qualityMetrics: metrics,
        });
        return successResponse({ text: nativePdfText, method: 'native_pdf_fallback', warnings, qualityMetrics: metrics });
      }
    }

    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || (mimeType || '').startsWith('image/')) {
      const vision = await runOpenAiVision(fileBase64, mimeType);
      if (!vision.error && vision.text) {
        const metrics = qualityMetricsFromText(vision.text);
        console.info('[ocr-document]', requestId, 'success', {
          userId: auth.userId,
          method: 'openai_vision',
          remaining: rate.remaining,
          qualityMetrics: metrics,
        });
        return successResponse({ text: vision.text, method: 'openai_vision', warnings, qualityMetrics: metrics });
      }

      warnings.push(vision.error || 'OpenAI vision indisponível.');
      console.error('[ocr-document]', requestId, 'openai_vision_failure', vision.error);
    }

    return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha no OCR em todas as camadas.', 502, {
      method: 'none',
      warnings,
    });
  } catch (error) {
    console.error('[ocr-document]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado no OCR.', 500);
  }
});
