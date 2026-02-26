import { supabase } from '@/integrations/supabase/client';

type ProductEventName =
  | 'import_started'
  | 'import_confirmed'
  | 'import_reprocessed'
  | 'invite_sent'
  | 'member_role_changed'
  | 'export_triggered'
  | 'api_snapshot_requested'
  | 'webhook_dispatched';

type ProductEventInput = {
  eventName: ProductEventName;
  featureKey?: string;
  viagemId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function trackProductEvent(input: ProductEventInput) {
  try {
    await supabase.functions.invoke('feature-entitlements', {
      body: {
        action: 'track_event',
        eventName: input.eventName,
        featureKey: input.featureKey ?? null,
        viagemId: input.viagemId ?? null,
        metadata: input.metadata ?? null,
      },
    });
  } catch {
    // Não bloqueia o fluxo do usuário.
  }
}
