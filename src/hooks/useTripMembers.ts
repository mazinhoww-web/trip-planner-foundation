import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TripInvite,
  TripMember,
  TripPermissionContext,
  inviteTripMember,
  listTripInvites,
  listTripMembers,
  removeTripMember,
  resendTripInvite,
  revokeTripInvite,
  updateTripMemberRole,
} from '@/services/tripMembers';
import { toast } from 'sonner';

const EMPTY_PERMISSION: TripPermissionContext = {
  role: null,
  canView: false,
  canEdit: false,
  isOwner: false,
};

export function useTripMembers(viagemId: string | null) {
  const queryClient = useQueryClient();

  const membersQuery = useQuery({
    queryKey: ['trip-members', viagemId],
    queryFn: async () => {
      if (!viagemId) {
        return {
          members: [] as TripMember[],
          permission: EMPTY_PERMISSION,
        };
      }

      const result = await listTripMembers(viagemId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? 'Falha ao carregar usuários da viagem.');
      }

      return result.data;
    },
    enabled: !!viagemId,
  });

  const permission = membersQuery.data?.permission ?? EMPTY_PERMISSION;

  const invitesQuery = useQuery({
    queryKey: ['trip-invites', viagemId],
    queryFn: async () => {
      if (!viagemId || !permission.isOwner) {
        return {
          invites: [] as TripInvite[],
          permission,
        };
      }

      const result = await listTripInvites(viagemId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? 'Falha ao carregar convites pendentes.');
      }

      return result.data;
    },
    enabled: !!viagemId && permission.isOwner,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['trip-members', viagemId] }),
      queryClient.invalidateQueries({ queryKey: ['trip-invites', viagemId] }),
      queryClient.invalidateQueries({ queryKey: ['viagens'] }),
    ]);
  };

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: 'editor' | 'viewer' }) => {
      if (!viagemId) throw new Error('Selecione uma viagem para convidar usuários.');
      const result = await inviteTripMember({ viagemId, email: input.email, role: input.role });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Convite enviado com sucesso.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (input: { memberId: string; role: 'editor' | 'viewer' }) => {
      if (!viagemId) throw new Error('Selecione uma viagem para editar permissões.');
      const result = await updateTripMemberRole({ viagemId, memberId: input.memberId, role: input.role });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Permissão atualizada.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      if (!viagemId) throw new Error('Selecione uma viagem para remover usuários.');
      const result = await removeTripMember({ viagemId, memberId });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Usuário removido da viagem.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!viagemId) throw new Error('Selecione uma viagem para revogar convites.');
      const result = await revokeTripInvite({ viagemId, inviteId });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Convite revogado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resendMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      if (!viagemId) throw new Error('Selecione uma viagem para reenviar convites.');
      const result = await resendTripInvite({ viagemId, inviteId });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: async () => {
      await refresh();
      toast.success('Convite reenviado.');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const state = {
    members: membersQuery.data?.members ?? [],
    invites: invitesQuery.data?.invites ?? [],
    permission,
    isLoadingMembers: membersQuery.isLoading,
    isLoadingInvites: invitesQuery.isLoading,
    membersError: membersQuery.error instanceof Error ? membersQuery.error.message : null,
    invitesError: invitesQuery.error instanceof Error ? invitesQuery.error.message : null,
    inviteMember: inviteMutation.mutateAsync,
    updateMemberRole: updateRoleMutation.mutateAsync,
    removeMember: removeMutation.mutateAsync,
    revokeInvite: revokeMutation.mutateAsync,
    resendInvite: resendMutation.mutateAsync,
    isInviting: inviteMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isRemovingMember: removeMutation.isPending,
    isRevokingInvite: revokeMutation.isPending,
    isResendingInvite: resendMutation.isPending,
    refetchMembers: membersQuery.refetch,
    refetchInvites: invitesQuery.refetch,
  };

  return state;
}

export type TripMembersState = ReturnType<typeof useTripMembers>;
