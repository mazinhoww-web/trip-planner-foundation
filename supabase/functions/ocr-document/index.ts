import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';
import { buildProviderMeta, runParallelVisionText } from '../_shared/ai-providers.ts';
import {
  isFeatureEnabled,
  loadFeatureGateContext,
  resolveAiRateLimit,
  resolveAiTimeout,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';

const OCR_PROMPT = `Extraia todo o texto visivel deste documento de viagem.
Retorne apenas texto bruto.
Nao invente palavras ilegiveis.
Se algo estiver ilegivel, simplesmente omita.`;

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const GEMMA_VISION_MODEL = 'google/gemma-3-27b-it:free';
const GEMINI_MODEL = 'gemini-2.0-flash';
const LOVABLE_VISION_MODEL = 'google/gemini-2.5-flash';

const BASE_LIMIT_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;
const OCR_SPACE_MAX_BYTES = 1_000_000;

type QualityMetrics = {
  text_length: number;
  line_count: number;
  digit_ratio: number;
  has_airport_codes: boolean;
  has_checkin_tokens: boolean;
  has_structured_density: boolean;
};

type VisionCandidate = {
  provider: 'openrouter' | 'gemini';
  text: string;
  metrics: QualityMetrics;
  score: number;
};

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

function qualityMetricsFromText(text: string): QualityMetrics {
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

function scoreQuality(metrics: QualityMetrics) {
  let score = 0;
  score += Math.min(220, Math.round(metrics.text_length / 18));
  score += Math.min(140, metrics.line_count * 8);
  score += metrics.has_structured_density ? 45 : 0;
  score += metrics.has_airport_codes ? 25 : 0;
  score += metrics.has_checkin_tokens ? 20 : 0;
  if (metrics.digit_ratio < 0.01) score -= 10;
  if (metrics.digit_ratio > 0.6) score -= 10;
  return score;
}

function chooseBestVision(candidates: VisionCandidate[]) {
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.provider === 'openrouter') return -1;
    if (b.provider === 'openrouter') return 1;
    return 0;
  });
  return candidates[0] ?? null;
}

function estimateBase64FileSize(base64: string): number {
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function parseLovableContent(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

async function runOcrSpace(base64: string, mimeType: string | null) {
  try {
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

    const json = await res.json().catch(() => null);
    if (!json || typeof json !== 'object') {
      return { text: '', error: 'OCR.space resposta inválida.' };
    }

    const parsed = Array.isArray((json as Record<string, unknown>).ParsedResults)
      ? (json as Record<string, unknown>).ParsedResults as Array<{ ParsedText?: string }>
      : [];
    const text = parsed.map((item) => item.ParsedText || '').join('\n').trim();
    if (!text) {
      const upstreamMessage = Array.isArray((json as Record<string, unknown>).ErrorMessage)
        ? String((json as Record<string, unknown>).ErrorMessage?.[0] ?? '')
        : '';
      return { text: '', error: upstreamMessage || 'OCR.space sem texto extraído.' };
    }

    return { text, error: null as string | null };
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? `OCR.space indisponível: ${error.message}` : 'OCR.space indisponível.',
    };
  }
}

async function runLovableVision(base64: string, mimeType: string | null) {
  try {
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

    const json = await res.json().catch(() => null);
    const text = parseLovableContent((json as Record<string, any> | null)?.choices?.[0]?.message?.content);
    if (!text) return { text: '', error: 'Lovable AI vision sem texto extraído.' };
    return { text, error: null as string | null };
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? `Lovable AI vision indisponível: ${error.message}` : 'Lovable AI vision indisponível.',
    };
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para usar OCR.', 401);
    }

    const featureContext = await loadFeatureGateContext(auth.userId);
    if (!isFeatureEnabled(featureContext, 'ff_ai_import_enabled')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'ocr-document', status: 'blocked', reason: 'feature_disabled' },
      });
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'Seu plano atual não permite novas análises de arquivo com IA.',
        403,
      );
    }

    const limitPerHour = resolveAiRateLimit(BASE_LIMIT_PER_HOUR, featureContext);
    const timeoutMs = resolveAiTimeout(15_000, featureContext);
    const rate = consumeRateLimit(auth.userId, 'ocr-document', limitPerHour, ONE_HOUR_MS);
    if (!rate.allowed) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        metadata: { operation: 'ocr-document', status: 'blocked', reason: 'rate_limit' },
      });
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

    if (nativePdfText && nativeMetrics?.has_structured_density) {
      console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'native_pdf_preferred', remaining: rate.remaining, limit_per_hour: limitPerHour });
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_ai_import_enabled',
        viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
        metadata: { operation: 'ocr-document', status: 'success', method: 'native_pdf_preferred' },
      });
      return successResponse({ text: nativePdfText, method: 'native_pdf_preferred', warnings, qualityMetrics: nativeMetrics });
    }

    if (!exceedsOcrSpaceLimit) {
      const ocrResult = await runOcrSpace(fileBase64, mimeType);
      if (!ocrResult.error && ocrResult.text) {
        const metrics = qualityMetricsFromText(ocrResult.text);
        console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'ocr_space', remaining: rate.remaining, limit_per_hour: limitPerHour });
        await trackFeatureUsage({
          userId: auth.userId,
          featureKey: 'ff_ai_import_enabled',
          viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
          metadata: { operation: 'ocr-document', status: 'success', method: 'ocr_space' },
        });
        return successResponse({ text: ocrResult.text, method: 'ocr_space', warnings, qualityMetrics: metrics });
      }
      warnings.push(ocrResult.error || 'OCR.space indisponível.');
    }

    if (nativePdfText) {
      const metrics = qualityMetricsFromText(nativePdfText);
      if (metrics.text_length > 8) {
        warnings.push('OCR provider indisponível. Texto nativo de PDF usado como fallback.');
        console.info('[ocr-document]', requestId, 'success', { userId: auth.userId, method: 'native_pdf_fallback', remaining: rate.remaining, limit_per_hour: limitPerHour });
        await trackFeatureUsage({
          userId: auth.userId,
          featureKey: 'ff_ai_import_enabled',
          viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
          metadata: { operation: 'ocr-document', status: 'success', method: 'native_pdf_fallback' },
        });
        return successResponse({ text: nativePdfText, method: 'native_pdf_fallback', warnings, qualityMetrics: metrics });
      }
    }

    if (isImage || isPdf) {
      const visionMime = mimeType || (isImage ? 'image/png' : 'application/pdf');
      const parallelVision = await runParallelVisionText({
        prompt: OCR_PROMPT,
        base64: fileBase64,
        mimeType: visionMime,
        openRouterModel: GEMMA_VISION_MODEL,
        geminiModel: GEMINI_MODEL,
        timeoutMs,
        maxTokens: 2000,
      }).catch((visionError) => {
        warnings.push(
          visionError instanceof Error
            ? `Falha na etapa de visão paralela: ${visionError.message}`
            : 'Falha na etapa de visão paralela.',
        );
        return {
          openrouter: { provider: 'openrouter' as const, ok: false, elapsedMs: 0, rawText: null, parsed: null, usage: null, error: 'parallel_vision_failed' },
          gemini: { provider: 'gemini' as const, ok: false, elapsedMs: 0, rawText: null, parsed: null, usage: null, error: 'parallel_vision_failed' },
        };
      });

      const candidates: VisionCandidate[] = [];

      if (parallelVision.openrouter.ok && parallelVision.openrouter.rawText) {
        const metrics = qualityMetricsFromText(parallelVision.openrouter.rawText);
        candidates.push({
          provider: 'openrouter',
          text: parallelVision.openrouter.rawText,
          metrics,
          score: scoreQuality(metrics),
        });
      } else {
        warnings.push(parallelVision.openrouter.error || 'OpenRouter vision indisponível.');
      }

      if (parallelVision.gemini.ok && parallelVision.gemini.rawText) {
        const metrics = qualityMetricsFromText(parallelVision.gemini.rawText);
        candidates.push({
          provider: 'gemini',
          text: parallelVision.gemini.rawText,
          metrics,
          score: scoreQuality(metrics),
        });
      } else {
        warnings.push(parallelVision.gemini.error || 'Gemini vision indisponível.');
      }

      const selected = chooseBestVision(candidates);
      if (selected) {
        const providerMeta = buildProviderMeta(selected.provider, {
          openrouter: parallelVision.openrouter,
          gemini: parallelVision.gemini,
        });

        const method =
          selected.provider === 'openrouter'
            ? 'vision_parallel_selected_openrouter'
            : 'vision_parallel_selected_gemini';

        console.info('[ocr-document]', requestId, 'success', {
          userId: auth.userId,
          method,
          remaining: rate.remaining,
          limit_per_hour: limitPerHour,
          provider_meta: providerMeta,
        });

        await trackFeatureUsage({
          userId: auth.userId,
          featureKey: 'ff_ai_import_enabled',
          viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
          metadata: { operation: 'ocr-document', status: 'success', method, selected_provider: selected.provider },
        });

        return successResponse({
          text: selected.text,
          method,
          warnings,
          qualityMetrics: selected.metrics,
          provider_meta: providerMeta,
        });
      }

      const lovable = await runLovableVision(fileBase64, visionMime);
      if (lovable.text) {
        const metrics = qualityMetricsFromText(lovable.text);
        const providerMeta = buildProviderMeta('lovable_ai', {
          openrouter: parallelVision.openrouter,
          gemini: parallelVision.gemini,
        });
        providerMeta.fallback_used = true;

        console.info('[ocr-document]', requestId, 'success', {
          userId: auth.userId,
          method: 'lovable_ai_vision',
          remaining: rate.remaining,
          limit_per_hour: limitPerHour,
          provider_meta: providerMeta,
        });

        await trackFeatureUsage({
          userId: auth.userId,
          featureKey: 'ff_ai_import_enabled',
          viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
          metadata: { operation: 'ocr-document', status: 'success', method: 'lovable_ai_vision' },
        });

        return successResponse({
          text: lovable.text,
          method: 'lovable_ai_vision',
          warnings,
          qualityMetrics: metrics,
          provider_meta: providerMeta,
        });
      }

      if (lovable.error) {
        warnings.push(lovable.error);
      }
    }

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: 'ff_ai_import_enabled',
      viagemId: typeof body?.viagemId === 'string' ? body.viagemId : null,
      metadata: { operation: 'ocr-document', status: 'failed', reason: 'all_layers_failed' },
    });
    return errorResponse(requestId, 'UPSTREAM_ERROR', 'Falha no OCR em todas as camadas.', 502, { method: 'none', warnings });
  } catch (error) {
    console.error('[ocr-document]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro inesperado no OCR.', 500);
  }
});
