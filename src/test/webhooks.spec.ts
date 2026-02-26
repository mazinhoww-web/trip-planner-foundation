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
});
