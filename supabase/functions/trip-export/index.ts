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

type ExportFormat = 'json' | 'pdf' | 'ics';

type RequestBody = {
  viagemId?: unknown;
  format?: unknown;
};

function normalizeFormat(value: unknown): ExportFormat | null {
  if (value === 'json' || value === 'pdf' || value === 'ics') return value;
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

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isoDateToIcs(isoDate: string) {
  return isoDate.replace(/-/g, '');
}

function buildIcsEvent(params: {
  uid: string;
  startDate: string;
  endDate?: string | null;
  summary: string;
  description?: string;
  location?: string;
}) {
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const start = isoDateToIcs(params.startDate);
  const exclusiveEnd = isoDateToIcs(addDays(params.endDate || params.startDate, 1));
  const lines = [
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${exclusiveEnd}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
  ];
  if (params.description) lines.push(`DESCRIPTION:${escapeIcsText(params.description)}`);
  if (params.location) lines.push(`LOCATION:${escapeIcsText(params.location)}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

function buildCalendarIcs(snapshot: {
  trip: Record<string, unknown>;
  modules: {
    voos: Array<Record<string, unknown>>;
    hospedagens: Array<Record<string, unknown>>;
    transportes: Array<Record<string, unknown>>;
    tarefas: Array<Record<string, unknown>>;
  };
}) {
  const trip = snapshot.trip;
  const tripName = String(trip.nome ?? 'Viagem');
  const events: string[] = [];

  const tripStart = toIsoDate(trip.data_inicio);
  const tripEnd = toIsoDate(trip.data_fim);
  if (tripStart) {
    events.push(buildIcsEvent({
      uid: `trip-${crypto.randomUUID()}`,
      startDate: tripStart,
      endDate: tripEnd ?? tripStart,
      summary: `Viagem: ${tripName}`,
      description: `Destino: ${String(trip.destino ?? 'Não informado')}`,
    }));
  }

  snapshot.modules.voos.forEach((voo) => {
    const date = toIsoDate(voo.data ?? voo.data_inicio);
    if (!date) return;
    const summary = `Voo ${String(voo.numero ?? voo.nome_exibicao ?? voo.companhia ?? 'sem número')}`;
    const location = `${String(voo.origem ?? 'Origem')} -> ${String(voo.destino ?? 'Destino')}`;
    events.push(buildIcsEvent({
      uid: `flight-${crypto.randomUUID()}`,
      startDate: date,
      summary,
      location,
      description: `Companhia: ${String(voo.companhia ?? voo.provedor ?? 'Não informado')}`,
    }));
  });

  snapshot.modules.hospedagens.forEach((stay) => {
    const checkIn = toIsoDate(stay.check_in ?? stay.data_inicio);
    if (!checkIn) return;
    const checkOut = toIsoDate(stay.check_out ?? stay.data_fim);
    events.push(buildIcsEvent({
      uid: `stay-${crypto.randomUUID()}`,
      startDate: checkIn,
      endDate: checkOut ?? checkIn,
      summary: `Hospedagem: ${String(stay.nome ?? stay.nome_exibicao ?? 'Reserva')}`,
      location: String(stay.localizacao ?? stay.destino ?? ''),
      description: `Status: ${String(stay.status ?? 'pendente')}`,
    }));
  });

  snapshot.modules.transportes.forEach((transport) => {
    const date = toIsoDate(transport.data ?? transport.data_inicio);
    if (!date) return;
    events.push(buildIcsEvent({
      uid: `transport-${crypto.randomUUID()}`,
      startDate: date,
      summary: `Transporte: ${String(transport.tipo ?? transport.nome_exibicao ?? 'Trecho')}`,
      location: `${String(transport.origem ?? 'Origem')} -> ${String(transport.destino ?? 'Destino')}`,
      description: `Operadora: ${String(transport.operadora ?? transport.provedor ?? 'Não informada')}`,
    }));
  });

  snapshot.modules.tarefas.forEach((task) => {
    const dueDate = toIsoDate(task.prazo ?? task.data);
    if (!dueDate) return;
    events.push(buildIcsEvent({
      uid: `task-${crypto.randomUUID()}`,
      startDate: dueDate,
      summary: `Tarefa: ${String(task.titulo ?? task.nome ?? 'Lembrete')}`,
      description: String(task.descricao ?? ''),
    }));
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Trip Planner Foundation//Trip Export//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
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
      return errorResponse(requestId, 'BAD_REQUEST', 'Informe viagemId e format (json|pdf|ics).', 400);
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
        : 'Exportação avançada disponível nos planos Pro/Team.';
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

    if (format === 'ics') {
      const ics = buildCalendarIcs({
        trip: trip as Record<string, unknown>,
        modules: { voos, hospedagens, transportes, tarefas },
      });
      return successResponse({
        format,
        fileName: `${fileBase}-itinerario.ics`,
        ics,
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
