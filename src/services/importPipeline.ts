import { supabase } from '@/integrations/supabase/client';

export type ImportType = 'voo' | 'hospedagem' | 'transporte';

export type ExtractedReservation = {
  type: ImportType | null;
  confidence: number;
  missingFields: string[];
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

export async function uploadImportFile(file: File, userId: string, tripId: string) {
  const ext = extensionFromFile(file);
  const path = `${userId}/${tripId}/${Date.now()}_${sanitizeFileName(file.name)}`;

  const { error } = await supabase.storage.from('imports').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `application/${ext || 'octet-stream'}`,
  });

  if (error) {
    throw new Error(error.message || 'Falha ao armazenar arquivo original.');
  }

  return { path, ext };
}

function stripHtml(raw: string) {
  return raw
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function tryExtractNativeText(file: File) {
  const ext = extensionFromFile(file);
  if (!['txt', 'html', 'eml'].includes(ext)) {
    return { text: null as string | null, method: 'none' as const };
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
  const fileBase64 = await toBase64(file);

  const { data, error } = await supabase.functions.invoke('ocr-document', {
    body: {
      fileBase64,
      fileName: file.name,
      mimeType: file.type || null,
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha no OCR.');
  }

  const text = typeof data?.data?.text === 'string' ? data.data.text.trim() : '';
  const method = typeof data?.data?.method === 'string' ? data.data.method : 'unknown';
  const warnings = Array.isArray(data?.data?.warnings) ? data.data.warnings : [];

  if (!text) {
    throw new Error('OCR sem texto útil extraído.');
  }

  return { text, method, warnings };
}

export async function extractReservationStructured(text: string, fileName: string) {
  const { data, error } = await supabase.functions.invoke('extract-reservation', {
    body: {
      text,
      fileName,
    },
  });

  if (error) {
    throw new Error(error.message || 'Falha na extração estruturada.');
  }

  const parsed = data?.data as ExtractedReservation | undefined;
  if (!parsed) {
    throw new Error('Extração retornou vazio.');
  }

  return parsed;
}
