-- Monetization-ready entitlements foundation (no billing activation)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tier') THEN
    CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'team');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_plan_tiers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier public.plan_tier NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feature_entitlements (
  plan_tier public.plan_tier NOT NULL,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  limit_value INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_tier, feature_key)
);

CREATE TABLE IF NOT EXISTS public.user_feature_overrides (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NULL,
  limit_value INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.feature_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  cluster_key TEXT NOT NULL,
  viagem_id UUID NULL REFERENCES public.viagens(id) ON DELETE SET NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_usage_events_user_created_at
  ON public.feature_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_usage_events_feature_created_at
  ON public.feature_usage_events (feature_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user
  ON public.user_feature_overrides (user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_plan_tiers_updated_at'
  ) THEN
    CREATE TRIGGER update_user_plan_tiers_updated_at
    BEFORE UPDATE ON public.user_plan_tiers
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_feature_entitlements_updated_at'
  ) THEN
    CREATE TRIGGER update_feature_entitlements_updated_at
    BEFORE UPDATE ON public.feature_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_feature_overrides_updated_at'
  ) THEN
    CREATE TRIGGER update_user_feature_overrides_updated_at
    BEFORE UPDATE ON public.user_feature_overrides
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.user_plan_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_plan_tiers_select_own ON public.user_plan_tiers;
CREATE POLICY user_plan_tiers_select_own
ON public.user_plan_tiers
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_plan_tiers_insert_own ON public.user_plan_tiers;
DROP POLICY IF EXISTS user_plan_tiers_update_own ON public.user_plan_tiers;
DROP POLICY IF EXISTS user_plan_tiers_delete_own ON public.user_plan_tiers;

DROP POLICY IF EXISTS feature_entitlements_select_authenticated ON public.feature_entitlements;
CREATE POLICY feature_entitlements_select_authenticated
ON public.feature_entitlements
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS user_feature_overrides_select_own ON public.user_feature_overrides;
CREATE POLICY user_feature_overrides_select_own
ON public.user_feature_overrides
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_feature_overrides_insert_own ON public.user_feature_overrides;
DROP POLICY IF EXISTS user_feature_overrides_update_own ON public.user_feature_overrides;
DROP POLICY IF EXISTS user_feature_overrides_delete_own ON public.user_feature_overrides;

DROP POLICY IF EXISTS feature_usage_events_select_own ON public.feature_usage_events;
CREATE POLICY feature_usage_events_select_own
ON public.feature_usage_events
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS feature_usage_events_insert_own ON public.feature_usage_events;

INSERT INTO public.user_plan_tiers (user_id, plan_tier)
SELECT p.user_id, 'free'::public.plan_tier
FROM public.profiles p
WHERE p.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.feature_entitlements (plan_tier, feature_key, enabled, limit_value)
VALUES
  ('free', 'ff_collab_enabled', true, NULL),
  ('free', 'ff_collab_seat_limit_enforced', false, 2),
  ('free', 'ff_collab_editor_role', true, NULL),
  ('free', 'ff_collab_audit_log', false, NULL),
  ('free', 'ff_ai_import_enabled', true, NULL),
  ('free', 'ff_ai_batch_high_volume', false, NULL),
  ('free', 'ff_ai_priority_inference', false, NULL),
  ('free', 'ff_ai_reprocess_unlimited', false, NULL),
  ('free', 'ff_export_pdf', false, NULL),
  ('free', 'ff_export_json_full', false, NULL),
  ('free', 'ff_budget_advanced_insights', false, NULL),
  ('free', 'ff_public_api_access', false, NULL),
  ('free', 'ff_webhooks_enabled', false, NULL),

  ('pro', 'ff_collab_enabled', true, NULL),
  ('pro', 'ff_collab_seat_limit_enforced', false, 6),
  ('pro', 'ff_collab_editor_role', true, NULL),
  ('pro', 'ff_collab_audit_log', false, NULL),
  ('pro', 'ff_ai_import_enabled', true, NULL),
  ('pro', 'ff_ai_batch_high_volume', true, NULL),
  ('pro', 'ff_ai_priority_inference', false, NULL),
  ('pro', 'ff_ai_reprocess_unlimited', true, NULL),
  ('pro', 'ff_export_pdf', true, NULL),
  ('pro', 'ff_export_json_full', true, NULL),
  ('pro', 'ff_budget_advanced_insights', true, NULL),
  ('pro', 'ff_public_api_access', false, NULL),
  ('pro', 'ff_webhooks_enabled', false, NULL),

  ('team', 'ff_collab_enabled', true, NULL),
  ('team', 'ff_collab_seat_limit_enforced', true, 20),
  ('team', 'ff_collab_editor_role', true, NULL),
  ('team', 'ff_collab_audit_log', true, NULL),
  ('team', 'ff_ai_import_enabled', true, NULL),
  ('team', 'ff_ai_batch_high_volume', true, NULL),
  ('team', 'ff_ai_priority_inference', true, NULL),
  ('team', 'ff_ai_reprocess_unlimited', true, NULL),
  ('team', 'ff_export_pdf', true, NULL),
  ('team', 'ff_export_json_full', true, NULL),
  ('team', 'ff_budget_advanced_insights', true, NULL),
  ('team', 'ff_public_api_access', true, NULL),
  ('team', 'ff_webhooks_enabled', true, NULL)
ON CONFLICT (plan_tier, feature_key)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();
