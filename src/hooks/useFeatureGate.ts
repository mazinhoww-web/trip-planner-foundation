import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import {
  buildEntitlements,
  FeatureEntitlements,
  FeatureKey,
  readStoredOverrides,
} from '@/services/entitlements';
import { getFeatureGateContext } from '@/services/featureEntitlements';

function userScopedKey(prefix: string, userId?: string | null) {
  return userId ? `${prefix}:${userId}` : prefix;
}

export function useFeatureGate(featureKey: FeatureKey) {
  const { user } = useAuth();

  const featureContextQuery = useQuery({
    queryKey: ['feature-entitlements', user?.id ?? null],
    queryFn: async () => {
      if (!user?.id) return null;
      const result = await getFeatureGateContext(user.id);
      if (!result.data) {
        throw new Error(result.error ?? 'Falha ao carregar recursos do plano.');
      }
      return {
        ...result.data,
        warning: result.error,
      };
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const overridesKey = userScopedKey('tp_feature_overrides', user?.id ?? null);
    const storedOverrides = readStoredOverrides(overridesKey);
    const queryParamOverrides = typeof window !== 'undefined'
      ? normalizeDebugOverrides(new URLSearchParams(window.location.search).get('ff'))
      : {};

    const runtimeOverrides: Partial<FeatureEntitlements> = {
      ...storedOverrides,
      ...queryParamOverrides,
    };

    const planTier = featureContextQuery.data?.planTier ?? 'free';
    const dbEntitlements = featureContextQuery.data?.entitlements ?? buildEntitlements(planTier);
    const mergedEntitlements = {
      ...dbEntitlements,
      ...runtimeOverrides,
    };
    const seatLimit = featureContextQuery.data?.seatLimit ?? Number.POSITIVE_INFINITY;

    return {
      featureKey,
      enabled: !!mergedEntitlements[featureKey],
      planTier,
      entitlements: mergedEntitlements,
      runtimeOverrides,
      seatLimit,
      limits: featureContextQuery.data?.limits ?? {},
      source: featureContextQuery.data?.source ?? 'fallback',
      selfServiceEnabled: featureContextQuery.data?.selfServiceEnabled ?? false,
      rolloutCohort: featureContextQuery.data?.rolloutCohort ?? false,
      rolloutPercent: featureContextQuery.data?.rolloutPercent ?? 0,
      rolloutFeatures: featureContextQuery.data?.rolloutFeatures ?? [],
      warning: featureContextQuery.data?.warning ?? null,
      isLoading: featureContextQuery.isLoading,
    };
  }, [featureContextQuery.data, featureContextQuery.isLoading, featureKey, user?.id]);
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
