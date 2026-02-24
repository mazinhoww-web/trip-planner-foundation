-- Plan tier change audit trail for rollout/conversion metrics

CREATE TABLE IF NOT EXISTS public.user_plan_tier_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_tier public.plan_tier NOT NULL,
  new_tier public.plan_tier NOT NULL,
  source TEXT NOT NULL DEFAULT 'self_service',
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_plan_tier_events_user_created_at
  ON public.user_plan_tier_events (user_id, created_at DESC);

ALTER TABLE public.user_plan_tier_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_plan_tier_events_select_own ON public.user_plan_tier_events;
CREATE POLICY user_plan_tier_events_select_own
ON public.user_plan_tier_events
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

