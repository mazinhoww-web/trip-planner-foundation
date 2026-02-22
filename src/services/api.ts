import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

function friendlyError(raw: string): string {
  if (raw.includes('row-level security')) return 'Você não tem permissão para esta ação.';
  if (raw.includes('duplicate key')) return 'Este registro já existe.';
  if (raw.includes('violates foreign key')) return 'Referência inválida. Verifique os dados.';
  if (raw.includes('not_found') || raw.includes('PGRST116')) return 'Registro não encontrado.';
  return 'Ocorreu um erro inesperado. Tente novamente.';
}

// ---------------------------------------------------------------------------
// Table names that support viagem_id scoping
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

const TRIP_SCOPED_TABLES: TripScopedTable[] = [
  'voos', 'hospedagens', 'transportes', 'despesas', 'tarefas',
  'documentos', 'bagagem', 'restaurantes', 'viajantes', 'preparativos',
];

// ---------------------------------------------------------------------------
// Generic CRUD
// ---------------------------------------------------------------------------

export async function fetchByTrip<T extends TripScopedTable>(
  table: T,
  viagemId: string,
  orderBy: string = 'created_at',
  ascending: boolean = false,
): Promise<ApiResult<Tables<T>[]>> {
  if (!viagemId || viagemId === 'current') {
    return { data: null, error: 'Viagem inválida para leitura.' };
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('viagem_id' as any, viagemId)
    .order(orderBy as any, { ascending });

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<T>[], error: null };
}

export async function insertRecord<T extends TripScopedTable>(
  table: T,
  record: Omit<TablesInsert<T>, 'id' | 'created_at' | 'updated_at'>,
): Promise<ApiResult<Tables<T>>> {
  const viagemId = (record as { viagem_id?: string }).viagem_id;
  if (!viagemId || viagemId === 'current') {
    return { data: null, error: 'Viagem inválida para gravação.' };
  }

  const { data, error } = await supabase
    .from(table)
    .insert(record as any)
    .select()
    .single();

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<T>, error: null };
}

export async function updateRecord<T extends TripScopedTable>(
  table: T,
  id: string,
  updates: Partial<TablesUpdate<T>>,
): Promise<ApiResult<Tables<T>>> {
  const { data, error } = await supabase
    .from(table)
    .update(updates as any)
    .eq('id' as any, id)
    .select()
    .single();

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<T>, error: null };
}

export async function deleteRecord<T extends TripScopedTable>(
  table: T,
  id: string,
): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id' as any, id);

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// Viagens (not trip-scoped, scoped by user_id via RLS)
// ---------------------------------------------------------------------------

export async function fetchViagens(): Promise<ApiResult<Tables<'viagens'>[]>> {
  const { data, error } = await supabase
    .from('viagens')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<'viagens'>[], error: null };
}

export async function insertViagem(
  record: Omit<TablesInsert<'viagens'>, 'id' | 'created_at' | 'updated_at'>,
): Promise<ApiResult<Tables<'viagens'>>> {
  const { data, error } = await supabase
    .from('viagens')
    .insert(record as any)
    .select()
    .single();

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<'viagens'>, error: null };
}

export async function updateViagem(
  id: string,
  updates: Partial<TablesUpdate<'viagens'>>,
): Promise<ApiResult<Tables<'viagens'>>> {
  const { data, error } = await supabase
    .from('viagens')
    .update(updates as any)
    .eq('id', id)
    .select()
    .single();

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<'viagens'>, error: null };
}

export async function deleteViagem(id: string): Promise<ApiResult<null>> {
  const { error } = await supabase
    .from('viagens')
    .delete()
    .eq('id', id);

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: null, error: null };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function fetchProfile(userId: string): Promise<ApiResult<Tables<'profiles'>>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { data: null, error: friendlyError(error.message) };
  if (!data) return { data: null, error: 'Perfil não encontrado.' };
  return { data: data as Tables<'profiles'>, error: null };
}

export async function updateProfile(
  userId: string,
  updates: Partial<TablesUpdate<'profiles'>>,
): Promise<ApiResult<Tables<'profiles'>>> {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates as any)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return { data: null, error: friendlyError(error.message) };
  return { data: data as Tables<'profiles'>, error: null };
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export async function fetchTripSummary(viagemId: string): Promise<ApiResult<Record<string, number>>> {
  const results: Record<string, number> = {};

  const promises = TRIP_SCOPED_TABLES.map(async (table) => {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('viagem_id', viagemId);
    results[table] = count ?? 0;
  });

  await Promise.all(promises);
  return { data: results, error: null };
}
