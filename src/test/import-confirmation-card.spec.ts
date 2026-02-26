import { describe, expect, it } from 'vitest';
import { toMissingFieldLabel } from '@/components/import/ImportConfirmationCard';

describe('import confirmation missing field labels', () => {
  it('maps canonical extraction keys to friendly labels', () => {
    expect(toMissingFieldLabel('dados_principais.origem')).toBe('Origem');
    expect(toMissingFieldLabel('dados_principais.destino')).toBe('Destino');
    expect(toMissingFieldLabel('financeiro.valor_total')).toBe('Valor total');
  });

  it('maps legacy typed keys to friendly labels', () => {
    expect(toMissingFieldLabel('voo.data_inicio')).toBe('Data do voo');
    expect(toMissingFieldLabel('hospedagem.valor_total')).toBe('Valor total da hospedagem');
    expect(toMissingFieldLabel('restaurante.nome')).toBe('Nome do restaurante');
  });

  it('keeps unknown keys unchanged', () => {
    expect(toMissingFieldLabel('campo.inexistente')).toBe('campo.inexistente');
  });
});
