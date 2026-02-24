const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_TEXT_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export type AiProviderName = 'openrouter' | 'gemini' | 'lovable_ai' | 'heuristic';

export type ProviderCallResult<TParsed = Record<string, unknown>> = {
  provider: AiProviderName;
  ok: boolean;
  elapsedMs: number;
  rawText: string | null;
  parsed: TParsed | null;
  usage: Record<string, unknown> | null;
  error: string | null;
};

export type ProviderMeta = {
  selected: AiProviderName;
  openrouter_ok: boolean;
  gemini_ok: boolean;
  openrouter_ms?: number;
  gemini_ms?: number;
  fallback_used: boolean;
  reasoning_tokens_openrouter?: number | null;
};

type OpenRouterJsonOptions = {
  prompt: string;
  userPayload: string;
  model: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
};

type GeminiJsonOptions = {
  prompt: string;
  userPayload: string;
  model?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
};

type ParallelInferenceOptions<TParsed> = {
  prompt: string;
  userPayload: string;
  openRouterModel: string;
  geminiModel?: string;
  timeoutMs?: number;
  temperature?: number;
  maxTokens?: number;
  parser?: (rawText: string) => TParsed | null;
};

type VisionParallelOptions = {
  prompt: string;
  base64: string;
  mimeType: string;
  openRouterModel: string;
  geminiModel?: string;
  timeoutMs?: number;
  maxTokens?: number;
};

function envOpenRouterKey() {
  return Deno.env.get('open_router_key') ?? Deno.env.get('OPENROUTER_API_KEY');
}

function envGeminiKey() {
  return Deno.env.get('gemini_api_key') ?? Deno.env.get('GEMINI_API_KEY');
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function parseOpenRouterContent(content: unknown): string | null {
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
    return text || null;
  }
  return null;
}

export function extractJsonObject(rawText: string): Record<string, unknown> | null {
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = rawText.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractTextFromOpenRouterResponse(json: any): string | null {
  return parseOpenRouterContent(json?.choices?.[0]?.message?.content);
}

export function extractTextFromGeminiResponse(json: any): string | null {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();
  return text || null;
}

function openRouterUsage(json: any): Record<string, unknown> | null {
  if (!json?.usage || typeof json.usage !== 'object') return null;
  return json.usage as Record<string, unknown>;
}

function geminiUsage(json: any): Record<string, unknown> | null {
  if (!json?.usageMetadata || typeof json.usageMetadata !== 'object') return null;
  return json.usageMetadata as Record<string, unknown>;
}

export async function callOpenRouterJson(
  options: OpenRouterJsonOptions,
): Promise<ProviderCallResult<Record<string, unknown>>> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const apiKey = envOpenRouterKey();

  if (!apiKey) {
    return {
      provider: 'openrouter',
      ok: false,
      elapsedMs: 0,
      rawText: null,
      parsed: null,
      usage: null,
      error: 'OpenRouter API key not configured',
    };
  }

  try {
    const response = await withTimeout(
      fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
          'X-Title': 'Trip Planner Foundation',
        },
        body: JSON.stringify({
          model: options.model,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 1200,
          messages: [
            { role: 'system', content: options.prompt },
            { role: 'user', content: options.userPayload },
          ],
        }),
      }),
      timeoutMs,
      'openrouter',
    );

    if (!response.ok) {
      const raw = await response.text();
      return {
        provider: 'openrouter',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: null,
        error: `OpenRouter ${response.status}: ${raw.slice(0, 200)}`,
      };
    }

    const json = await response.json();
    const rawText = extractTextFromOpenRouterResponse(json);
    if (!rawText) {
      return {
        provider: 'openrouter',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: openRouterUsage(json),
        error: 'OpenRouter empty response',
      };
    }

    return {
      provider: 'openrouter',
      ok: true,
      elapsedMs: Date.now() - startedAt,
      rawText,
      parsed: extractJsonObject(rawText),
      usage: openRouterUsage(json),
      error: null,
    };
  } catch (error) {
    return {
      provider: 'openrouter',
      ok: false,
      elapsedMs: Date.now() - startedAt,
      rawText: null,
      parsed: null,
      usage: null,
      error: error instanceof Error ? error.message : 'OpenRouter unknown error',
    };
  }
}

export async function callGeminiJson(
  options: GeminiJsonOptions,
): Promise<ProviderCallResult<Record<string, unknown>>> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const apiKey = envGeminiKey();

  if (!apiKey) {
    return {
      provider: 'gemini',
      ok: false,
      elapsedMs: 0,
      rawText: null,
      parsed: null,
      usage: null,
      error: 'Gemini API key not configured',
    };
  }

  const model = options.model ?? 'gemini-2.0-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${options.prompt}\n\n${options.userPayload}` }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: options.maxTokens ?? 1200,
          },
        }),
      }),
      timeoutMs,
      'gemini',
    );

    if (!response.ok) {
      const raw = await response.text();
      return {
        provider: 'gemini',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: null,
        error: `Gemini ${response.status}: ${raw.slice(0, 200)}`,
      };
    }

    const json = await response.json();
    const rawText = extractTextFromGeminiResponse(json);
    if (!rawText) {
      return {
        provider: 'gemini',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: geminiUsage(json),
        error: 'Gemini empty response',
      };
    }

    return {
      provider: 'gemini',
      ok: true,
      elapsedMs: Date.now() - startedAt,
      rawText,
      parsed: extractJsonObject(rawText),
      usage: geminiUsage(json),
      error: null,
    };
  } catch (error) {
    return {
      provider: 'gemini',
      ok: false,
      elapsedMs: Date.now() - startedAt,
      rawText: null,
      parsed: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Gemini unknown error',
    };
  }
}

export async function runParallelJsonInference<TParsed = Record<string, unknown>>(
  options: ParallelInferenceOptions<TParsed>,
): Promise<{
  openrouter: ProviderCallResult<TParsed>;
  gemini: ProviderCallResult<TParsed>;
}> {
  const parser = options.parser;
  const [openrouterRaw, geminiRaw] = await Promise.all([
    callOpenRouterJson({
      prompt: options.prompt,
      userPayload: options.userPayload,
      model: options.openRouterModel,
      timeoutMs: options.timeoutMs,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    }),
    callGeminiJson({
      prompt: options.prompt,
      userPayload: options.userPayload,
      model: options.geminiModel,
      timeoutMs: options.timeoutMs,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    }),
  ]);

  const normalize = (result: ProviderCallResult<Record<string, unknown>>): ProviderCallResult<TParsed> => {
    const parsed = parser
      ? (result.rawText ? parser(result.rawText) : null)
      : (result.parsed as TParsed | null);
    return {
      ...result,
      parsed,
      ok: result.ok && parsed !== null,
    };
  };

  return {
    openrouter: normalize(openrouterRaw),
    gemini: normalize(geminiRaw),
  };
}

async function callOpenRouterVisionText(
  prompt: string,
  base64: string,
  mimeType: string,
  model: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<ProviderCallResult<never>> {
  const startedAt = Date.now();
  const apiKey = envOpenRouterKey();
  if (!apiKey) {
    return {
      provider: 'openrouter',
      ok: false,
      elapsedMs: 0,
      rawText: null,
      parsed: null,
      usage: null,
      error: 'OpenRouter API key not configured',
    };
  }

  try {
    const response = await withTimeout(
      fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local',
          'X-Title': 'Trip Planner Foundation',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          }],
        }),
      }),
      timeoutMs,
      'openrouter_vision',
    );

    if (!response.ok) {
      const raw = await response.text();
      return {
        provider: 'openrouter',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: null,
        error: `OpenRouter vision ${response.status}: ${raw.slice(0, 200)}`,
      };
    }

    const json = await response.json();
    const rawText = extractTextFromOpenRouterResponse(json);
    return {
      provider: 'openrouter',
      ok: !!rawText,
      elapsedMs: Date.now() - startedAt,
      rawText,
      parsed: null,
      usage: openRouterUsage(json),
      error: rawText ? null : 'OpenRouter vision empty response',
    };
  } catch (error) {
    return {
      provider: 'openrouter',
      ok: false,
      elapsedMs: Date.now() - startedAt,
      rawText: null,
      parsed: null,
      usage: null,
      error: error instanceof Error ? error.message : 'OpenRouter vision unknown error',
    };
  }
}

async function callGeminiVisionText(
  prompt: string,
  base64: string,
  mimeType: string,
  model: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<ProviderCallResult<never>> {
  const startedAt = Date.now();
  const apiKey = envGeminiKey();
  if (!apiKey) {
    return {
      provider: 'gemini',
      ok: false,
      elapsedMs: 0,
      rawText: null,
      parsed: null,
      usage: null,
      error: 'Gemini API key not configured',
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const response = await withTimeout(
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: maxTokens,
          },
        }),
      }),
      timeoutMs,
      'gemini_vision',
    );

    if (!response.ok) {
      const raw = await response.text();
      return {
        provider: 'gemini',
        ok: false,
        elapsedMs: Date.now() - startedAt,
        rawText: null,
        parsed: null,
        usage: null,
        error: `Gemini vision ${response.status}: ${raw.slice(0, 200)}`,
      };
    }

    const json = await response.json();
    const rawText = extractTextFromGeminiResponse(json);
    return {
      provider: 'gemini',
      ok: !!rawText,
      elapsedMs: Date.now() - startedAt,
      rawText,
      parsed: null,
      usage: geminiUsage(json),
      error: rawText ? null : 'Gemini vision empty response',
    };
  } catch (error) {
    return {
      provider: 'gemini',
      ok: false,
      elapsedMs: Date.now() - startedAt,
      rawText: null,
      parsed: null,
      usage: null,
      error: error instanceof Error ? error.message : 'Gemini vision unknown error',
    };
  }
}

export async function runParallelVisionText(
  options: VisionParallelOptions,
): Promise<{
  openrouter: ProviderCallResult<never>;
  gemini: ProviderCallResult<never>;
}> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxTokens = options.maxTokens ?? 2000;
  const geminiModel = options.geminiModel ?? 'gemini-2.0-flash';

  const [openrouter, gemini] = await Promise.all([
    callOpenRouterVisionText(
      options.prompt,
      options.base64,
      options.mimeType,
      options.openRouterModel,
      timeoutMs,
      maxTokens,
    ),
    callGeminiVisionText(
      options.prompt,
      options.base64,
      options.mimeType,
      geminiModel,
      timeoutMs,
      maxTokens,
    ),
  ]);

  return { openrouter, gemini };
}

export function buildProviderMeta(
  selected: AiProviderName,
  providers: { openrouter: ProviderCallResult<any>; gemini: ProviderCallResult<any> },
): ProviderMeta {
  const openrouterUsage = providers.openrouter.usage ?? {};
  const reasoning = Number(
    (openrouterUsage as any).reasoning_tokens ??
      (openrouterUsage as any).reasoningTokens ??
      0,
  );

  return {
    selected,
    openrouter_ok: providers.openrouter.ok,
    gemini_ok: providers.gemini.ok,
    openrouter_ms: providers.openrouter.elapsedMs,
    gemini_ms: providers.gemini.elapsedMs,
    fallback_used: selected !== 'openrouter',
    reasoning_tokens_openrouter: Number.isFinite(reasoning) && reasoning > 0 ? reasoning : null,
  };
}
