import { describe, expect, it } from 'vitest';
import {
  detectTypeFromText,
  inferFallbackExtraction,
  resolveImportScope,
  resolveImportType,
  toIsoDateTime,
} from '@/components/import/import-helpers';
import { ExtractedReservation } from '@/services/importPipeline';

function makeBaseExtraction(type: ExtractedReservation['type'] = null): ExtractedReservation {
  return {
    type,
    confidence: 0.5,
    scope: 'trip_related',
    missingFields: [],
    data: {
      voo: null,
      hospedagem: null,
      transporte: null,
      restaurante: null,
    },
  };
}

describe('import helpers', () => {
  it('detects flight-like content from LATAM text', () => {
    const type = detectTypeFromText('Comprovante LATAM LA3301 FLN -> GRU PNR WCTJSN', 'latam.pdf');
    expect(type).toBe('voo');
  });

  it('selects best type from extracted data when hint disagrees', () => {
    const extracted = makeBaseExtraction('hospedagem');
    extracted.data.voo = {
      numero: 'LA3301',
      companhia: 'LATAM',
      origem: 'FLN',
      destino: 'GRU',
      data: '2026-04-02',
      status: 'confirmado',
      valor: 1200,
      moeda: 'BRL',
    };

    const resolved = resolveImportType(extracted, 'Comprovante de reserva', 'documento.pdf');
    expect(resolved).toBe('voo');
  });

  it('marks outside scope when no travel signals are present', () => {
    const extracted = makeBaseExtraction(null);
    const scope = resolveImportScope(extracted, 'recibo de mercado e farmácia do mês', 'financas.pdf');
    expect(scope).toBe('outside_scope');
  });

  it('builds useful fallback extraction for flight document', () => {
    const extracted = inferFallbackExtraction(
      'LATAM LA3301 origem FLN destino GRU data 2026-04-02 total R$ 1299,90',
      'Comprovante-LATAM-LA3301.pdf',
      'São Paulo',
    );

    expect(extracted.type).toBe('voo');
    expect(extracted.data.voo?.numero).toBe('LA3301');
    expect(extracted.data.voo?.origem).toBe('FLN');
    expect(extracted.data.voo?.destino).toBe('GRU');
    expect(extracted.data.voo?.data).toBe('2026-04-02');
  });

  it('converts date + time into ISO datetime when both are valid', () => {
    const iso = toIsoDateTime('2026-04-02', '15:40');
    expect(iso).toContain('2026-04-02T15:40:00');
  });
});
