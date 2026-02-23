import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const OCR_PROMPT = `Extraia todo o texto visivel deste documento de viagem.
Retorne apenas texto bruto.
Nao invente palavras ilegiveis.
Se algo estiver ilegivel, simplesmente omita.`;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const GEMMA_VISION_MODEL = 'google/gemma-3-27b-it:free';
const LOVABLE_VISION_MODEL = 'google/gemini-2.5-flash';

const LIMIT_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;
const OCR_SPACE_MAX_BYTES = 1_000_000;

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

function estimateBase64FileSize(base64: string): number {
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// ─── OCR Providers ───────────────────────────────────────────────

async function runOcrSpace(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
  if (!apiKey) return { text: '', error: 'OCR_SPACE_API_KEY não configurada.' };

  const body = new URLSearchParams();
  body.append('apikey', apiKey);
  body.append('language', 'por');
  body.append('isOverlayRequired', 'false');
  body.append('OCREngine', '2');
  body.append('base64Image', `data:${mimeType || 'application/octet-stream'};base64,${base64}`);

  const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body });
  if (!res.ok) return { text: '', error: `OCR.space HTTP ${res.status}` };

  const json = await res.json();
  const parsed = Array.isArray(json?.ParsedResults) ? json.ParsedResults : [];
  const text = parsed.map((item: { ParsedText?: string }) => item.ParsedText || '').join('\n').trim();
  if (!text) return { text: '', error: 'OCR.space sem texto extraído.' };
  return { text, error: null as string | null };
}

// 1st vision fallback: Gemma via OpenRouter
async function runGemmaVision(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('open_router_key');
  if (!apiKey) return { text: '', error: 'open_router_key não configurada.' };

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
      'X-Title': 'Trip Planner Foundation',
    },
    body: JSON.stringify({
      model: GEMMA_VISION_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/png'};base64,${base64}` } },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return { text: '', error: `Gemma vision ${res.status}: ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content || '').trim();
  if (!text) return { text: '', error: 'Gemma vision sem texto extraído.' };
  return { text, error: null as string | null };
}

// 2nd vision fallback: Gemini API direct
async function runGeminiVision(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('gemini_api_key');
  if (!apiKey) return { text: '', error: 'gemini_api_key não configurada.' };

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: OCR_PROMPT },
          { inline_data: { mime_type: mimeType || 'image/png', data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 2000 },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    return { text: '', error: `Gemini vision ${res.status}: ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const text = (json?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  if (!text) return { text: '', error: 'Gemini vision sem texto extraído.' };
  return { text, error: null as string | null };
}

// 3rd vision fallback: Lovable AI
async function runLovableVision(base64: string, mimeType: string | null) {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) return { text: '', error: 'LOVABLE_API_KEY não configurada.' };

  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LOVABLE_VISION_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: OCR_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia texto bruto do documento.' },
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/png'};base64,${base64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    if (res.status === 429) return { text: '', error: 'Rate limit do AI gateway atingido.' };
    if (res.status === 402) return { text: '', error: 'Créditos de AI insuficientes.' };
    return { text: '', error: `Lovable AI vision falhou (${res.status}): ${raw.slice(0, 120)}` };
  }

  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content || '').trim();
  if (!text) return { text: '', error: 'Lovable AI vision sem texto extraído.' };
  return { text, error: null as string | null };
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar OCR.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'ocr-document', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de OCR atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
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
    const fileSizeBytes = estimateBase64FileSize(fileBase64);
    const exceedsOcrSpaceLimit = fileSizeBytes > OCR_SPACE_MAX_BYTES;

    if (exceedsOcrSpaceLimit) {
      warnings.push(`Arquivo excede 1 MB (${(fileSizeBytes / 1_000_000).toFixed(2)} MB), OCR.space ignorado.`);
    }

    const isPdf = ext === 'pdf' || mimeType === 'application/pdf';
    const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) || (mimeType || '').startsWith('image/');
    const nativePdfText = isPdf ? extractPdfNativeText(fileBase64) : '';
    const nativeMetrics = nativePdfText ? qualityMetricsFromText(nativePdfText) : null;

    // 1. Try native PDF if good quality
    if (nativePdfText && nativeMetrics?.has_structured_density) {
      console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'native_pdf_preferred', remaining: rate.remaining });
      return successResponse({ text: nativePdfText, method: 'native_pdf_preferred', warnings, qualityMetrics: nativeMetrics });
    }

    // 2. Try OCR.space only if within size limit
    if (!exceedsOcrSpaceLimit) {
      const ocrResult = await runOcrSpace(fileBase64, mimeType);
      if (!ocrResult.error && ocrResult.text) {
        const metrics = qualityMetricsFromText(ocrResult.text);
        console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'ocr_space', remaining: rate.remaining });
        return successResponse({ text: ocrResult.text, method: 'ocr_space', warnings, qualityMetrics: metrics });
      }
      warnings.push(ocrResult.error || 'OCR.space indisponível.');
    }

    // 3. Fallback: native PDF text (lower quality)
    if (nativePdfText) {
      const metrics = qualityMetricsFromText(nativePdfText);
      if (metrics.text_length > 24) {
        warnings.push('OCR provider indisponível. Texto nativo de PDF usado como fallback.');
        console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'native_pdf_fallback', remaining: rate.remaining });
        return successResponse({ text: nativePdfText, method: 'native_pdf_fallback', warnings, qualityMetrics: metrics });
      }
    }

    // 4. Vision parallel race: all providers compete, first valid wins
    if (isImage || isPdf) {
      const visionMime = mimeType || (isImage ? 'image/png' : 'application/pdf');
      const VISION_TIMEOUT = 10_000;

      const withVisionTimeout = <T>(p: Promise<T>, label: string): Promise<T> =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${label} timeout ${VISION_TIMEOUT}ms`)), VISION_TIMEOUT);
          p.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
          );
        });

      try {
        const result = await Promise.any([
          withVisionTimeout(runGemmaVision(fileBase64, visionMime), 'gemma').then(r => {
            if (!r.text) throw new Error('gemma empty');
            return { ...r, method: 'gemma_vision' as const };
          }),
          withVisionTimeout(runGeminiVision(fileBase64, visionMime), 'gemini').then(r => {
            if (!r.text) throw new Error('gemini empty');
            return { ...r, method: 'gemini_vision' as const };
          }),
          withVisionTimeout(runLovableVision(fileBase64, visionMime), 'lovable').then(r => {
            if (!r.text) throw new Error('lovable empty');
            return { ...r, method: 'lovable_ai_vision' as const };
          }),
        ]);
        const metrics = qualityMetricsFromText(result.text);
        console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: result.method, remaining: rate.remaining });
        return successResponse({ text: result.text, method: result.method, warnings, qualityMetrics: metrics });
      } catch (aggError) {
        const errors = aggError instanceof AggregateError ? aggError.errors : [aggError];
        for (const e of errors) {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(msg);
          console.warn(`[ocr-document] ${requestId} vision_provider failed:`, msg);
        }
      }
    }

    return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha no OCR em todas as camadas.', 502, { method: 'none', warnings });
  } catch (error) {
    console.error('[ocr-document]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado no OCR.', 500);
  }
});
