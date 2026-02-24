import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';
import { FeatureEntitlements, FeatureKey, PlanTier, buildEntitlements } from '@/services/entitlements';

export type FeatureGateContextPayload = {
  userId: string;
  planTier: PlanTier;
  entitlements: FeatureEntitlements;
  seatLimit: number;
  limits: Partial<Record<FeatureKey, number>>;
  source: 'database' | 'fallback';
  selfServiceEnabled: boolean;
  rolloutCohort: boolean;
  rolloutPercent: number;
  rolloutFeatures: FeatureKey[];
};

export type FeatureUsageSummaryPayload = {
  windowDays: number;
  totalEvents: number;
  byFeature: Array<{
    featureKey: FeatureKey | string;
    clusterKey: string;
    count: number;
    lastEventAt: string;
  }>;
  byCluster: Array<{
    clusterKey: string;
    count: number;
    lastEventAt: string;
  }>;
  activeFeatures: Array<FeatureKey | string>;
  aiMetrics: {
    requestCount: number;
    successCount: number;
    failedCount: number;
    blockedCount: number;
    successRate: number | null;
  };
  conversionMetrics: {
    upgradeCount: number;
    downgradeCount: number;
    events: number;
    lastPlanChangeAt: string | null;
  };
  generatedAt: string;
};

type FunctionEnvelope<T> = {
  data?: T;
  error?: unknown;
};

type SetOverrideInput = {
  featureKey: FeatureKey;
  enabled?: boolean | null;
  limitValue?: number | null;
};

function normalizeFeatureEntitlementsError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('feature-entitlements') || normalized.includes('function not found')) {
    return 'Recursos por plano ainda não estão ativos neste ambiente.';
  }
  return message;
}

function fallbackContext(userId: string): FeatureGateContextPayload {
  return {
    userId,
    planTier: 'free',
    entitlements: buildEntitlements('free'),
    seatLimit: Number.POSITIVE_INFINITY,
    limits: {},
    source: 'fallback',
    selfServiceEnabled: false,
    rolloutCohort: false,
    rolloutPercent: 0,
    rolloutFeatures: [],
  };
}

async function invokeFeatureEntitlements(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('feature-entitlements', { body });

  if (error) {
    const parsedError = parseFunctionError(data ?? error, 'Falha ao carregar recursos do plano.');
    return {
      data: null as FeatureGateContextPayload | null,
      error: normalizeFeatureEntitlementsError(parsedError),
    };
  }

  const parsed = data as FunctionEnvelope<FeatureGateContextPayload>;
  if (parsed?.error) {
    const parsedError = parseFunctionError(parsed, 'Falha ao carregar recursos do plano.');
    return {
      data: null as FeatureGateContextPayload | null,
      error: normalizeFeatureEntitlementsError(parsedError),
    };
  }

  return {
    data: parsed?.data ?? null,
    error: null as string | null,
  };
}

export async function getFeatureGateContext(userId: string) {
  const result = await invokeFeatureEntitlements({ action: 'get_context' });
  if (result.error || !result.data) {
    return {
      data: fallbackContext(userId),
      error: result.error,
    };
  }
  return result;
}

export async function setFeaturePlanTier(planTier: PlanTier) {
  return invokeFeatureEntitlements({ action: 'set_plan_tier', planTier });
}

export async function setFeatureOverride(input: SetOverrideInput) {
  return invokeFeatureEntitlements({
    action: 'set_override',
    featureKey: input.featureKey,
    enabled: input.enabled ?? null,
    limitValue: input.limitValue ?? null,
  });
}

export async function getFeatureUsageSummary(days = 7) {
  const result = await invokeFeatureEntitlements({
    action: 'usage_summary',
    days,
  });

  if (result.error || !result.data) {
    return {
      data: null as FeatureUsageSummaryPayload | null,
      error: result.error,
    };
  }

  const payload = result.data as FeatureGateContextPayload & { usageSummary?: FeatureUsageSummaryPayload };
  return {
    data: payload.usageSummary ?? null,
    error: null as string | null,
  };
}
