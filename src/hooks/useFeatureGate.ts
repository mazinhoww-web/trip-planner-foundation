import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  buildEntitlements,
  FeatureEntitlements,
  FeatureKey,
  isFeatureEnabled,
  normalizePlanTier,
  readStoredOverrides,
  readStoredPlanTier,
} from '@/services/entitlements';

function userScopedKey(prefix: string, userId?: string | null) {
  return userId ? `${prefix}:${userId}` : prefix;
}

export function useFeatureGate(featureKey: FeatureKey) {
  const { user } = useAuth();

  return useMemo(() => {
    const planKey = userScopedKey('tp_plan_tier', user?.id ?? null);
    const overridesKey = userScopedKey('tp_feature_overrides', user?.id ?? null);

    const planTier = readStoredPlanTier(planKey);
    const storedOverrides = readStoredOverrides(overridesKey);
    const queryParamOverrides = typeof window !== 'undefined'
      ? normalizeDebugOverrides(new URLSearchParams(window.location.search).get('ff'))
      : {};

    const runtimeOverrides: Partial<FeatureEntitlements> = {
      ...storedOverrides,
      ...queryParamOverrides,
    };

    return {
      featureKey,
      enabled: isFeatureEnabled(featureKey, planTier, runtimeOverrides),
      planTier,
      entitlements: buildEntitlements(planTier, runtimeOverrides),
      runtimeOverrides,
    };
  }, [featureKey, user?.id]);
}

function normalizeDebugOverrides(raw: string | null): Partial<FeatureEntitlements> {
  if (!raw) return {};
  const result: Partial<FeatureEntitlements> = {};
  const entries = raw.split(',').map((item) => item.trim()).filter(Boolean);
  for (const entry of entries) {
    const [key, value] = entry.split(':');
    if (!key) continue;
    const normalizedValue = value === '1' || value === 'true' || value === 'on';
    (result as Record<string, boolean>)[key] = normalizedValue;
  }
  return result;
}
