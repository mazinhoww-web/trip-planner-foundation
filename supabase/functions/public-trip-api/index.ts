import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import { isFeatureEnabled, loadFeatureGateContext, trackFeatureUsage } from '../_shared/feature-gates.ts';

type RequestBody = {
  action?: unknown;
  viagemId?: unknown;
};

function normalizeAction(value: unknown) {
  if (value === 'trip_snapshot') return 'trip_snapshot';
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para usar a API pública.', 401);
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const action = normalizeAction(body.action);
    const viagemId = typeof body.viagemId === 'string' && body.viagemId.trim() ? body.viagemId.trim() : null;
    if (!viagemId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Informe viagemId.', 400);
    }

    const serviceClient = createServiceClient();
    const context = await loadFeatureGateContext(auth.userId, serviceClient ?? undefined);

    if (!isFeatureEnabled(context, 'ff_public_api_access')) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: 'ff_public_api_access',
        viagemId,
        metadata: { operation: 'public-trip-api', status: 'blocked', requestId },
      }, serviceClient ?? undefined);

      return errorResponse(requestId, 'UNAUTHORIZED', 'API pública disponível no plano Team.', 403);
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Sessão ausente.', 401);
    }

    const authedClient = createAuthedClient(authorization);
    if (!authedClient) {
      return errorResponse(requestId, 'MISCONFIGURED', 'Configuração Supabase ausente.', 500);
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
      }, serviceClient ?? undefined);

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
