import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

export type TripRole = 'owner' | 'editor' | 'viewer';
export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export type TripPermissionContext = {
  role: TripRole | null;
  canView: boolean;
  canEdit: boolean;
  isOwner: boolean;
};

export type TripMember = {
  id: string;
  viagem_id: string;
  user_id: string;
  role: TripRole;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
  nome: string | null;
  email: string | null;
};

export type TripInvite = {
  id: string;
  viagem_id: string;
  email: string;
  role: TripRole;
  status: InviteStatus;
  expires_at: string;
  invited_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

type FunctionEnvelope<T> = {
  data?: T;
  error?: unknown;
};

type MembersPayload = {
  members: TripMember[];
  permission: TripPermissionContext;
};

type InvitesPayload = {
  invites: TripInvite[];
  permission: TripPermissionContext;
};

type MutationPayload = {
  member?: TripMember;
  invite?: TripInvite;
  permission: TripPermissionContext;
};

async function callTripMembers<T>(body: Record<string, unknown>): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('trip-members', { body });

  if (error) {
    return { data: null, error: parseFunctionError(data ?? error, 'Falha ao processar membros da viagem.') };
  }

  const parsed = data as FunctionEnvelope<T>;
  if (parsed?.error) {
    return { data: null, error: parseFunctionError(parsed, 'Falha ao processar membros da viagem.') };
  }

  return { data: (parsed?.data ?? null) as T | null, error: null };
}

export async function listTripMembers(viagemId: string) {
  return callTripMembers<MembersPayload>({ action: 'list_members', viagemId });
}

export async function listTripInvites(viagemId: string) {
  return callTripMembers<InvitesPayload>({ action: 'list_invites', viagemId });
}

export async function inviteTripMember(input: {
  viagemId: string;
  email: string;
  role: Exclude<TripRole, 'owner'>;
}) {
  return callTripMembers<MutationPayload>({
    action: 'invite_member',
    viagemId: input.viagemId,
    email: input.email,
    role: input.role,
  });
}

export async function updateTripMemberRole(input: {
  viagemId: string;
  memberId: string;
  role: Exclude<TripRole, 'owner'>;
}) {
  return callTripMembers<MutationPayload>({
    action: 'update_member_role',
    viagemId: input.viagemId,
    memberId: input.memberId,
    role: input.role,
  });
}

export async function removeTripMember(input: { viagemId: string; memberId: string }) {
  return callTripMembers<MutationPayload>({
    action: 'remove_member',
    viagemId: input.viagemId,
    memberId: input.memberId,
  });
}

export async function revokeTripInvite(input: { viagemId: string; inviteId: string }) {
  return callTripMembers<MutationPayload>({
    action: 'revoke_invite',
    viagemId: input.viagemId,
    inviteId: input.inviteId,
  });
}

export async function resendTripInvite(input: { viagemId: string; inviteId: string }) {
  return callTripMembers<MutationPayload>({
    action: 'resend_invite',
    viagemId: input.viagemId,
    inviteId: input.inviteId,
  });
}

export async function acceptTripInvite(input: { inviteToken: string }) {
  return callTripMembers<MutationPayload>({
    action: 'accept_invite',
    inviteToken: input.inviteToken,
  });
}
