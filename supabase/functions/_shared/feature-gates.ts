import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

export type FeatureGateContext = {
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

type EntitlementRow = {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

type OverrideRow = {
  feature_key: string;
  enabled: boolean | null;
  limit_value: number | null;
};

export const FEATURE_KEYS: FeatureKey[] = [
  'ff_collab_enabled',
  'ff_collab_seat_limit_enforced',
  'ff_collab_editor_role',
  'ff_collab_audit_log',
  'ff_ai_import_enabled',
  'ff_ai_batch_high_volume',
  'ff_ai_priority_inference',
  'ff_ai_reprocess_unlimited',
  'ff_export_pdf',
  'ff_export_json_full',
  'ff_budget_advanced_insights',
  'ff_public_api_access',
  'ff_webhooks_enabled',
];

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

const FEATURE_CLUSTER: Record<FeatureKey, 'M1' | 'M2' | 'M3' | 'M4'> = {
  ff_collab_enabled: 'M1',
  ff_collab_seat_limit_enforced: 'M1',
  ff_collab_editor_role: 'M1',
  ff_collab_audit_log: 'M1',
  ff_ai_import_enabled: 'M2',
  ff_ai_batch_high_volume: 'M2',
  ff_ai_priority_inference: 'M2',
  ff_ai_reprocess_unlimited: 'M2',
  ff_export_pdf: 'M3',
  ff_export_json_full: 'M3',
  ff_budget_advanced_insights: 'M3',
  ff_public_api_access: 'M4',
  ff_webhooks_enabled: 'M4',
};

let cachedServiceClient: SupabaseClient | null = null;

function normalizePlanTier(value: unknown): PlanTier {
  if (value === 'pro' || value === 'team') return value;
  return 'free';
}

function ensureFeatureKey(value: string): FeatureKey | null {
  return FEATURE_KEYS.includes(value as FeatureKey) ? (value as FeatureKey) : null;
}

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEYS.includes(value as FeatureKey);
}

function buildEntitlements(planTier: PlanTier): FeatureEntitlements {
  return {
    ...BASE_FLAGS,
    ...(PLAN_OVERRIDES[planTier] ?? {}),
  };
}

function resolveSelfServiceEnabled() {
  return Deno.env.get('ENTITLEMENTS_SELF_SERVICE') === 'true';
}

function resolveRolloutPercent() {
  const raw = Deno.env.get('ENTITLEMENTS_ROLLOUT_PERCENT') ?? Deno.env.get('ENTITLEMENTS_PILOT_PERCENT');
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function resolveRolloutFeatures(): FeatureKey[] {
  const raw = Deno.env.get('ENTITLEMENTS_ROLLOUT_FEATURES') ?? Deno.env.get('ENTITLEMENTS_PILOT_FEATURES');
  if (!raw) return [];

  const features = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ensureFeatureKey(item))
    .filter((item): item is FeatureKey => !!item);

  return Array.from(new Set(features));
}

function hashUserBucket(userId: string) {
  // FNV-1a variant for deterministic rollout bucketing
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0) % 100;
}

function applyRolloutEntitlements(
  userId: string,
  entitlements: FeatureEntitlements,
) {
  const rolloutPercent = resolveRolloutPercent();
  const rolloutFeatures = resolveRolloutFeatures();
  if (rolloutPercent <= 0 || rolloutFeatures.length === 0) {
    return {
      entitlements,
      rolloutCohort: false,
      rolloutPercent: 0,
      rolloutFeatures: [] as FeatureKey[],
    };
  }

  const rolloutCohort = hashUserBucket(userId) < rolloutPercent;
  if (!rolloutCohort) {
    return {
      entitlements,
      rolloutCohort,
      rolloutPercent,
      rolloutFeatures,
    };
  }

  const patchedEntitlements = { ...entitlements };
  for (const feature of rolloutFeatures) {
    patchedEntitlements[feature] = true;
  }

  return {
    entitlements: patchedEntitlements,
    rolloutCohort,
    rolloutPercent,
    rolloutFeatures,
  };
}

function getServiceClient(optionalClient?: SupabaseClient) {
  if (optionalClient) return optionalClient;
  if (cachedServiceClient) return cachedServiceClient;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  cachedServiceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedServiceClient;
}

export function isFeatureEnabled(context: FeatureGateContext, featureKey: FeatureKey) {
  return !!context.entitlements[featureKey];
}

export function resolveAiRateLimit(baseLimit: number, context: FeatureGateContext) {
  return context.entitlements.ff_ai_batch_high_volume ? Math.max(baseLimit, baseLimit * 3) : baseLimit;
}

export function resolveAiTimeout(baseTimeoutMs: number, context: FeatureGateContext) {
  return context.entitlements.ff_ai_priority_inference ? Math.round(baseTimeoutMs * 1.4) : baseTimeoutMs;
}

export async function loadFeatureGateContext(userId: string, serviceClient?: SupabaseClient): Promise<FeatureGateContext> {
  const selfServiceEnabled = resolveSelfServiceEnabled();
  const client = getServiceClient(serviceClient);

  let planTier: PlanTier = 'free';
  let entitlements = buildEntitlements(planTier);
  const limits: Partial<Record<FeatureKey, number>> = {};
  let rolloutCohort = false;
  let rolloutPercent = 0;
  let rolloutFeatures: FeatureKey[] = [];

  if (!client) {
    const rolloutContext = applyRolloutEntitlements(userId, entitlements);
    entitlements = rolloutContext.entitlements;
    rolloutCohort = rolloutContext.rolloutCohort;
    rolloutPercent = rolloutContext.rolloutPercent;
    rolloutFeatures = rolloutContext.rolloutFeatures;

    return {
      userId,
      planTier,
      entitlements,
      seatLimit: Number.POSITIVE_INFINITY,
      limits,
      source: 'fallback',
      selfServiceEnabled,
      rolloutCohort,
      rolloutPercent,
      rolloutFeatures,
    };
  }

  try {
    const { data: planRow, error: planError } = await client
      .from('user_plan_tiers')
      .select('plan_tier')
      .eq('user_id', userId)
      .maybeSingle();

    if (!planError && planRow?.plan_tier) {
      planTier = normalizePlanTier(planRow.plan_tier);
      entitlements = buildEntitlements(planTier);
    }

    const { data: entitlementRows, error: entitlementError } = await client
      .from('feature_entitlements')
      .select('feature_key,enabled,limit_value')
      .eq('plan_tier', planTier);

    if (!entitlementError && Array.isArray(entitlementRows)) {
      for (const row of entitlementRows as EntitlementRow[]) {
        const key = ensureFeatureKey(row.feature_key);
        if (!key) continue;
        entitlements[key] = !!row.enabled;
        if (typeof row.limit_value === 'number') limits[key] = row.limit_value;
      }
    }

    const { data: overrideRows, error: overrideError } = await client
      .from('user_feature_overrides')
      .select('feature_key,enabled,limit_value')
      .eq('user_id', userId);

    if (!overrideError && Array.isArray(overrideRows)) {
      for (const row of overrideRows as OverrideRow[]) {
        const key = ensureFeatureKey(row.feature_key);
        if (!key) continue;
        if (typeof row.enabled === 'boolean') {
          entitlements[key] = row.enabled;
        }
        if (typeof row.limit_value === 'number') {
          limits[key] = row.limit_value;
        }
      }
    }

    const rolloutContext = applyRolloutEntitlements(userId, entitlements);
    entitlements = rolloutContext.entitlements;
    rolloutCohort = rolloutContext.rolloutCohort;
    rolloutPercent = rolloutContext.rolloutPercent;
    rolloutFeatures = rolloutContext.rolloutFeatures;

    const seatLimit = entitlements.ff_collab_seat_limit_enforced
      ? limits.ff_collab_seat_limit_enforced ?? PLAN_SEAT_LIMITS[planTier]
      : Number.POSITIVE_INFINITY;

    return {
      userId,
      planTier,
      entitlements,
      seatLimit,
      limits,
      source: 'database',
      selfServiceEnabled,
      rolloutCohort,
      rolloutPercent,
      rolloutFeatures,
    };
  } catch (error) {
    console.warn('[feature-gates] fallback_context', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    const rolloutContext = applyRolloutEntitlements(userId, entitlements);
    entitlements = rolloutContext.entitlements;
    rolloutCohort = rolloutContext.rolloutCohort;
    rolloutPercent = rolloutContext.rolloutPercent;
    rolloutFeatures = rolloutContext.rolloutFeatures;

    return {
      userId,
      planTier,
      entitlements,
      seatLimit: Number.POSITIVE_INFINITY,
      limits,
      source: 'fallback',
      selfServiceEnabled,
      rolloutCohort,
      rolloutPercent,
      rolloutFeatures,
    };
  }
}

export async function trackFeatureUsage(
  params: {
    userId: string;
    featureKey: FeatureKey;
    viagemId?: string | null;
    metadata?: Record<string, unknown>;
  },
  serviceClient?: SupabaseClient,
) {
  const client = getServiceClient(serviceClient);
  if (!client) return;

  try {
    await client.from('feature_usage_events').insert({
      user_id: params.userId,
      feature_key: params.featureKey,
      cluster_key: FEATURE_CLUSTER[params.featureKey],
      viagem_id: params.viagemId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.warn('[feature-gates] usage_log_failed', {
      userId: params.userId,
      featureKey: params.featureKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function setUserPlanTier(
  userId: string,
  planTier: PlanTier,
  source = 'self_service',
  serviceClient?: SupabaseClient,
) {
  const client = getServiceClient(serviceClient);
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada para atualizar plano.');
  }

  const { data: previousPlanRow, error: previousPlanError } = await client
    .from('user_plan_tiers')
    .select('plan_tier')
    .eq('user_id', userId)
    .maybeSingle();

  if (previousPlanError) {
    throw new Error('Não foi possível carregar o plano atual do usuário.');
  }

  const previousTier = normalizePlanTier(previousPlanRow?.plan_tier ?? 'free');
  const nowIso = new Date().toISOString();
  const { error } = await client
    .from('user_plan_tiers')
    .upsert(
      {
        user_id: userId,
        plan_tier: planTier,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error('Não foi possível atualizar o plano do usuário.');
  }

  if (previousTier !== planTier) {
    const { error: eventError } = await client
      .from('user_plan_tier_events')
      .insert({
        user_id: userId,
        previous_tier: previousTier,
        new_tier: planTier,
        source,
        metadata: { source },
      });

    if (eventError) {
      console.warn('[feature-gates] plan_tier_event_failed', {
        userId,
        previousTier,
        planTier,
        error: eventError.message,
      });
    }
  }
}

export async function setUserFeatureOverride(
  userId: string,
  featureKey: FeatureKey,
  payload: {
    enabled?: boolean | null;
    limitValue?: number | null;
  },
  serviceClient?: SupabaseClient,
) {
  const client = getServiceClient(serviceClient);
  if (!client) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada para atualizar overrides.');
  }

  const shouldDelete = typeof payload.enabled !== 'boolean' && payload.limitValue == null;
  if (shouldDelete) {
    const { error: deleteError } = await client
      .from('user_feature_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('feature_key', featureKey);

    if (deleteError) {
      throw new Error('Não foi possível remover o override de feature.');
    }
    return;
  }

  const nowIso = new Date().toISOString();
  const { error } = await client
    .from('user_feature_overrides')
    .upsert(
      {
        user_id: userId,
        feature_key: featureKey,
        enabled: typeof payload.enabled === 'boolean' ? payload.enabled : null,
        limit_value:
          typeof payload.limitValue === 'number' && Number.isFinite(payload.limitValue)
            ? Math.round(payload.limitValue)
            : null,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,feature_key' },
    );

  if (error) {
    throw new Error('Não foi possível atualizar o override de feature.');
  }
}
