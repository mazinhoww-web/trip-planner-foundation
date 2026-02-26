import { describe, expect, it } from 'vitest';
import {
  computeCriticalMissingFields,
  detectTypeFromText,
  inferFallbackExtraction,
  mergeMissingFields,
  resolveImportScope,
  resolveImportType,
  toIsoDateTime,
} from '@/components/import/import-helpers';
import { ExtractedReservation } from '@/services/importPipeline';
import { ReviewState } from '@/components/import/import-types';

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

function makeReviewState(type: ReviewState['type']): ReviewState {
  return {
    type,
    voo: {
      nome_exibicao: '',
      provedor: '',
      codigo_reserva: '',
      passageiro_hospede: '',
      numero: '',
      companhia: '',
      origem: '',
      destino: '',
      data_inicio: '',
      hora_inicio: '',
      data_fim: '',
      hora_fim: '',
      status: 'pendente',
      valor: '',
      moeda: 'BRL',
      metodo_pagamento: '',
      pontos_utilizados: '',
    },
    hospedagem: {
      nome_exibicao: '',
      provedor: '',
      codigo_reserva: '',
      passageiro_hospede: '',
      nome: '',
      localizacao: '',
      check_in: '',
      hora_inicio: '',
      check_out: '',
      hora_fim: '',
      status: 'pendente',
      valor: '',
      moeda: 'BRL',
      metodo_pagamento: '',
      pontos_utilizados: '',
      dica_viagem: '',
      como_chegar: '',
      atracoes_proximas: '',
      restaurantes_proximos: '',
      dica_ia: '',
    },
    transporte: {
      nome_exibicao: '',
      provedor: '',
      codigo_reserva: '',
      passageiro_hospede: '',
      tipo: '',
      operadora: '',
      origem: '',
      destino: '',
      data_inicio: '',
      hora_inicio: '',
      data_fim: '',
      hora_fim: '',
      status: 'pendente',
      valor: '',
      moeda: 'BRL',
      metodo_pagamento: '',
      pontos_utilizados: '',
    },
    restaurante: {
      nome: '',
      cidade: '',
      tipo: '',
      rating: '',
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
    expect(extracted.data.voo?.moeda).toBe('BRL');
    expect(extracted.canonical?.financeiro.moeda).toBe('BRL');
  });

  it('parses city routes and month-text dates for flight fallback', () => {
    const extracted = inferFallbackExtraction(
      'LATAM localizador WCTJSN de Cuiabá para São Paulo em 02 abril 2026',
      'comprovante-latam.pdf',
      null,
    );

    expect(extracted.type).toBe('voo');
    expect(extracted.canonical?.dados_principais.codigo_reserva).toBe('WCTJSN');
    expect(extracted.canonical?.dados_principais.origem).toBe('Cuiabá');
    expect(extracted.canonical?.dados_principais.destino).toBe('São Paulo');
    expect(extracted.canonical?.dados_principais.data_inicio).toBe('2026-04-02');
  });

  it('builds useful fallback extraction for airbnb receipts with address and BRL suffix', () => {
    const extracted = inferFallbackExtraction(
      'Airbnb recibo check-in 18/02/2026 check-out 19/02/2026 endereço 21 Bis Rue de Paris, Clichy, France total 836,73 BRL',
      'Airbnb-recibo.pdf',
      null,
    );

    expect(extracted.type).toBe('hospedagem');
    expect(extracted.data.hospedagem?.check_in).toBe('2026-02-18');
    expect(extracted.data.hospedagem?.check_out).toBe('2026-02-19');
    expect(extracted.data.hospedagem?.localizacao).toContain('Clichy');
    expect(extracted.data.hospedagem?.valor).toBeCloseTo(836.73);
    expect(extracted.data.hospedagem?.moeda).toBe('BRL');
    expect(extracted.canonical?.dados_principais.destino).toContain('Clichy');
  });

  it('converts date + time into ISO datetime when both are valid', () => {
    const iso = toIsoDateTime('2026-04-02', '15:40');
    expect(iso).toContain('2026-04-02T15:40:00');
  });

  it('computes critical missing fields for flight reviews', () => {
    const review = makeReviewState('voo');
    review.voo.origem = 'FLN';

    const missing = computeCriticalMissingFields('voo', review, 'trip_related');
    expect(missing).toEqual(expect.arrayContaining(['voo.destino', 'voo.data_inicio', 'voo.identificador']));
    expect(missing).not.toContain('voo.origem');
  });

  it('merges static missing fields with computed fields and removes transient ones', () => {
    const merged = mergeMissingFields(
      ['metadata.tipo', 'review_manual_requerida', 'hospedagem.data_inicio'],
      ['hospedagem.data_fim', 'hospedagem.valor_total'],
    );

    expect(merged).toContain('metadata.tipo');
    expect(merged).toContain('hospedagem.data_fim');
    expect(merged).toContain('hospedagem.valor_total');
    expect(merged).not.toContain('review_manual_requerida');
    expect(merged).not.toContain('hospedagem.data_inicio');
  });
});
