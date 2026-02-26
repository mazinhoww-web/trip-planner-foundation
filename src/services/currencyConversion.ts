export const REFERENCE_RATES_TO_BRL: Record<string, number> = {
  BRL: 1,
  USD: 5.2,
  EUR: 5.8,
  CHF: 5.98,
  GBP: 6.5,
};

function normalizeCurrency(currency: string | null | undefined) {
  const normalized = (currency ?? 'BRL').toUpperCase();
  return normalized || 'BRL';
}

export function convertAmountByReference(value: number, fromCurrency: string | null | undefined, toCurrency: string | null | undefined) {
  const from = normalizeCurrency(fromCurrency);
  const to = normalizeCurrency(toCurrency);
  const fromRate = REFERENCE_RATES_TO_BRL[from] ?? REFERENCE_RATES_TO_BRL.BRL;
  const toRate = REFERENCE_RATES_TO_BRL[to] ?? REFERENCE_RATES_TO_BRL.BRL;
  if (!Number.isFinite(value)) return 0;
  const inBrl = value * fromRate;
  return inBrl / toRate;
}

export function convertTotalsRecordByReference(values: Record<string, number>, targetCurrency: string) {
  return Object.entries(values).reduce((total, [currency, amount]) => {
    if (typeof amount !== 'number' || Number.isNaN(amount)) return total;
    return total + convertAmountByReference(amount, currency, targetCurrency);
  }, 0);
}
