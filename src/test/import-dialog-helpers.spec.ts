import { describe, expect, it } from 'vitest';
import {
  appendExtractionSnapshot,
  makeQueueItem,
  queueStatusLabel,
  queueStatusVariant,
  toUserWarning,
  typeLabel,
} from '@/components/import/import-dialog-helpers';

describe('import dialog helpers', () => {
  it('builds queue item with expected defaults', () => {
    const file = new File(['content'], 'reserva.pdf', { type: 'application/pdf', lastModified: 123 });
    const item = makeQueueItem(file);

    expect(item.status).toBe('pending');
    expect(item.scope).toBe('trip_related');
    expect(item.needsUserConfirmation).toBe(true);
    expect(item.file.name).toBe('reserva.pdf');
  });

  it('maps status labels and variants', () => {
    expect(queueStatusLabel('saved')).toBe('Salvo');
    expect(queueStatusLabel('failed')).toBe('Falha');
    expect(queueStatusVariant('saved')).toBe('default');
    expect(queueStatusVariant('failed')).toBe('destructive');
  });

  it('converts technical errors into user-friendly warnings', () => {
    expect(toUserWarning('Bucket storage not found')).toContain('anexar o arquivo original');
    expect(toUserWarning('OCR timeout')).toContain('leitura automática');
    expect(toUserWarning('edge function failed to send a request')).toContain('IA não respondeu');
  });

  it('maps import types to human labels', () => {
    expect(typeLabel('voo')).toBe('Voo');
    expect(typeLabel('hospedagem')).toBe('Hospedagem');
    expect(typeLabel('restaurante')).toBe('Restaurante');
  });

  it('appends extraction snapshots and deduplicates equal payloads', () => {
    const canonical = {
      metadata: { tipo: 'Voo', confianca: 80, status: 'Pendente' },
      dados_principais: {
        nome_exibicao: 'LATAM',
        provedor: 'LATAM',
        codigo_reserva: 'ABC123',
        passageiro_hospede: null,
        data_inicio: '2026-04-02',
        hora_inicio: '10:00',
        data_fim: null,
        hora_fim: null,
        origem: 'FLN',
        destino: 'GRU',
      },
      financeiro: { valor_total: 500, moeda: 'BRL', metodo: null, pontos_utilizados: null },
      enriquecimento_ia: {
        dica_viagem: null,
        como_chegar: null,
        atracoes_proximas: null,
        restaurantes_proximos: null,
      },
    } as const;

    const once = appendExtractionSnapshot([], canonical, 'openrouter', 0.8);
    const duplicate = appendExtractionSnapshot(once, canonical, 'gemini', 0.7);

    expect(once).toHaveLength(1);
    expect(once[0].provider).toBe('openrouter');
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0].provider).toBe('openrouter');
  });
});
