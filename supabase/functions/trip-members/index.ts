import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { errorResponse, successResponse } from '../_shared/http.ts';
import { requireAuthenticatedUser } from '../_shared/security.ts';
import {
  isFeatureEnabled,
  loadFeatureGateContext,
  trackFeatureUsage,
} from '../_shared/feature-gates.ts';

type TripRole = 'owner' | 'editor' | 'viewer';
type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

type TripPermissionContext = {
  role: TripRole | null;
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
};

type TripMembersAction =
  | 'list_members'
  | 'invite_member'
  | 'update_member_role'
  | 'remove_member'
  | 'list_invites'
  | 'revoke_invite'
  | 'resend_invite'
  | 'accept_invite';

type TripMemberRow = {
  id: string;
  viagem_id: string;
  user_id: string;
  role: TripRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
};

type TripInviteRow = {
  id: string;
  viagem_id: string;
  email: string;
  role: TripRole;
  status: InviteStatus;
  token_hash: string;
  expires_at: string;
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

const INVITE_EXPIRY_DAYS = 7;
const APP_ORIGIN = (Deno.env.get('APP_ORIGIN') ?? 'https://trip-planner-foundation.local').replace(/\/$/, '');

function requireSupabaseEnv() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRole) {
    return {
      ok: false,
      message: 'Configuração Supabase incompleta para colaboração de viagem.',
    };
  }

  return {
    ok: true,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRole,
  };
}

function createAuthedClient(supabaseUrl: string, supabaseAnonKey: string, authorization: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function createServiceClient(supabaseUrl: string, supabaseServiceRole: string) {
  return createClient(supabaseUrl, supabaseServiceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function normalizeRole(value: unknown): TripRole | null {
  if (value === 'owner' || value === 'editor' || value === 'viewer') return value;
  return null;
}

function normalizeAction(value: unknown): TripMembersAction | null {
  if (
    value === 'list_members' ||
    value === 'invite_member' ||
    value === 'update_member_role' ||
    value === 'remove_member' ||
    value === 'list_invites' ||
    value === 'revoke_invite' ||
    value === 'resend_invite' ||
    value === 'accept_invite'
  ) {
    return value;
  }

  return null;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}

function stringParam(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function buildPermission(role: TripRole | null): TripPermissionContext {
  return {
    role,
    canView: role !== null,
    canEdit: role === 'owner' || role === 'editor',
    isOwner: role === 'owner',
  };
}

async function getTripRoleForActor(client: ReturnType<typeof createAuthedClient>, viagemId: string): Promise<TripRole | null> {
  // Try the RPC function first (requires viagem_membros table + trip_role function)
  const { data, error } = await client.rpc('trip_role', { _viagem_id: viagemId });

  if (!error) {
    return normalizeRole(data);
  }

  // Fallback: check if the user is the trip owner via viagens table
  const { data: trip, error: tripError } = await client
    .from('viagens')
    .select('user_id')
    .eq('id', viagemId)
    .maybeSingle();

  if (tripError || !trip) {
    return null;
  }

  // If the RLS lets them read the trip, they're the owner (RLS policy: auth.uid() = user_id)
  return 'owner';
}

async function getTripOwnerId(
  serviceClient: ReturnType<typeof createServiceClient>,
  viagemId: string,
) {
  const { data: trip, error } = await serviceClient
    .from('viagens')
    .select('user_id')
    .eq('id', viagemId)
    .maybeSingle();

  if (error || !trip?.user_id) {
    return null;
  }

  return trip.user_id as string;
}

function makeInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function inviteExpiryIso() {
  const dt = new Date();
  dt.setDate(dt.getDate() + INVITE_EXPIRY_DAYS);
  return dt.toISOString();
}

function inviteRedirectUrl(token: string) {
  return `${APP_ORIGIN}/auth/callback?invite_token=${encodeURIComponent(token)}`;
}

async function loadTripMembers(
  serviceClient: ReturnType<typeof createServiceClient>,
  viagemId: string,
) {
  const { data: members, error } = await serviceClient
    .from('viagem_membros')
    .select('*')
    .eq('viagem_id', viagemId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new Error('Não foi possível carregar os membros da viagem.');
  }

  const memberRows = (members ?? []) as TripMemberRow[];
  const userIds = memberRows.map((member) => member.user_id);
  const profileMap = new Map<string, { nome: string | null; email: string | null }>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await serviceClient
      .from('profiles')
      .select('user_id,nome,email')
      .in('user_id', userIds);

    if (!profilesError) {
      (profiles ?? []).forEach((profile) => {
        profileMap.set(profile.user_id, {
          nome: profile.nome,
          email: profile.email,
        });
      });
    }
  }

  return memberRows.map((member) => {
    const profile = profileMap.get(member.user_id);
    return {
      ...member,
      nome: profile?.nome ?? null,
      email: profile?.email ?? null,
    };
  });
}

async function ensureOwnerRole(role: TripRole | null) {
  if (role !== 'owner') {
    throw new Error('Apenas o owner pode gerenciar usuários desta viagem.');
  }
}

async function trackCollabBlocked(params: {
  serviceClient: ReturnType<typeof createServiceClient>;
  tripOwnerId: string;
  viagemId: string;
  featureKey: 'ff_collab_enabled' | 'ff_collab_editor_role' | 'ff_collab_seat_limit_enforced';
  reason: string;
  action: TripMembersAction;
  actorId: string;
  extra?: Record<string, unknown>;
}) {
  await trackFeatureUsage(
    {
      userId: params.tripOwnerId,
      featureKey: params.featureKey,
      viagemId: params.viagemId,
      metadata: {
        operation: 'trip-members',
        status: 'blocked',
        reason: params.reason,
        action: params.action,
        actor_id: params.actorId,
        ...(params.extra ?? {}),
      },
    },
    params.serviceClient,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const config = requireSupabaseEnv();
    if (!config.ok) {
      console.error('[trip-members]', requestId, 'misconfigured');
      return errorResponse(requestId, 'MISCONFIGURED', config.message, 500);
    }

    const auth = await requireAuthenticatedUser(req);
    if (auth.error || !auth.userId) {
      console.error('[trip-members]', requestId, 'unauthorized', auth.error);
      return errorResponse(requestId, 'UNAUTHORIZED', 'Faça login novamente para gerenciar membros.', 401);
    }

    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Sessão ausente.', 401);
    }

    const body = (await req.json()) as Record<string, unknown>;
    const action = normalizeAction(body.action);
    if (!action) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Ação inválida para gerenciamento de membros.', 400);
    }

    const authedClient = createAuthedClient(config.supabaseUrl, config.supabaseAnonKey, authorization);
    const serviceClient = createServiceClient(config.supabaseUrl, config.supabaseServiceRole);

    if (action === 'accept_invite') {
      const inviteToken = stringParam(body.inviteToken);
      if (!inviteToken) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite inválido. Abra novamente o link recebido por e-mail.', 400);
      }

      const inviteTokenHash = await sha256Hex(inviteToken);
      const { data: invite, error: inviteError } = await serviceClient
        .from('viagem_convites')
        .select('*')
        .eq('token_hash', inviteTokenHash)
        .maybeSingle();

      if (inviteError || !invite) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite não encontrado ou inválido.', 400);
      }

      const convite = invite as TripInviteRow;

      if (convite.status === 'revoked') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Este convite foi revogado pelo owner.', 400);
      }
      if (convite.status === 'accepted') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Este convite já foi aceito anteriormente.', 400);
      }
      if (convite.status === 'expired') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite expirado. Solicite um novo convite ao owner.', 400);
      }

      if (new Date(convite.expires_at).getTime() < Date.now()) {
        await serviceClient
          .from('viagem_convites')
          .update({ status: 'expired' })
          .eq('id', convite.id);
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite expirado. Solicite um novo convite ao owner.', 400);
      }

      const { data: userInfo, error: userInfoError } = await authedClient.auth.getUser();
      if (userInfoError || !userInfo?.user) {
        return errorResponse(requestId, 'UNAUTHORIZED', 'Não foi possível validar a sessão do usuário.', 401);
      }

      const actorEmail = normalizeEmail(userInfo.user.email);
      if (!actorEmail || actorEmail !== normalizeEmail(convite.email)) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Este convite pertence a outro e-mail.', 400);
      }

      const tripOwnerId = await getTripOwnerId(serviceClient, convite.viagem_id);
      if (!tripOwnerId) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Viagem do convite não encontrada.', 400);
      }

      const ownerFeatureContext = await loadFeatureGateContext(tripOwnerId, serviceClient);
      if (!isFeatureEnabled(ownerFeatureContext, 'ff_collab_enabled')) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId: convite.viagem_id,
          featureKey: 'ff_collab_enabled',
          reason: 'feature_disabled',
          action,
          actorId: auth.userId,
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Colaboração desativada para esta viagem no plano atual.',
          403,
        );
      }

      if (convite.role === 'editor' && !isFeatureEnabled(ownerFeatureContext, 'ff_collab_editor_role')) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId: convite.viagem_id,
          featureKey: 'ff_collab_editor_role',
          reason: 'editor_role_disabled',
          action,
          actorId: auth.userId,
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Este plano não permite novos convites com papel de editor.',
          403,
        );
      }

      const existingMembersBeforeAccept = await loadTripMembers(serviceClient, convite.viagem_id);
      const alreadyMember = existingMembersBeforeAccept.some((member) => member.user_id === userInfo.user.id);

      if (
        !alreadyMember &&
        Number.isFinite(ownerFeatureContext.seatLimit) &&
        existingMembersBeforeAccept.length >= ownerFeatureContext.seatLimit
      ) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId: convite.viagem_id,
          featureKey: 'ff_collab_seat_limit_enforced',
          reason: 'seat_limit_reached',
          action,
          actorId: auth.userId,
          extra: {
            seat_limit: ownerFeatureContext.seatLimit,
            member_count: existingMembersBeforeAccept.length,
          },
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Limite de assentos da viagem atingido para o plano atual.',
          403,
        );
      }

      const joinedAt = new Date().toISOString();
      const { error: upsertMemberError } = await serviceClient
        .from('viagem_membros')
        .upsert(
          {
            viagem_id: convite.viagem_id,
            user_id: userInfo.user.id,
            role: convite.role,
            invited_by: convite.invited_by,
            joined_at: joinedAt,
            updated_at: joinedAt,
          },
          { onConflict: 'viagem_id,user_id' },
        );

      if (upsertMemberError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível vincular o usuário à viagem.', 500);
      }

      await serviceClient
        .from('viagem_convites')
        .update({
          status: 'accepted',
          accepted_by: userInfo.user.id,
          accepted_at: joinedAt,
          updated_at: joinedAt,
        })
        .eq('id', convite.id);

      const { data: travelerExisting } = await serviceClient
        .from('viajantes')
        .select('id')
        .eq('viagem_id', convite.viagem_id)
        .ilike('email', actorEmail)
        .limit(1);

      if (!travelerExisting || travelerExisting.length === 0) {
        const fullName =
          typeof userInfo.user.user_metadata?.full_name === 'string' && userInfo.user.user_metadata.full_name.trim()
            ? userInfo.user.user_metadata.full_name.trim()
            : actorEmail.split('@')[0];

        await serviceClient.from('viajantes').insert({
          viagem_id: convite.viagem_id,
          user_id: userInfo.user.id,
          nome: fullName,
          email: actorEmail,
          telefone: null,
        });
      }

      const role = await getTripRoleForActor(authedClient, convite.viagem_id);
      const permission = buildPermission(role);

      console.info('[trip-members]', requestId, 'accept_invite', {
        tripId: convite.viagem_id,
        action,
        actorRole: role,
        actorId: auth.userId,
      });

      await trackFeatureUsage(
        {
          userId: tripOwnerId,
          featureKey: 'ff_collab_enabled',
          viagemId: convite.viagem_id,
          metadata: {
            operation: 'trip-members',
            status: 'success',
            action,
            invited_user_id: userInfo.user.id,
            role: convite.role,
          },
        },
        serviceClient,
      );

      return successResponse({
        permission,
        viagemId: convite.viagem_id,
      });
    }

    const viagemId = stringParam(body.viagemId);
    if (!viagemId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Viagem inválida para esta operação.', 400);
    }

    const actorRole = await getTripRoleForActor(authedClient, viagemId);
    const permission = buildPermission(actorRole);

    if (!permission.canView) {
      return errorResponse(requestId, 'UNAUTHORIZED', 'Você não tem acesso a esta viagem.', 403);
    }

    const tripOwnerId = await getTripOwnerId(serviceClient, viagemId);
    if (!tripOwnerId) {
      return errorResponse(requestId, 'BAD_REQUEST', 'Viagem não encontrada para esta operação.', 400);
    }

    const featureContext = await loadFeatureGateContext(tripOwnerId, serviceClient);
    if (!isFeatureEnabled(featureContext, 'ff_collab_enabled')) {
      await trackCollabBlocked({
        serviceClient,
        tripOwnerId,
        viagemId,
        featureKey: 'ff_collab_enabled',
        reason: 'feature_disabled',
        action,
        actorId: auth.userId,
      });
      return errorResponse(
        requestId,
        'UNAUTHORIZED',
        'Colaboração desativada para esta viagem no plano atual.',
        403,
      );
    }

    if (action === 'list_members') {
      const members = await loadTripMembers(serviceClient, viagemId);
      console.info('[trip-members]', requestId, 'list_members', {
        tripId: viagemId,
        actorId: auth.userId,
        actorRole,
      });
      return successResponse({
        members,
        permission,
        featureGate: {
          planTier: featureContext.planTier,
          seatLimit: featureContext.seatLimit,
          source: featureContext.source,
          entitlements: featureContext.entitlements,
          rolloutCohort: featureContext.rolloutCohort,
          rolloutPercent: featureContext.rolloutPercent,
          rolloutFeatures: featureContext.rolloutFeatures,
        },
      });
    }

    if (action === 'list_invites') {
      await ensureOwnerRole(actorRole);

      const { data: invites, error: invitesError } = await serviceClient
        .from('viagem_convites')
        .select('*')
        .eq('viagem_id', viagemId)
        .order('created_at', { ascending: false });

      if (invitesError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível carregar os convites desta viagem.', 500);
      }

      return successResponse({
        invites: (invites ?? []) as TripInviteRow[],
        permission,
      });
    }

    if (action === 'invite_member') {
      await ensureOwnerRole(actorRole);

      const email = normalizeEmail(body.email);
      const role = normalizeRole(body.role) ?? 'viewer';
      if (!email) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Informe um e-mail válido para convite.', 400);
      }
      if (role === 'owner') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Nesta fase, convites só podem ser editor ou viewer.', 400);
      }
      if (role === 'editor' && !isFeatureEnabled(featureContext, 'ff_collab_editor_role')) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId,
          featureKey: 'ff_collab_editor_role',
          reason: 'editor_role_disabled',
          action,
          actorId: auth.userId,
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Este plano não permite novos convites com papel de editor.',
          403,
        );
      }

      const existingMembers = await loadTripMembers(serviceClient, viagemId);
      const alreadyMember = existingMembers.some((member) => normalizeEmail(member.email) === email);
      if (alreadyMember) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Este e-mail já possui acesso à viagem.', 400);
      }
      if (Number.isFinite(featureContext.seatLimit) && existingMembers.length >= featureContext.seatLimit) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId,
          featureKey: 'ff_collab_seat_limit_enforced',
          reason: 'seat_limit_reached',
          action,
          actorId: auth.userId,
          extra: {
            seat_limit: featureContext.seatLimit,
            member_count: existingMembers.length,
          },
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Limite de assentos da viagem atingido para o plano atual.',
          403,
        );
      }

      const token = makeInviteToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = inviteExpiryIso();
      const nowIso = new Date().toISOString();

      const { data: pendingInvites, error: pendingInviteError } = await serviceClient
        .from('viagem_convites')
        .select('*')
        .eq('viagem_id', viagemId)
        .ilike('email', email)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1);

      if (pendingInviteError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível verificar convites pendentes.', 500);
      }

      const pendingInvite = (pendingInvites ?? [])[0] ?? null;

      let savedInvite: TripInviteRow | null = null;

      if (pendingInvite) {
        const { data: updatedInvite, error: updateInviteError } = await serviceClient
          .from('viagem_convites')
          .update({
            role,
            token_hash: tokenHash,
            expires_at: expiresAt,
            invited_by: auth.userId,
            updated_at: nowIso,
          })
          .eq('id', pendingInvite.id)
          .select('*')
          .single();

        if (updateInviteError) {
          return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível atualizar o convite pendente.', 500);
        }

        savedInvite = updatedInvite as TripInviteRow;
      } else {
        const { data: createdInvite, error: createInviteError } = await serviceClient
          .from('viagem_convites')
          .insert({
            viagem_id: viagemId,
            email,
            role,
            status: 'pending',
            token_hash: tokenHash,
            expires_at: expiresAt,
            invited_by: auth.userId,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('*')
          .single();

        if (createInviteError) {
          return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível criar o convite.', 500);
        }

        savedInvite = createdInvite as TripInviteRow;
      }

      const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteRedirectUrl(token),
      });

      if (inviteError) {
        console.error('[trip-members]', requestId, 'invite_send_error', inviteError.message);
        return errorResponse(requestId, 'UPSTREAM_ERROR', 'Convite criado, mas não foi possível enviar e-mail agora.', 502);
      }

      console.info('[trip-members]', requestId, 'invite_member', {
        tripId: viagemId,
        action,
        actorRole,
        actorId: auth.userId,
      });

      await trackFeatureUsage(
        {
          userId: tripOwnerId,
          featureKey: 'ff_collab_enabled',
          viagemId,
          metadata: {
            operation: 'trip-members',
            status: 'success',
            action,
            invite_role: role,
            invite_email: email,
          },
        },
        serviceClient,
      );

      return successResponse({
        invite: savedInvite,
        permission,
      });
    }

    if (action === 'update_member_role') {
      await ensureOwnerRole(actorRole);

      const memberId = stringParam(body.memberId);
      const role = normalizeRole(body.role);
      if (!memberId || !role || role === 'owner') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Dados inválidos para atualização de papel.', 400);
      }
      if (role === 'editor' && !isFeatureEnabled(featureContext, 'ff_collab_editor_role')) {
        await trackCollabBlocked({
          serviceClient,
          tripOwnerId,
          viagemId,
          featureKey: 'ff_collab_editor_role',
          reason: 'editor_role_disabled',
          action,
          actorId: auth.userId,
        });
        return errorResponse(
          requestId,
          'UNAUTHORIZED',
          'Este plano não permite papel de editor.',
          403,
        );
      }

      const { data: member, error: memberError } = await serviceClient
        .from('viagem_membros')
        .select('*')
        .eq('id', memberId)
        .eq('viagem_id', viagemId)
        .maybeSingle();

      if (memberError || !member) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Membro não encontrado nesta viagem.', 400);
      }

      if ((member as TripMemberRow).role === 'owner') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Não é possível alterar o papel do owner.', 400);
      }

      const { data: updatedMember, error: updatedError } = await serviceClient
        .from('viagem_membros')
        .update({ role })
        .eq('id', memberId)
        .eq('viagem_id', viagemId)
        .select('*')
        .single();

      if (updatedError || !updatedMember) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível atualizar o papel do membro.', 500);
      }

      await trackFeatureUsage(
        {
          userId: tripOwnerId,
          featureKey: 'ff_collab_enabled',
          viagemId,
          metadata: { operation: 'trip-members', status: 'success', action, role },
        },
        serviceClient,
      );

      return successResponse({
        member: updatedMember,
        permission,
      });
    }

    if (action === 'remove_member') {
      await ensureOwnerRole(actorRole);

      const memberId = stringParam(body.memberId);
      if (!memberId) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Membro inválido para remoção.', 400);
      }

      const { data: member, error: memberError } = await serviceClient
        .from('viagem_membros')
        .select('*')
        .eq('id', memberId)
        .eq('viagem_id', viagemId)
        .maybeSingle();

      if (memberError || !member) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Membro não encontrado para remoção.', 400);
      }

      if ((member as TripMemberRow).role === 'owner') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Não é possível remover o owner da viagem.', 400);
      }

      const { error: deleteError } = await serviceClient
        .from('viagem_membros')
        .delete()
        .eq('id', memberId)
        .eq('viagem_id', viagemId);

      if (deleteError) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível remover o membro da viagem.', 500);
      }

      await trackFeatureUsage(
        {
          userId: tripOwnerId,
          featureKey: 'ff_collab_enabled',
          viagemId,
          metadata: { operation: 'trip-members', status: 'success', action, member_id: memberId },
        },
        serviceClient,
      );

      return successResponse({
        permission,
      });
    }

    if (action === 'revoke_invite') {
      await ensureOwnerRole(actorRole);

      const inviteId = stringParam(body.inviteId);
      if (!inviteId) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite inválido para revogação.', 400);
      }

      const { data: updatedInvite, error: revokeError } = await serviceClient
        .from('viagem_convites')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', inviteId)
        .eq('viagem_id', viagemId)
        .select('*')
        .single();

      if (revokeError || !updatedInvite) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível revogar o convite.', 500);
      }

      return successResponse({
        invite: updatedInvite,
        permission,
      });
    }

    if (action === 'resend_invite') {
      await ensureOwnerRole(actorRole);

      const inviteId = stringParam(body.inviteId);
      if (!inviteId) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite inválido para reenvio.', 400);
      }

      const { data: invite, error: inviteError } = await serviceClient
        .from('viagem_convites')
        .select('*')
        .eq('id', inviteId)
        .eq('viagem_id', viagemId)
        .maybeSingle();

      if (inviteError || !invite) {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite não encontrado.', 400);
      }

      const currentInvite = invite as TripInviteRow;
      if (currentInvite.status === 'accepted') {
        return errorResponse(requestId, 'BAD_REQUEST', 'Convite já aceito; não é possível reenviar.', 400);
      }

      const token = makeInviteToken();
      const tokenHash = await sha256Hex(token);
      const expiresAt = inviteExpiryIso();
      const nowIso = new Date().toISOString();

      const { data: resentInvite, error: resentError } = await serviceClient
        .from('viagem_convites')
        .update({
          status: 'pending',
          token_hash: tokenHash,
          expires_at: expiresAt,
          updated_at: nowIso,
        })
        .eq('id', inviteId)
        .eq('viagem_id', viagemId)
        .select('*')
        .single();

      if (resentError || !resentInvite) {
        return errorResponse(requestId, 'INTERNAL_ERROR', 'Não foi possível atualizar o convite para reenvio.', 500);
      }

      const { error: resendError } = await serviceClient.auth.admin.inviteUserByEmail(currentInvite.email, {
        redirectTo: inviteRedirectUrl(token),
      });

      if (resendError) {
        console.error('[trip-members]', requestId, 'resend_invite_error', resendError.message);
        return errorResponse(requestId, 'UPSTREAM_ERROR', 'Convite atualizado, mas não foi possível reenviar e-mail agora.', 502);
      }

      return successResponse({
        invite: resentInvite,
        permission,
      });
    }

    return errorResponse(requestId, 'BAD_REQUEST', 'Ação não suportada.', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado no gerenciamento de membros.';
    console.error('[trip-members]', requestId, 'unexpected_error', error);

    if (message.includes('owner')) {
      return errorResponse(requestId, 'UNAUTHORIZED', message, 403);
    }

    return errorResponse(requestId, 'INTERNAL_ERROR', message, 500);
  }
});
