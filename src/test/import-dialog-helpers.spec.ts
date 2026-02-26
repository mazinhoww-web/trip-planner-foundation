import { describe, expect, it } from 'vitest';
import {
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
});
