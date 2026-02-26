import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTripWebhook } from '@/services/webhooks';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('webhooks service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success payload when webhook function succeeds', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        data: {
          delivered: true,
        },
      },
      error: null,
    } as any);

    const result = await dispatchTripWebhook({
      eventType: 'trip.import.completed',
      viagemId: 'trip-1',
      payload: { source: 'test' },
    });

    expect(result.error).toBeNull();
    expect(result.data).toBeTruthy();
  });

  it('returns parsed error when webhook function fails', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { error: { message: 'blocked' } },
      error: { message: 'blocked' },
    } as any);

    const result = await dispatchTripWebhook({
      eventType: 'trip.import.completed',
      viagemId: 'trip-1',
    });

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('returns quota message when webhook daily limit is reached', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Limite diário de webhooks atingido para o seu plano.',
          requestId: 'req-webhook-limit',
        },
      },
      error: { message: 'Edge Function returned a non-2xx status code' },
    } as any);

    const result = await dispatchTripWebhook({
      eventType: 'trip.import.completed',
      viagemId: 'trip-1',
    });

    expect(result.data).toBeNull();
    expect(result.error).toContain('RATE_LIMITED');
    expect(result.error).toContain('Limite diário de webhooks');
  });
});
