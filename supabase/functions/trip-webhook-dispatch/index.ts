import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import {
  getFeatureUsageCountInWindow,
  isFeatureEnabled,
  loadFeatureGateContext,
  resolveFeatureLimit,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

type RequestBody = {
  eventType?: unknown;
  viagemId?: unknown;
  payload?: unknown;
};

const MAX_WEBHOOK_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function shouldRetryStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status);
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signPayload(payloadRaw: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadRaw));
  return `sha256=${toHex(signature)}`;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para continuar.', 401);
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const eventType = typeof body.eventType === 'string' ? body.eventType.trim() : '';
    const viagemId = typeof body.viagemId === 'string' ? body.viagemId.trim() : '';

    if (!eventType || !viagemId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'eventType e viagemId são obrigatórios.', 400);
    }

    const serviceClient = createServiceClient();
    const context = await loadFeatureGateContext(auth.userId, serviceClient ?? undefined);
    if (!isFeatureEnabled(context, 'ff_webhooks_enabled')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: { operation: 'trip-webhook-dispatch', status: 'blocked', eventType, requestId },
      }, serviceClient ?? undefined);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Webhooks disponíveis no plano Team.', 403);
    }

    const webhookLimit = resolveFeatureLimit(context, 'ff_webhooks_enabled', 120);
    const usageCount = await getFeatureUsageCountInWindow({
      userId: auth.userId,
      featureKey: 'ff_webhooks_enabled',
      windowMinutes: 24 * 60,
    }, serviceClient ?? undefined);

    if (usageCount != null && usageCount >= webhookLimit) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: {
          operation: 'trip-webhook-dispatch',
          status: 'blocked',
          reason: 'rate_limit',
          eventType,
          requestId,
          usageCount,
          limit: webhookLimit,
        },
      }, serviceClient ?? undefined);
      return errorResponse(requestId, 'RATE_LIMITED', 'Limite diário de webhooks atingido para o seu plano.', 429);
    }

    const targetUrl = Deno.env.get('WEBHOOK_TARGET_URL');
    if (!targetUrl) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: { operation: 'trip-webhook-dispatch', status: 'skipped', reason: 'missing_target_url', eventType, requestId },
      }, serviceClient ?? undefined);

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

    const serializedBody = JSON.stringify(outbound);
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    const signatureHeader = webhookSecret ? await signPayload(serializedBody, webhookSecret) : null;

    let lastStatus: number | null = null;
    let delivered = false;
    let lastError: string | null = null;
    let attempts = 0;

    for (let attempt = 1; attempt <= MAX_WEBHOOK_ATTEMPTS; attempt += 1) {
      attempts = attempt;
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(signatureHeader ? { 'X-Tripplanner-Signature': signatureHeader } : {}),
            'X-Tripplanner-Request-Id': requestId,
            'X-Tripplanner-Attempt': String(attempt),
          },
          body: serializedBody,
        });

        lastStatus = response.status;
        if (response.ok) {
          delivered = true;
          break;
        }

        if (!shouldRetryStatus(response.status) || attempt === MAX_WEBHOOK_ATTEMPTS) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'network_error';
        if (attempt === MAX_WEBHOOK_ATTEMPTS) {
          break;
        }
      }

      await wait(attempt * 300);
    }

    if (!delivered) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_webhooks_enabled',
        viagemId,
        metadata: {
          operation: 'trip-webhook-dispatch',
          status: 'failed',
          eventType,
          requestId,
          statusCode: lastStatus,
          attempts,
          error: lastError,
        },
      }, serviceClient ?? undefined);

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
        attempts,
      },
    }, serviceClient ?? undefined);

    return successResponse({
      delivered: true,
      attempts,
      signed: !!signatureHeader,
    });
  } catch (error) {
    console.error('[trip-webhook-dispatch]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível enviar webhook.', 500);
  }
});
