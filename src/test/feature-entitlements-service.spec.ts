import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeatureGateContext, getFeatureUsageSummary } from '@/services/featureEntitlements';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('feature entitlements service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns usage summary payload when function provides usageSummary', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        data: {
          usageSummary: {
            windowDays: 7,
            totalEvents: 10,
            byFeature: [],
            byCluster: [],
            activeFeatures: [],
            aiMetrics: {
              requestCount: 4,
              successCount: 3,
              failedCount: 1,
              blockedCount: 0,
              successRate: 0.75,
            },
            conversionMetrics: {
              upgradeCount: 1,
              downgradeCount: 0,
              events: 1,
              lastPlanChangeAt: '2026-02-01T00:00:00.000Z',
            },
            generatedAt: '2026-02-01T00:00:00.000Z',
          },
        },
      },
      error: null,
    } as any);

    const result = await getFeatureUsageSummary(7);
    expect(result.error).toBeNull();
    expect(result.data?.totalEvents).toBe(10);
  });

  it('falls back to free context when feature-entitlements is unavailable', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { error: { message: 'Function not found: feature-entitlements' } },
      error: { message: 'Function not found: feature-entitlements' },
    } as any);

    const result = await getFeatureGateContext('user-1');
    expect(result.data?.planTier).toBe('free');
    expect(result.data?.source).toBe('fallback');
    expect(result.error).toContain('Recursos por plano');
  });
});
