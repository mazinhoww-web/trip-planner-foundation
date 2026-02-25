import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import {
  isFeatureKey,
  loadFeatureGateContext,
  trackFeatureUsage,
  type PlanTier,
  setUserFeatureOverride,
  setUserPlanTier,
  type FeatureGateContext,
} from '../_shared/feature-gates.ts';

type EntitlementsAction = 'get_context' | 'set_plan_tier' | 'set_override' | 'usage_summary' | 'track_event';

type RequestBody = {
  action?: unknown;
  planTier?: unknown;
  featureKey?: unknown;
  enabled?: unknown;
  limitValue?: unknown;
  days?: unknown;
  eventName?: unknown;
  viagemId?: unknown;
  metadata?: unknown;
  status?: unknown;
};

function normalizeAction(value: unknown): EntitlementsAction {
  if (value === 'set_plan_tier') return 'set_plan_tier';
  if (value === 'set_override') return 'set_override';
  if (value === 'usage_summary') return 'usage_summary';
  if (value === 'track_event') return 'track_event';
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

const AI_OPERATIONS = new Set([
  'extract-reservation',
  'ocr-document',
  'generate-tips',
  'suggest-restaurants',
]);

const EVENT_TO_FEATURE: Record<string, string> = {
  import_started: 'ff_ai_import_enabled',
  import_confirmed: 'ff_ai_import_enabled',
  invite_sent: 'ff_collab_enabled',
  member_role_changed: 'ff_collab_editor_role',
  export_triggered: 'ff_export_json_full',
};

function normalizeTierOrder(tier: PlanTier) {
  if (tier === 'team') return 3;
  if (tier === 'pro') return 2;
  return 1;
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

    if (action === 'track_event') {
      const eventName = typeof body.eventName === 'string' ? body.eventName.trim() : '';
      if (!eventName) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Evento inválido.', 400);
      }

      const rawFeatureKey = typeof body.featureKey === 'string' && body.featureKey.trim()
        ? body.featureKey.trim()
        : EVENT_TO_FEATURE[eventName] ?? null;

      const featureKey = rawFeatureKey && isFeatureKey(rawFeatureKey)
        ? rawFeatureKey
        : 'ff_collab_enabled';

      const status = typeof body.status === 'string' && body.status.trim()
        ? body.status.trim()
        : context.entitlements[featureKey]
          ? 'success'
          : 'blocked';

      const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

      await trackFeatureUsage({
        userId: auth.userId,
        featureKey,
        viagemId: typeof body.viagemId === 'string' && body.viagemId ? body.viagemId : null,
        metadata: {
          operation: eventName,
          status,
          source: 'client',
          ...metadata,
        },
      }, createServiceClient() ?? undefined);

      return successResponse({
        ok: true,
        eventName,
        featureKey,
        status,
      });
    }

    if (action === 'usage_summary') {
      const days = normalizeUsageDays(body.days);
      const serviceClient = createServiceClient();
      if (!serviceClient) {
        return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase incompleta para métricas.', 500);
      }

      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: usageRows, error: usageError } = await serviceClient
        .from('feature_usage_events')
        .select('feature_key,cluster_key,created_at,metadata')
        .eq('user_id', auth.userId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false });

      if (usageError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível carregar métricas de uso.', 500);
      }

      const byFeature = new Map<string, { featureKey: string; clusterKey: string; count: number; lastEventAt: string }>();
      const byCluster = new Map<string, { clusterKey: string; count: number; lastEventAt: string }>();
      let aiRequestCount = 0;
      let aiSuccessCount = 0;
      let aiFailedCount = 0;
      let aiBlockedCount = 0;

      for (const row of usageRows ?? []) {
        const featureKey = row.feature_key as string;
        const clusterKey = row.cluster_key as string;
        const createdAt = row.created_at as string;
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const operation = typeof metadata.operation === 'string' ? metadata.operation : null;
        const status = typeof metadata.status === 'string' ? metadata.status : 'success';

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

        if (operation && AI_OPERATIONS.has(operation)) {
          aiRequestCount += 1;
          if (status === 'failed') {
            aiFailedCount += 1;
          } else if (status === 'blocked') {
            aiBlockedCount += 1;
          } else {
            aiSuccessCount += 1;
          }
        }
      }

      const totalEvents = (usageRows ?? []).length;
      const aiSuccessRate = aiSuccessCount + aiFailedCount > 0
        ? Number((aiSuccessCount / (aiSuccessCount + aiFailedCount)).toFixed(4))
        : null;

      const { data: tierEventsRaw, error: tierEventsError } = await serviceClient
        .from('user_plan_tier_events')
        .select('previous_tier,new_tier,source,created_at')
        .eq('user_id', auth.userId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false });

      let tierEvents = tierEventsRaw ?? [];
      if (tierEventsError) {
        if ((tierEventsError as { code?: string }).code === '42P01') {
          console.warn('[feature-entitlements]', requestId, 'plan_events_table_missing');
          tierEvents = [];
        } else {
          return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível carregar histórico de plano.', 500);
        }
      }

      let upgradeCount = 0;
      let downgradeCount = 0;
      for (const event of tierEvents) {
        const previous = event.previous_tier as PlanTier;
        const next = event.new_tier as PlanTier;
        const previousOrder = normalizeTierOrder(previous);
        const nextOrder = normalizeTierOrder(next);
        if (nextOrder > previousOrder) upgradeCount += 1;
        if (nextOrder < previousOrder) downgradeCount += 1;
      }

      return successResponse({
        ...serializeContext(context),
        usageSummary: {
          windowDays: days,
          totalEvents,
          byFeature: Array.from(byFeature.values()).sort((a, b) => b.count - a.count),
          byCluster: Array.from(byCluster.values()).sort((a, b) => b.count - a.count),
          activeFeatures: Array.from(byFeature.keys()),
          aiMetrics: {
            requestCount: aiRequestCount,
            successCount: aiSuccessCount,
            failedCount: aiFailedCount,
            blockedCount: aiBlockedCount,
            successRate: aiSuccessRate,
          },
          conversionMetrics: {
            upgradeCount,
            downgradeCount,
            events: tierEvents.length,
            lastPlanChangeAt: tierEvents[0]?.created_at ?? null,
          },
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
