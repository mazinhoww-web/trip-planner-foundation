import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import { isFeatureEnabled, loadFeatureGateContext, trackFeatureUsage } from '../_shared/feature-gates.ts';

type RequestBody = {
  eventType?: unknown;
  viagemId?: unknown;
  payload?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para continuar.', 401);
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';
    const viagemId = typeof body.viagemId === 'string' ? body.viagemId.trim() : '';

    if (!eventType || !viagemId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'eventType e viagemId são obrigatórios.', 400);
    }

    const context = await loadFeatureGateContext(auth.userId);
    if (!isFeatureEnabled(context, 'ff_webhooks_enabled')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: { operation: 'trip-webhook-dispatch', status: 'blocked', eventType, requestId },
      });
      return errorResponse(requestId, 'UNAUTHORIZED', 'Webhooks disponíveis no plano Team.', 403);
    }

    const targetUrl = Deno.env.get('WEBHOOK_TARGET_URL');
    if (!targetUrl) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: { operation: 'trip-webhook-dispatch', status: 'skipped', reason: 'missing_target_url', eventType, requestId },
      });

      return successResponse({
        delivered: false,
        reason: 'WEBHOOK_TARGET_URL não configurada',
      });
    }

    const payload = isRecord(body.payload) ? body.payload : {};
    const outbound = {
      requestId,
      eventType,
      viagemId,
      userId: auth.userId,
      sentAt: new Date().toISOString(),
      payload,
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outbound),
    });

    if (!response.ok) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: {
          operation: 'trip-webhook-dispatch',
          status: 'failed',
          eventType,
          requestId,
          statusCode: response.status,
        },
      });

      return errorResponse(requestId, 'UPSTREAM_ERROR', 'Webhook recusado pelo endpoint configurado.', 502);
    }

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: 'ff_webhooks_enabled',
      viagemId,
      metadata: {
        operation: 'trip-webhook-dispatch',
        status: 'success',
        eventType,
        requestId,
      },
    });

    return successResponse({ delivered: true });
  } catch (error) {
    console.error('[trip-webhook-dispatch]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível enviar webhook.', 500);
  }
});
