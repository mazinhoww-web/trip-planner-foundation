import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTripExport } from '@/services/tripExport';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('trip export service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed export payload when function succeeds', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        data: {
          format: 'json',
          fileName: 'trip-snapshot.json',
          snapshot: {
            exportedAt: '2026-02-01T12:00:00.000Z',
            trip: { id: 'trip-1', nome: 'Trip' },
            totals: {},
            modules: {},
          },
        },
      },
      error: null,
    } as any);

    const result = await requestTripExport({ viagemId: 'trip-1', format: 'json' });

    expect(result.error).toBeNull();
    expect(result.data?.fileName).toBe('trip-snapshot.json');
    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledTimes(1);
  });

  it('returns friendly error when function fails', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { error: { message: 'blocked' } },
      error: { message: 'blocked' },
    } as any);

    const result = await requestTripExport({ viagemId: 'trip-1', format: 'pdf' });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('exposes rate-limit details when export quota is exceeded', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Limite diário de exportações atingido para o seu plano.',
          requestId: 'req-export-limit',
        },
      },
      error: { message: 'Edge Function returned a non-2xx status code' },
    } as any);

    const result = await requestTripExport({ viagemId: 'trip-1', format: 'json' });

    expect(result.data).toBeNull();
    expect(result.error).toContain('RATE_LIMITED');
    expect(result.error).toContain('Limite diário de exportações');
  });
});
