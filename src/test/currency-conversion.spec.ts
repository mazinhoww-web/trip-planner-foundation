import { describe, expect, it } from 'vitest';
import { convertAmountByReference, convertTotalsRecordByReference } from '@/services/currencyConversion';

describe('currency conversion by reference', () => {
  it('converts from usd to brl', () => {
    expect(convertAmountByReference(10, 'USD', 'BRL')).toBe(52);
  });

  it('converts totals record to target currency', () => {
    const result = convertTotalsRecordByReference(
      {
        BRL: 100,
        USD: 10,
      },
      'BRL',
    );
    expect(result).toBe(152);
  });

  it('falls back to brl when currency is unknown', () => {
    expect(convertAmountByReference(10, 'XYZ', 'BRL')).toBe(10);
  });
});
