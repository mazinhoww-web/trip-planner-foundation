import { Tables } from '@/integrations/supabase/types';
import { ArceeExtractionPayload } from '@/services/importPipeline';

type DocumentoLite = Pick<Tables<'documentos'>, 'id' | 'importado' | 'extracao_payload' | 'nome'>;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function computeFileHash(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function withImportHash(
  canonical: ArceeExtractionPayload | null | undefined,
  fileHash: string | null,
  fileName: string,
): ArceeExtractionPayload | null {
  if (!canonical) return null;

  const base = canonical as unknown as JsonRecord;
  const metadata = isRecord(base.metadata) ? { ...base.metadata } : {};
  if (fileHash) {
    metadata.arquivo_hash = fileHash;
  }
  metadata.arquivo_nome = fileName;

  return {
    ...canonical,
    metadata: metadata as ArceeExtractionPayload['metadata'],
  };
}

export function extractImportHash(documento: DocumentoLite): string | null {
  const payload = documento.extracao_payload;
  if (!isRecord(payload)) return null;
  const metadata = payload.metadata;
  if (!isRecord(metadata)) return null;
  const hash = metadata.arquivo_hash;
  return typeof hash === 'string' && hash.trim() ? hash : null;
}

export function findImportedDocumentByHash(documentos: DocumentoLite[], hash: string | null) {
  if (!hash) return null;
  return documentos.find((doc) => doc.importado && extractImportHash(doc) === hash) ?? null;
}
