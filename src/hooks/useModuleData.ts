import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useTrip } from '@/hooks/useTrip';
import { useAuth } from '@/hooks/useAuth';
import {
  fetchByTrip,
  insertRecord,
  updateRecord,
  deleteRecord,
  fetchTripSummary,
  fetchProfile,
  updateProfile,
  fetchViagens,
  insertViagem,
  updateViagem,
  deleteViagem,
} from '@/services/api';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Generic trip-scoped module hook
// ---------------------------------------------------------------------------

type TripScopedTable =
  | 'voos'
  | 'hospedagens'
  | 'transportes'
  | 'despesas'
  | 'tarefas'
  | 'documentos'
  | 'bagagem'
  | 'restaurantes'
  | 'viajantes'
  | 'preparativos';

export function useModuleData<T extends TripScopedTable>(table: T) {
  const { currentTripId } = useTrip();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = [table, currentTripId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!currentTripId || !user) return [];
      const result = await fetchByTrip(table, currentTripId);
      if (result.error) throw new Error(result.error);
      const rows = result.data ?? [];

      const invalid = rows.find((row) => {
        const record = row as { user_id?: string; viagem_id?: string };
        return record.user_id !== user.id || record.viagem_id !== currentTripId;
      });

      if (invalid) {
        throw new Error('Falha de isolamento de dados detectada. Recarregue a sessão.');
      }

      return rows;
    },
    enabled: !!currentTripId && !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (record: Omit<TablesInsert<T>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>) => {
      if (!user || !currentTripId) throw new Error('Sessão inválida.');
      const fullRecord = {
        ...record,
        user_id: user.id,
        viagem_id: currentTripId,
      } as any;
      const result = await insertRecord(table, fullRecord);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['trip-summary', currentTripId] });
      toast.success('Registro criado com sucesso.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TablesUpdate<T>> }) => {
      const result = await updateRecord(table, id, updates);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['trip-summary', currentTripId] });
      toast.success('Registro atualizado.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteRecord(table, id);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['trip-summary', currentTripId] });
      toast.success('Registro removido.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
    create: createMutation.mutateAsync,
    update: editMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: editMutation.isPending,
    isRemoving: removeMutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// Trip summary hook
// ---------------------------------------------------------------------------

export function useTripSummary() {
  const { currentTripId } = useTrip();

  return useQuery({
    queryKey: ['trip-summary', currentTripId],
    queryFn: async () => {
      if (!currentTripId) return {};
      const result = await fetchTripSummary(currentTripId);
      if (result.error) throw new Error(result.error);
      return result.data ?? {};
    },
    enabled: !!currentTripId,
  });
}

// ---------------------------------------------------------------------------
// Profile hook
// ---------------------------------------------------------------------------

export function useProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const result = await fetchProfile(user.id);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    enabled: !!user,
  });

  const editMutation = useMutation({
    mutationFn: async (updates: Partial<TablesUpdate<'profiles'>>) => {
      if (!user) throw new Error('Sessão inválida.');
      const result = await updateProfile(user.id, updates);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
      toast.success('Perfil atualizado.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    update: editMutation.mutateAsync,
    isUpdating: editMutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// Viagens hook
// ---------------------------------------------------------------------------

export function useViagens() {
  const { user } = useAuth();
  const { refreshTrips } = useTrip();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['viagens'],
    queryFn: async () => {
      const result = await fetchViagens();
      if (result.error) throw new Error(result.error);
      return result.data ?? [];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (record: Omit<TablesInsert<'viagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
      if (!user) throw new Error('Sessão inválida.');
      const result = await insertViagem({ ...record, user_id: user.id });
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagens'] });
      refreshTrips();
      toast.success('Viagem criada com sucesso.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TablesUpdate<'viagens'>> }) => {
      const result = await updateViagem(id, updates);
      if (result.error) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagens'] });
      refreshTrips();
      toast.success('Viagem atualizada.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteViagem(id);
      if (result.error) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viagens'] });
      refreshTrips();
      toast.success('Viagem removida.');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return {
    viagens: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    update: editMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
  };
}
