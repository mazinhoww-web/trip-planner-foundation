import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { consumeRateLimit, requireAuthenticatedUser } from '../_shared/security.ts';

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const LOVABLE_MODEL = 'google/gemini-3-flash-preview';

const LIMIT_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

const SYSTEM_PROMPT = `Role: Você é o motor de extração multi-item do "Trip Planner". Sua função é processar texto bruto (OCR ou digitado) de um roteiro ou documento de viagem e extrair TODOS os itens de viagem encontrados.

Diretrizes obrigatórias:
- Extraia TODOS os itens: voos, hospedagens, transportes, restaurantes e atividades/atrações.
- Normalize datas para ISO YYYY-MM-DD.
- Normalize horários para HH:MM (24h).
- Valores monetários com duas casas decimais.
- Se impossível determinar um campo, use null. NUNCA invente dados.
- Se o documento não contém informações de viagem, retorne items vazio.
- Cada item deve ter um campo "confianca" de 0 a 100 indicando certeza da extração.

Responda SOMENTE JSON válido no schema abaixo:
{
  "items": [
    {
      "tipo": "voo | hospedagem | transporte | restaurante | atividade",
      "confianca": 0-100,
      "dados": {
        // Para voo:
        // "numero": "string|null", "companhia": "string|null", "origem": "string|null",
        // "destino": "string|null", "data": "YYYY-MM-DD|null", "hora": "HH:MM|null",
        // "valor": 0.00, "moeda": "BRL|USD|EUR|null", "status": "confirmado|pendente|cancelado"

        // Para hospedagem:
        // "nome": "string|null", "localizacao": "string|null",
        // "check_in": "YYYY-MM-DD|null", "check_out": "YYYY-MM-DD|null",
        // "valor": 0.00, "moeda": "BRL|USD|EUR|null", "status": "confirmado|pendente|cancelado"

        // Para transporte:
        // "tipo": "string|null", "operadora": "string|null", "origem": "string|null",
        // "destino": "string|null", "data": "YYYY-MM-DD|null", "hora": "HH:MM|null",
        // "valor": 0.00, "moeda": "BRL|USD|EUR|null", "status": "confirmado|pendente|cancelado"

        // Para restaurante:
        // "nome": "string|null", "cidade": "string|null", "tipo": "string|null"

        // Para atividade:
        // "titulo": "string", "descricao": "string|null", "dia": "YYYY-MM-DD|null",
        // "horario": "HH:MM|null", "localizacao": "string|null", "categoria": "string|null"
      }
    }
  ],
  "resumo_viagem": {
    "destino": "string|null",
    "data_inicio": "YYYY-MM-DD|null",
    "data_fim": "YYYY-MM-DD|null"
  }
}`;

type ItineraryItem = {
  tipo: string;
  confianca: number;
  dados: Record<string, unknown>;
};

type ItineraryResponse = {
  items: ItineraryItem[];
  resumo_viagem: {
    destino: string | null;
    data_inicio: string | null;
    data_fim: string | null;
  };
};

function extractJson(content: string): Record<string, unknown> | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.replace(/[^0-9,.\-]/g, '').trim();
    if (!s) return null;
    let n = s;
    if (s.includes('.') && s.includes(',')) {
      n = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (s.includes(',')) {
      n = s.replace(',', '.');
    }
    const p = Number(n);
    return Number.isFinite(p) ? Number(p.toFixed(2)) : null;
  }
  return null;
}

function normDate(v: unknown): string | null {
  const raw = strOrNull(v);
  if (!raw) return null;
  const iso = raw.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const br = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return null;
}

function normTime(v: unknown): string | null {
  const raw = strOrNull(v);
  if (!raw) return null;
  const m = raw.match(/\b([01]\d|2[0-3])[:h]([0-5]\d)\b/i);
  return m ? `${m[1]}:${m[2]}` : null;
}

const VALID_TIPOS = new Set(['voo', 'hospedagem', 'transporte', 'restaurante', 'atividade']);

function normalizeItems(raw: Record<string, unknown>): ItineraryResponse {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const resumoRaw = (raw.resumo_viagem ?? {}) as Record<string, unknown>;

  const items: ItineraryItem[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const tipo = strOrNull(r.tipo)?.toLowerCase() ?? '';
    if (!VALID_TIPOS.has(tipo)) continue;

    const dadosRaw = (r.dados ?? {}) as Record<string, unknown>;
    const confianca = Math.max(0, Math.min(100, Math.round(Number(r.confianca ?? 50))));

    let dados: Record<string, unknown> = {};

    if (tipo === 'voo') {
      dados = {
        numero: strOrNull(dadosRaw.numero),
        companhia: strOrNull(dadosRaw.companhia),
        origem: strOrNull(dadosRaw.origem),
        destino: strOrNull(dadosRaw.destino),
        data: normDate(dadosRaw.data),
        hora: normTime(dadosRaw.hora),
        valor: numOrNull(dadosRaw.valor),
        moeda: strOrNull(dadosRaw.moeda)?.toUpperCase() ?? null,
        status: strOrNull(dadosRaw.status) ?? 'pendente',
      };
    } else if (tipo === 'hospedagem') {
      dados = {
        nome: strOrNull(dadosRaw.nome),
        localizacao: strOrNull(dadosRaw.localizacao),
        check_in: normDate(dadosRaw.check_in),
        check_out: normDate(dadosRaw.check_out),
        valor: numOrNull(dadosRaw.valor),
        moeda: strOrNull(dadosRaw.moeda)?.toUpperCase() ?? null,
        status: strOrNull(dadosRaw.status) ?? 'pendente',
      };
    } else if (tipo === 'transporte') {
      dados = {
        tipo: strOrNull(dadosRaw.tipo),
        operadora: strOrNull(dadosRaw.operadora),
        origem: strOrNull(dadosRaw.origem),
        destino: strOrNull(dadosRaw.destino),
        data: normDate(dadosRaw.data),
        hora: normTime(dadosRaw.hora),
        valor: numOrNull(dadosRaw.valor),
        moeda: strOrNull(dadosRaw.moeda)?.toUpperCase() ?? null,
        status: strOrNull(dadosRaw.status) ?? 'pendente',
      };
    } else if (tipo === 'restaurante') {
      dados = {
        nome: strOrNull(dadosRaw.nome),
        cidade: strOrNull(dadosRaw.cidade),
        tipo: strOrNull(dadosRaw.tipo),
      };
    } else if (tipo === 'atividade') {
      dados = {
        titulo: strOrNull(dadosRaw.titulo) ?? 'Atividade',
        descricao: strOrNull(dadosRaw.descricao),
        dia: normDate(dadosRaw.dia),
        horario: normTime(dadosRaw.horario),
        localizacao: strOrNull(dadosRaw.localizacao),
        categoria: strOrNull(dadosRaw.categoria),
      };
    }

    items.push({ tipo, confianca, dados });
  }

  return {
    items,
    resumo_viagem: {
      destino: strOrNull(resumoRaw.destino),
      data_inicio: normDate(resumoRaw.data_inicio),
      data_fim: normDate(resumoRaw.data_fim),
    },
  };
}

// ─── AI Calls ─────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function callGemini(prompt: string, userContent: string): Promise<string> {
  const apiKey = Deno.env.get('gemini_api_key');
  if (!apiKey) throw new Error('gemini_api_key not configured');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.05, maxOutputTokens: 6000 },
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    throw new Error(`Gemini ${res.status}: ${raw.slice(0, 120)}`);
  }

  const json = await res.json();
  const content = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Gemini empty');
  return content;
}

async function callLovableAi(prompt: string, userContent: string): Promise<string> {
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
      max_tokens: 6000,
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
  if (typeof content !== 'string' || !content.trim()) throw new Error('LovableAI empty');
  return content;
}

async function extractBestResult(userContent: string, requestId: string): Promise<ItineraryResponse> {
  // Try Gemini first with 10s timeout
  try {
    const raw = await withTimeout(callGemini(SYSTEM_PROMPT, userContent), 10000, 'gemini');
    const parsed = extractJson(raw);
    if (parsed) {
      const result = normalizeItems(parsed);
      if (result.items.length > 0) {
        console.info(`[extract-itinerary] ${requestId} gemini success items=${result.items.length}`);
        return result;
      }
    }
  } catch (e) {
    console.warn(`[extract-itinerary] ${requestId} gemini failed:`, (e as Error).message);
  }

  // Fallback: Lovable AI
  console.info(`[extract-itinerary] ${requestId} falling back to lovable_ai`);
  const raw = await callLovableAi(SYSTEM_PROMPT, userContent);
  const parsed = extractJson(raw);
  if (!parsed) throw new Error('All providers returned invalid JSON');
  return normalizeItems(parsed);
}

// ─── Main ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para usar extração de roteiro.', 401);
    }

    const rate = consumeRateLimit(auth.userId, 'extract-itinerary', LIMIT_PER_HOUR, ONE_HOUR_MS);
    if (!rate.allowed) {
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite de extrações atingido. Tente novamente mais tarde.', 429, { resetAt: rate.resetAt });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.slice(0, 30000) : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName : 'roteiro';

    if (!text.trim()) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Texto não informado para extração.', 400);
    }

    const userContent = `Arquivo: ${fileName}\n\nTexto do documento:\n${text}`;
    const result = await extractBestResult(userContent, requestId);

    console.info(`[extract-itinerary] ${requestId} success`, {
      userId: auth.userId,
      itemCount: result.items.length,
      tipos: result.items.map((i) => i.tipo),
    });

    return successResponse(result);
  } catch (error) {
    console.error(`[extract-itinerary] ${requestId} error`, error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Erro na extração do roteiro.', 500);
  }
});
