import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import {
  isFeatureKey,
  loadFeatureGateContext,
  type PlanTier,
  setUserFeatureOverride,
  setUserPlanTier,
  type FeatureGateContext,
} from '../_shared/feature-gates.ts';

type EntitlementsAction = 'get_context' | 'set_plan_tier' | 'set_override' | 'usage_summary';

type RequestBody = {
  action?: unknown;
  planTier?: unknown;
  featureKey?: unknown;
  enabled?: unknown;
  limitValue?: unknown;
  days?: unknown;
};

function normalizeAction(value: unknown): EntitlementsAction {
  if (value === 'set_plan_tier') return 'set_plan_tier';
  if (value === 'set_override') return 'set_override';
  if (value === 'usage_summary') return 'usage_summary';
  return 'get_context';
}

function normalizePlanTier(value: unknown): PlanTier | null {
  if (value === 'free' || value === 'pro' || value === 'team') return value;
  return null;
}

function normalizeOptionalBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function normalizeOptionalLimit(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function normalizeUsageDays(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 7;
  const rounded = Math.round(value);
  return Math.max(1, Math.min(90, rounded));
}

function serializeContext(context: FeatureGateContext) {
  return {
    planTier: context.planTier,
    entitlements: context.entitlements,
    seatLimit: context.seatLimit,
    limits: context.limits,
    source: context.source,
    selfServiceEnabled: context.selfServiceEnabled,
    userId: context.userId,
    rolloutCohort: context.rolloutCohort,
    rolloutPercent: context.rolloutPercent,
    rolloutFeatures: context.rolloutFeatures,
  };
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para acessar seus recursos.', 401);
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const action = normalizeAction(body.action);

    if (action === 'set_plan_tier') {
      const initialContext = await loadFeatureGateContext(auth.userId);
      if (!initialContext.selfServiceEnabled) {
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Atualização de plano indisponível neste ambiente.',
          403,
        );
      }

      const planTier = normalizePlanTier(body.planTier);
      if (!planTier) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Plano inválido.', 400);
      }

      await setUserPlanTier(auth.userId, planTier);
    }

    if (action === 'set_override') {
      const initialContext = await loadFeatureGateContext(auth.userId);
      if (!initialContext.selfServiceEnabled) {
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Atualização de override indisponível neste ambiente.',
          403,
        );
      }

      const featureKey = typeof body.featureKey === 'string' ? body.featureKey : null;
      if (!featureKey || !isFeatureKey(featureKey)) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Feature flag inválida.', 400);
      }

      await setUserFeatureOverride(
        auth.userId,
        featureKey,
        {
          enabled: normalizeOptionalBool(body.enabled),
          limitValue: normalizeOptionalLimit(body.limitValue),
        },
      );
    }

    const context = await loadFeatureGateContext(auth.userId);

    if (action === 'usage_summary') {
      const days = normalizeUsageDays(body.days);
      const serviceClient = createServiceClient();
      if (!serviceClient) {
        return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase incompleta para métricas.', 500);
      }

      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: usageRows, error: usageError } = await serviceClient
        .from('feature_usage_events')
        .select('feature_key,cluster_key,created_at')
        .eq('user_id', auth.userId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false });

      if (usageError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível carregar métricas de uso.', 500);
      }

      const byFeature = new Map<string, { featureKey: string; clusterKey: string; count: number; lastEventAt: string }>();
      const byCluster = new Map<string, { clusterKey: string; count: number; lastEventAt: string }>();

      for (const row of usageRows ?? []) {
        const featureKey = row.feature_key as string;
        const clusterKey = row.cluster_key as string;
        const createdAt = row.created_at as string;

        const featureCurrent = byFeature.get(featureKey);
        if (!featureCurrent) {
          byFeature.set(featureKey, { featureKey, clusterKey, count: 1, lastEventAt: createdAt });
        } else {
          featureCurrent.count += 1;
          if (createdAt > featureCurrent.lastEventAt) featureCurrent.lastEventAt = createdAt;
        }

        const clusterCurrent = byCluster.get(clusterKey);
        if (!clusterCurrent) {
          byCluster.set(clusterKey, { clusterKey, count: 1, lastEventAt: createdAt });
        } else {
          clusterCurrent.count += 1;
          if (createdAt > clusterCurrent.lastEventAt) clusterCurrent.lastEventAt = createdAt;
        }
      }

      const totalEvents = (usageRows ?? []).length;

      return successResponse({
        ...serializeContext(context),
        usageSummary: {
          windowDays: days,
          totalEvents,
          byFeature: Array.from(byFeature.values()).sort((a, b) => b.count - a.count),
          byCluster: Array.from(byCluster.values()).sort((a, b) => b.count - a.count),
          activeFeatures: Array.from(byFeature.keys()),
          generatedAt: new Date().toISOString(),
        },
      });
    }

    return successResponse(serializeContext(context));
  } catch (error) {
    console.error('[feature-entitlements]', requestId, 'unexpected_error', error);
    return errorResponse(
      requestId,
      'INTERNAL_ERROR',
      'Não foi possível carregar recursos deste usuário.',
      500,
    );
  }
});
