export type PlanTier = 'free' | 'pro' | 'team';

export type FeatureKey =
  | 'ff_collab_enabled'
  | 'ff_collab_seat_limit_enforced'
  | 'ff_collab_editor_role'
  | 'ff_collab_audit_log'
  | 'ff_ai_import_enabled'
  | 'ff_ai_batch_high_volume'
  | 'ff_ai_priority_inference'
  | 'ff_ai_reprocess_unlimited'
  | 'ff_export_pdf'
  | 'ff_export_json_full'
  | 'ff_budget_advanced_insights'
  | 'ff_public_api_access'
  | 'ff_webhooks_enabled';

export type FeatureEntitlements = Record<FeatureKey, boolean>;
export type SeatLimit = {
  hardLimit: number;
  planTier: PlanTier;
};

const BASE_FLAGS: FeatureEntitlements = {
  ff_collab_enabled: true,
  ff_collab_seat_limit_enforced: false,
  ff_collab_editor_role: true,
  ff_collab_audit_log: false,
  ff_ai_import_enabled: true,
  ff_ai_batch_high_volume: false,
  ff_ai_priority_inference: false,
  ff_ai_reprocess_unlimited: false,
  ff_export_pdf: false,
  ff_export_json_full: false,
  ff_budget_advanced_insights: false,
  ff_public_api_access: false,
  ff_webhooks_enabled: false,
};

const PLAN_OVERRIDES: Record<PlanTier, Partial<FeatureEntitlements>> = {
  free: {},
  pro: {
    ff_ai_batch_high_volume: true,
    ff_ai_reprocess_unlimited: true,
    ff_export_pdf: true,
    ff_export_json_full: true,
    ff_budget_advanced_insights: true,
  },
  team: {
    ff_collab_seat_limit_enforced: true,
    ff_collab_audit_log: true,
    ff_ai_batch_high_volume: true,
    ff_ai_priority_inference: true,
    ff_ai_reprocess_unlimited: true,
    ff_export_pdf: true,
    ff_export_json_full: true,
    ff_budget_advanced_insights: true,
    ff_public_api_access: true,
    ff_webhooks_enabled: true,
  },
};

const PLAN_SEAT_LIMITS: Record<PlanTier, number> = {
  free: 2,
  pro: 6,
  team: 20,
};

export function normalizePlanTier(value: string | null | undefined): PlanTier {
  if (value === 'pro' || value === 'team') return value;
  return 'free';
}

export function buildEntitlements(planTier: PlanTier, runtimeOverrides?: Partial<FeatureEntitlements>): FeatureEntitlements {
  return {
    ...BASE_FLAGS,
    ...(PLAN_OVERRIDES[planTier] ?? {}),
    ...(runtimeOverrides ?? {}),
  };
}

export function readStoredPlanTier(storageKey: string): PlanTier {
  if (typeof window === 'undefined') return 'free';
  const raw = window.localStorage.getItem(storageKey);
  return normalizePlanTier(raw);
}

export function readStoredOverrides(storageKey: string): Partial<FeatureEntitlements> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<FeatureEntitlements>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isFeatureEnabled(
  featureKey: FeatureKey,
  planTier: PlanTier,
  runtimeOverrides?: Partial<FeatureEntitlements>,
): boolean {
  const entitlements = buildEntitlements(planTier, runtimeOverrides);
  return !!entitlements[featureKey];
}

export function resolveSeatLimit(planTier: PlanTier, entitlements?: Partial<FeatureEntitlements>): SeatLimit {
  const effective = buildEntitlements(planTier, entitlements);
  if (!effective.ff_collab_seat_limit_enforced) {
    return {
      hardLimit: Number.POSITIVE_INFINITY,
      planTier,
    };
  }
  return {
    hardLimit: PLAN_SEAT_LIMITS[planTier],
    planTier,
  };
}
