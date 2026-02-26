import { createClient } from 'npm:@supabase/supabase-js@2';
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

type RequestBody = {
  action?: unknown;
  viagemId?: unknown;
  shareToken?: unknown;
  shareId?: unknown;
  expiresInHours?: unknown;
};

function normalizeAction(value: unknown) {
  if (value === 'trip_snapshot') return 'trip_snapshot';
  if (value === 'create_share_link') return 'create_share_link';
  if (value === 'list_share_links') return 'list_share_links';
  if (value === 'revoke_share_link') return 'revoke_share_link';
  if (value === 'share_snapshot') return 'share_snapshot';
  return 'trip_snapshot';
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

function createAuthedClient(authorization: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function fetchTripRows(client: ReturnType<typeof createAuthedClient>, table: string, viagemId: string) {
  if (!client) return [] as Array<Record<string, unknown>>;
  const { data, error } = await client.from(table).select('*').eq('viagem_id', viagemId);
  if (error) {
    throw new Error(`Falha ao carregar ${table}`);
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

function encodeBase64Url(bytes: Uint8Array) {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64Url(bytes);
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
}

function sanitizePublicRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => {
    const sanitized = { ...row };
    delete sanitized.user_id;
    return sanitized;
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const action = normalizeAction(body.action);
    const serviceClient = createServiceClient();
    if (!serviceClient) {
      return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase ausente.', 500);
    }

    if (action === 'share_snapshot') {
      const shareToken = typeof body.shareToken === 'string' && body.shareToken.trim() ? body.shareToken.trim() : null;
      if (!shareToken) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Informe shareToken.', 400);
      }

      const tokenHash = await sha256(shareToken);
      const nowIso = new Date().toISOString();
      const { data: shareRecord, error: shareError } = await serviceClient
        .from('viagem_compartilhamentos_publicos')
        .select('id, viagem_id, ativo, expira_em')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (shareError || !shareRecord) {
        return errorResponse(requestId, 'NOT_FOUND', 'Link público não encontrado.', 404);
      }

      if (!shareRecord.ativo || shareRecord.expira_em < nowIso) {
        return errorResponse(requestId, 'FORBIDDEN', 'Este link público expirou ou foi revogado.', 403);
      }

      const viagemId = shareRecord.viagem_id;
      const { data: trip, error: tripError } = await serviceClient
        .from('viagens')
        .select('id, nome, destino, data_inicio, data_fim, status')
        .eq('id', viagemId)
        .maybeSingle();

      if (tripError || !trip) {
        return errorResponse(requestId, 'NOT_FOUND', 'Viagem compartilhada não encontrada.', 404);
      }

      const [voos, hospedagens, transportes, roteiro, restaurantes] = await Promise.all([
        fetchTripRows(serviceClient as any, 'voos', viagemId),
        fetchTripRows(serviceClient as any, 'hospedagens', viagemId),
        fetchTripRows(serviceClient as any, 'transportes', viagemId),
        fetchTripRows(serviceClient as any, 'roteiro_dias', viagemId),
        fetchTripRows(serviceClient as any, 'restaurantes', viagemId),
      ]);

      return successResponse({
        exportedAt: new Date().toISOString(),
        trip,
        totals: {
          voos: voos.length,
          hospedagens: hospedagens.length,
          transportes: transportes.length,
          roteiro: roteiro.length,
          restaurantes: restaurantes.length,
        },
        modules: {
          voos: sanitizePublicRows(voos),
          hospedagens: sanitizePublicRows(hospedagens),
          transportes: sanitizePublicRows(transportes),
          roteiro: sanitizePublicRows(roteiro),
          restaurantes: sanitizePublicRows(restaurantes),
        },
      });
    }

    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para usar a API pública.', 401);
    }

    const viagemId = typeof body.viagemId === 'string' && body.viagemId.trim() ? body.viagemId.trim() : null;
    if (!viagemId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Informe viagemId.', 400);
    }

    const context = await loadFeatureGateContext(auth.userId, serviceClient);

    if (!isFeatureEnabled(context, 'ff_public_api_access')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_public_api_access',
        viagemId,
        metadata: { operation: 'public-trip-api', status: 'blocked', requestId },
      }, serviceClient);

      return errorResponse(requestId, 'UNAUTHORIZED', 'API pública disponível no plano Team.', 403);
    }

    const apiLimit = resolveFeatureLimit(context, 'ff_public_api_access', 30);
    const usageCount = await getFeatureUsageCountInWindow({
      userId: auth.userId,
      featureKey: 'ff_public_api_access',
      windowMinutes: 24 * 60,
    }, serviceClient);

    if (usageCount != null && usageCount >= apiLimit) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_public_api_access',
        viagemId,
        metadata: {
          operation: 'public-trip-api',
          status: 'blocked',
          reason: 'rate_limit',
          requestId,
          usageCount,
          limit: apiLimit,
        },
      }, serviceClient);

      return errorResponse(
        requestId,
        'RATE_LIMITED',
        'Limite diário da API pública atingido para o seu plano.',
        429,
      );
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Sessão ausente.', 401);
    }

    const authedClient = createAuthedClient(authorization);
    if (!authedClient) {
      return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase ausente.', 500);
    }

    if (action === 'create_share_link') {
      const { data: roleData, error: roleError } = await authedClient.rpc('trip_role', { _viagem_id: viagemId });
      const role = typeof roleData === 'string' ? roleData : null;
      if (roleError || !role || role === 'viewer') {
        return errorResponse(requestId, 'FORBIDDEN', 'Somente owner/editor podem criar compartilhamento público.', 403);
      }

      const expiresInHoursRaw = Number(body.expiresInHours ?? 72);
      const expiresInHours = Number.isFinite(expiresInHoursRaw)
        ? Math.min(168, Math.max(1, Math.floor(expiresInHoursRaw)))
        : 72;
      const expiration = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
      const shareToken = createShareToken();
      const tokenHash = await sha256(shareToken);
      const tokenHint = shareToken.slice(0, 8).toUpperCase();

      const { data: shareRow, error: shareError } = await serviceClient
        .from('viagem_compartilhamentos_publicos')
        .insert({
          viagem_id: viagemId,
          criado_por: auth.userId,
          token_hash: tokenHash,
          token_hint: tokenHint,
          expira_em: expiration,
          ativo: true,
        })
        .select('id, expira_em, token_hint, ativo')
        .single();

      if (shareError || !shareRow) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível criar o link público.', 500);
      }

      const appOrigin = Deno.env.get('APP_ORIGIN')?.trim();
      const baseUrl = appOrigin && appOrigin.length > 0 ? appOrigin.replace(/\/+$/, '') : 'http://localhost:5173';
      const shareUrl = `${baseUrl}/share/${shareToken}`;

      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_public_api_access',
        viagemId,
        metadata: { operation: 'create_share_link', status: 'success', requestId },
      }, serviceClient);

      return successResponse({
        share: {
          id: shareRow.id,
          expiresAt: shareRow.expira_em,
          tokenHint: shareRow.token_hint,
          active: shareRow.ativo,
          url: shareUrl,
        },
      });
    }

    if (action === 'list_share_links') {
      const { data: shares, error: sharesError } = await serviceClient
        .from('viagem_compartilhamentos_publicos')
        .select('id, token_hint, ativo, expira_em, created_at')
        .eq('viagem_id', viagemId)
        .eq('criado_por', auth.userId)
        .order('created_at', { ascending: false })
        .limit(25);

      if (sharesError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível carregar os links públicos.', 500);
      }

      return successResponse({ shares: shares ?? [] });
    }

    if (action === 'revoke_share_link') {
      const shareId = typeof body.shareId === 'string' && body.shareId.trim() ? body.shareId.trim() : null;
      if (!shareId) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Informe shareId.', 400);
      }

      const { error: revokeError } = await serviceClient
        .from('viagem_compartilhamentos_publicos')
        .update({ ativo: false })
        .eq('id', shareId)
        .eq('viagem_id', viagemId)
        .eq('criado_por', auth.userId);

      if (revokeError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível revogar o link público.', 500);
      }

      return successResponse({ ok: true });
    }

    if (action === 'trip_snapshot') {
      const { data: trip, error: tripError } = await authedClient
        .from('viagens')
        .select('*')
        .eq('id', viagemId)
        .maybeSingle();

      if (tripError || !trip) {
        return errorResponse(requestId, 'UNAUTHORIZED', 'Viagem não encontrada ou sem permissão.', 403);
      }

      const [
        voos,
        hospedagens,
        transportes,
        despesas,
        tarefas,
        restaurantes,
        documentos,
        bagagem,
        viajantes,
        preparativos,
        roteiro,
      ] = await Promise.all([
        fetchTripRows(authedClient, 'voos', viagemId),
        fetchTripRows(authedClient, 'hospedagens', viagemId),
        fetchTripRows(authedClient, 'transportes', viagemId),
        fetchTripRows(authedClient, 'despesas', viagemId),
        fetchTripRows(authedClient, 'tarefas', viagemId),
        fetchTripRows(authedClient, 'restaurantes', viagemId),
        fetchTripRows(authedClient, 'documentos', viagemId),
        fetchTripRows(authedClient, 'bagagem', viagemId),
        fetchTripRows(authedClient, 'viajantes', viagemId),
        fetchTripRows(authedClient, 'preparativos', viagemId),
        fetchTripRows(authedClient, 'roteiro_dias', viagemId),
      ]);

      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_public_api_access',
        viagemId,
        metadata: { operation: 'public-trip-api', status: 'success', requestId },
      }, serviceClient);

      return successResponse({
        exportedAt: new Date().toISOString(),
        trip,
        totals: {
          voos: voos.length,
          hospedagens: hospedagens.length,
          transportes: transportes.length,
          despesas: despesas.length,
          tarefas: tarefas.length,
          restaurantes: restaurantes.length,
          documentos: documentos.length,
          bagagem: bagagem.length,
          viajantes: viajantes.length,
          preparativos: preparativos.length,
          roteiro: roteiro.length,
        },
        modules: {
          voos,
          hospedagens,
          transportes,
          despesas,
          tarefas,
          restaurantes,
          documentos,
          bagagem,
          viajantes,
          preparativos,
          roteiro,
        },
      });
    }

    return errorResponse(requestId, 'BAD_REQUEST', 'Ação inválida.', 400);
  } catch (error) {
    console.error('[public-trip-api]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Falha ao gerar snapshot da API pública.', 500);
  }
});
