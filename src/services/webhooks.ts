import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

type TripWebhookEventInput = {
  eventType: string;
  viagemId: string;
  payload?: Record<string, unknown>;
};

export async function dispatchTripWebhook(input: TripWebhookEventInput) {
  const { data, error } = await supabase.functions.invoke('trip-webhook-dispatch', {
    body: input,
  });

  if (error) {
    return {
      data: null,
      error: parseFunctionError(data ?? error, 'Webhook da viagem indisponível.'),
    };
  }

  if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
    return {
      data: null,
      error: parseFunctionError(data, 'Webhook da viagem indisponível.'),
    };
  }

  return {
    data,
    error: null as string | null,
  };
}
