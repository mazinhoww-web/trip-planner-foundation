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

type ExportFormat = 'json' | 'pdf';

type RequestBody = {
  viagemId?: unknown;
  format?: unknown;
};

function normalizeFormat(value: unknown): ExportFormat | null {
  if (value === 'json' || value === 'pdf') return value;
  return null;
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

function normalizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

async function fetchTripRows(client: ReturnType<typeof createAuthedClient>, table: string, viagemId: string) {
  if (!client) return [] as Array<Record<string, unknown>>;
  const { data, error } = await client.from(table).select('*').eq('viagem_id', viagemId);
  if (error) {
    throw new Error(`Falha ao carregar ${table}`);
  }
  return (data ?? []) as Array<Record<string, unknown>>;
}

function buildExportHtml(snapshot: Record<string, unknown>) {
  const trip = (snapshot.trip ?? {}) as Record<string, unknown>;
  const totals = (snapshot.totals ?? {}) as Record<string, number>;
  const exportedAt = typeof snapshot.exportedAt === 'string'
    ? snapshot.exportedAt
    : new Date().toISOString();

  return `
    <html>
      <head>
        <title>Resumo da viagem</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
          h1 { font-size: 22px; margin-bottom: 6px; }
          p { margin: 4px 0; }
          ul { margin: 12px 0 0 20px; }
          .muted { color: #6b7280; }
          .section { margin-top: 18px; }
        </style>
      </head>
      <body>
        <h1>${trip.nome ?? 'Viagem'}</h1>
        <p class="muted">Exportado em ${new Date(exportedAt).toLocaleString('pt-BR')}</p>
        <div class="section">
          <p><strong>Destino:</strong> ${trip.destino ?? 'Não informado'}</p>
          <p><strong>Período:</strong> ${trip.data_inicio ?? 'Sem início'} até ${trip.data_fim ?? 'Sem fim'}</p>
        </div>
        <div class="section">
          <h2>Totais</h2>
          <ul>
            <li>Voos: ${totals.voos ?? 0}</li>
            <li>Hospedagens: ${totals.hospedagens ?? 0}</li>
            <li>Transportes: ${totals.transportes ?? 0}</li>
            <li>Despesas: ${totals.despesas ?? 0}</li>
            <li>Tarefas: ${totals.tarefas ?? 0}</li>
            <li>Restaurantes: ${totals.restaurantes ?? 0}</li>
          </ul>
        </div>
        <div class="section">
          <p class="muted">Use "Salvar como PDF" na janela de impressão para baixar o arquivo.</p>
        </div>
      </body>
    </html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login para exportar a viagem.', 401);
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as RequestBody;
    const viagemId = typeof body.viagemId === 'string' && body.viagemId.trim() ? body.viagemId.trim() : null;
    const format = normalizeFormat(body.format);

    if (!viagemId || !format) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Informe viagemId e format (json|pdf).', 400);
    }

    const requiredFeature = format === 'pdf' ? 'ff_export_pdf' : 'ff_export_json_full';
    const serviceClient = createServiceClient();
    const context = await loadFeatureGateContext(auth.userId, serviceClient ?? undefined);

    if (!isFeatureEnabled(context, requiredFeature)) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: requiredFeature,
        viagemId,
        metadata: { operation: 'trip-export', status: 'blocked', requestId, format },
      }, serviceClient ?? undefined);

      const planMessage = format === 'pdf'
        ? 'Exportação PDF disponível nos planos Pro/Team.'
        : 'Exportação JSON completa disponível nos planos Pro/Team.';
      return errorResponse(requestId, 'UNAUTHORIZED', planMessage, 403);
    }

    const exportLimit = format === 'pdf'
      ? resolveFeatureLimit(context, 'ff_export_pdf', 20)
      : resolveFeatureLimit(context, 'ff_export_json_full', 60);
    const usageCount = await getFeatureUsageCountInWindow({
      userId: auth.userId,
      featureKey: requiredFeature,
      windowMinutes: 24 * 60,
    }, serviceClient ?? undefined);

    if (usageCount != null && usageCount >= exportLimit) {
      await trackFeatureUsage({
        userId: auth.userId,
        featureKey: requiredFeature,
        viagemId,
        metadata: {
          operation: 'trip-export',
          status: 'blocked',
          reason: 'rate_limit',
          requestId,
          format,
          usageCount,
          limit: exportLimit,
        },
      }, serviceClient ?? undefined);

      return errorResponse(
        requestId,
        'RATE_LIMITED',
        'Limite diário de exportações atingido para o seu plano.',
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

    const snapshot = {
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
    };

    await trackFeatureUsage({
      userId: auth.userId,
      featureKey: requiredFeature,
      viagemId,
      metadata: { operation: 'trip-export', status: 'success', requestId, format },
    }, serviceClient ?? undefined);

    const fileBase = normalizeFileName(String((trip as Record<string, unknown>).nome ?? 'trip'));

    if (format === 'json') {
      return successResponse({
        format,
        fileName: `${fileBase}-snapshot.json`,
        snapshot,
      });
    }

    return successResponse({
      format,
      fileName: `${fileBase}-resumo.pdf`,
      html: buildExportHtml(snapshot),
      snapshot,
    });
  } catch (error) {
    console.error('[trip-export]', requestId, 'unexpected_error', error);
    return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível exportar os dados da viagem.', 500);
  }
});
