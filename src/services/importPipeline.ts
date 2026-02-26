import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

export type ImportType = 'voo' | 'hospedagem' | 'transporte' | 'restaurante';

export type ArceeExtractionPayload = {
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

export type ExtractedReservation = {
  type: ImportType | null;
  scope?: 'trip_related' | 'outside_scope';
  confidence: number;
  type_confidence?: number;
  field_confidence?: Record<string, number>;
  extraction_quality?: 'high' | 'medium' | 'low';
  provider_meta?: {
    selected?: 'openrouter' | 'gemini' | 'lovable_ai' | 'heuristic' | string;
    openrouter_ok?: boolean;
    gemini_ok?: boolean;
    openrouter_ms?: number;
    gemini_ms?: number;
    fallback_used?: boolean;
    reasoning_tokens_openrouter?: number | null;
  } | null;
  missingFields: string[];
  canonical?: ArceeExtractionPayload;
  data: {
    voo: {
      numero: string | null;
      companhia: string | null;
      origem: string | null;
      destino: string | null;
      data: string | null;
      status: 'confirmado' | 'pendente' | 'cancelado' | null;
      valor: number | null;
      moeda: string | null;
    } | null;
    hospedagem: {
      nome: string | null;
      localizacao: string | null;
      check_in: string | null;
      check_out: string | null;
      status: 'confirmado' | 'pendente' | 'cancelado' | null;
      valor: number | null;
      moeda: string | null;
    } | null;
    transporte: {
      tipo: string | null;
      operadora: string | null;
      origem: string | null;
      destino: string | null;
      data: string | null;
      status: 'confirmado' | 'pendente' | 'cancelado' | null;
      valor: number | null;
      moeda: string | null;
    } | null;
    restaurante: {
      nome: string | null;
      cidade: string | null;
      tipo: string | null;
      rating: number | null;
    } | null;
  };
};

const ALLOWED_EXTENSIONS = ['txt', 'html', 'eml', 'pdf', 'png', 'jpg', 'jpeg', 'webp'];

export function isAllowedImportFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.includes(ext);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extensionFromFile(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

type UploadImportResult = {
  path: string | null;
  ext: string;
  uploaded: boolean;
  warning: string | null;
};

function normalizeStorageErrorMessage(raw: string) {
  const text = raw.toLowerCase();
  if (text.includes('bucket') && (text.includes('not found') || text.includes('does not exist'))) {
    return 'Bucket de storage "imports" não encontrado.';
  }
  if (text.includes('permission') || text.includes('not authorized') || text.includes('row-level security')) {
    return 'Sem permissão para salvar no storage.';
  }
  return raw || 'Falha ao armazenar arquivo original.';
}

export async function uploadImportFile(file: File, userId: string, tripId: string) {
  const ext = extensionFromFile(file);
  const path = `${userId}/${tripId}/${Date.now()}_${sanitizeFileName(file.name)}`;

  const { error } = await supabase.storage.from('imports').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `application/${ext || 'octet-stream'}`,
  });

  if (error) {
    return {
      path: null,
      ext,
      uploaded: false,
      warning: normalizeStorageErrorMessage(error.message || ''),
    } satisfies UploadImportResult;
  }

  return {
    path,
    ext,
    uploaded: true,
    warning: null,
  } satisfies UploadImportResult;
}

function stripHtml(raw: string) {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function extractPdfTextFromRaw(raw: string) {
  const parts: string[] = [];

  const simpleMatch = /\(([^()]{2,})\)\s*Tj/g;
  let current: RegExpExecArray | null = null;
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
  return text.length >= 24 ? text : null;
}

async function tryExtractNativePdfText(file: File) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = new TextDecoder('latin1').decode(bytes);
    return extractPdfTextFromRaw(raw);
  } catch {
    return null;
  }
}

export async function tryExtractNativeText(file: File) {
  const ext = extensionFromFile(file);
  if (!['txt', 'html', 'eml', 'pdf'].includes(ext)) {
    return { text: null as string | null, method: 'none' as const };
  }

  if (ext === 'pdf') {
    const text = await tryExtractNativePdfText(file);
    return {
      text,
      method: text ? ('native_pdf' as const) : ('none' as const),
    };
  }

  const raw = await file.text();
  if (!raw.trim()) {
    return { text: null as string | null, method: 'none' as const };
  }

  if (ext === 'txt') {
    return { text: raw.trim(), method: 'native_text' as const };
  }

  return {
    text: stripHtml(raw) || null,
    method: ext === 'eml' ? ('native_eml' as const) : ('native_html' as const),
  };
}

const IMAGE_MAX_BYTES = 900_000; // ~900 KB target to stay under OCR.space 1 MB limit

function isImageFile(file: File) {
  const ext = extensionFromFile(file);
  return ['png', 'jpg', 'jpeg', 'webp'].includes(ext) || file.type.startsWith('image/');
}

async function resizeImageIfNeeded(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes || !isImageFile(file)) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file); // fallback to original
        return;
      }

      // Reduce progressively until under maxBytes
      const tryResize = (scale: number) => {
        const w = Math.round(width * scale);
        const h = Math.round(height * scale);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            if (blob.size <= maxBytes || scale <= 0.2) {
              const resized = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(resized);
            } else {
              tryResize(scale - 0.1);
            }
          },
          'image/jpeg',
          0.85,
        );
      };

      // Start at 90% and go down
      const initialScale = Math.min(1, Math.sqrt(maxBytes / file.size));
      tryResize(Math.min(initialScale, 0.9));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Falha ao carregar imagem para redimensionamento.'));
    };

    img.src = url;
  });
}

async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== 'string') {
        reject(new Error('Falha ao converter arquivo para base64.'));
        return;
      }
      resolve(value.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

export async function runOcrDocument(file: File) {
  // Resize images > 900KB to stay within OCR.space free tier limit
  const processedFile = await resizeImageIfNeeded(file, IMAGE_MAX_BYTES);
  const fileBase64 = await toBase64(processedFile);

  const { data, error } = await supabase.functions.invoke('ocr-document', {
    body: {
      fileBase64,
      fileName: file.name,
      mimeType: file.type || null,
    },
  });

  if (error) {
    throw new Error(parseFunctionError(data ?? error, 'Falha no OCR.'));
  }

  if (data?.error) {
    throw new Error(parseFunctionError(data, 'Falha no OCR.'));
  }

  const text = typeof data?.data?.text === 'string' ? data.data.text.trim() : '';
  const method = typeof data?.data?.method === 'string' ? data.data.method : 'unknown';
  const warnings = Array.isArray(data?.data?.warnings) ? data.data.warnings : [];
  const qualityMetrics =
    data?.data?.qualityMetrics && typeof data.data.qualityMetrics === 'object'
      ? data.data.qualityMetrics
      : null;

  if (!text) {
    throw new Error('OCR sem texto útil extraído.');
  }

  return { text, method, warnings, qualityMetrics };
}

export async function extractReservationStructured(text: string, fileName: string) {
  const { data, error } = await supabase.functions.invoke('extract-reservation', {
    body: { text, fileName },
  });

  if (error) throw new Error(parseFunctionError(data ?? error, 'Falha na extração estruturada.'));
  if (data?.error) throw new Error(parseFunctionError(data, 'Falha na extração estruturada.'));

  const parsed = data?.data as ExtractedReservation | undefined;
  if (!parsed) throw new Error('Extração retornou vazio.');
  return parsed;
}
