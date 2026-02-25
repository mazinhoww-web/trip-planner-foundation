import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

type FunctionEnvelope<T> = {
  data?: T;
  error?: unknown;
};

export type PublicTripSnapshot = {
  exportedAt: string;
  trip: Record<string, unknown>;
  totals: Record<string, number>;
  modules: Record<string, unknown[]>;
};

export async function fetchPublicTripSnapshot(viagemId: string) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'trip_snapshot', viagemId },
  });

  if (error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(data ?? error, 'Não foi possível gerar o snapshot da API pública.'),
    };
  }

  const parsed = data as FunctionEnvelope<PublicTripSnapshot>;
  if (parsed?.error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(parsed, 'Não foi possível gerar o snapshot da API pública.'),
    };
  }

  return {
    data: parsed?.data ?? null,
    error: null as string | null,
  };
}
