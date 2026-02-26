import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicTripSnapshot } from '@/services/publicApi';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('public trip api service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns snapshot data when function succeeds', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        data: {
          exportedAt: '2026-02-01T12:00:00.000Z',
          trip: { id: 'trip-1' },
          totals: { voos: 1 },
          modules: { voos: [] },
        },
      },
      error: null,
    } as any);

    const result = await fetchPublicTripSnapshot('trip-1');
    expect(result.error).toBeNull();
    expect(result.data?.trip?.id).toBe('trip-1');
  });

  it('returns parsed rate-limit message when backend blocks access', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Limite diário da API pública atingido para o seu plano.',
          requestId: 'req-1',
        },
      },
      error: { message: 'Edge Function returned a non-2xx status code' },
    } as any);

    const result = await fetchPublicTripSnapshot('trip-1');
    expect(result.data).toBeNull();
    expect(result.error).toContain('RATE_LIMITED');
    expect(result.error).toContain('Limite diário da API pública');
  });
});
