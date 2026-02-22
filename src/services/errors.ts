type FunctionErrorShape = {
  code?: string;
  message?: string;
  requestId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function parseFunctionError(value: unknown, fallbackMessage: string): string {
  if (!value) return fallbackMessage;

  if (typeof value === 'string') return value;

  if (isRecord(value)) {
    const maybeError = isRecord(value.error) ? (value.error as FunctionErrorShape) : null;
    if (maybeError?.message) {
      const codePrefix = maybeError.code ? `[${maybeError.code}] ` : '';
      const requestSuffix = maybeError.requestId ? ` (ref: ${maybeError.requestId})` : '';
      return `${codePrefix}${maybeError.message}${requestSuffix}`;
    }

    const plainMessage = value.message;
    if (typeof plainMessage === 'string' && plainMessage.trim()) return plainMessage;
  }

  return fallbackMessage;
}
