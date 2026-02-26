import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';
import { TripSnapshot } from '@/services/tripSnapshot';

export type TripExportFormat = 'json' | 'pdf' | 'ics';

type TripExportResponse = {
  format: TripExportFormat;
  fileName: string;
  snapshot: TripSnapshot;
  html?: string;
  ics?: string;
};

export async function requestTripExport(input: { viagemId: string; format: TripExportFormat }) {
  const { data, error } = await supabase.functions.invoke('trip-export', {
    body: {
      viagemId: input.viagemId,
      format: input.format,
    },
  });

  if (error) {
    return {
      data: null as TripExportResponse | null,
      error: parseFunctionError(data ?? error, 'Não foi possível exportar os dados da viagem.'),
    };
  }

  const parsed = data as { data?: TripExportResponse; error?: unknown };
  if (parsed?.error) {
    return {
      data: null as TripExportResponse | null,
      error: parseFunctionError(parsed, 'Não foi possível exportar os dados da viagem.'),
    };
  }

  return {
    data: (parsed?.data ?? null) as TripExportResponse | null,
    error: null as string | null,
  };
}
