
-- Create viagem_membros table
CREATE TABLE public.viagem_membros (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by uuid,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(viagem_id, user_id)
);

ALTER TABLE public.viagem_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of their trips"
  ON public.viagem_membros FOR SELECT
  USING (
    user_id = auth.uid()
    OR viagem_id IN (SELECT viagem_id FROM public.viagem_membros WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role manages members"
  ON public.viagem_membros FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create viagem_convites table
CREATE TABLE public.viagem_convites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('editor', 'viewer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  invited_by uuid NOT NULL,
  accepted_by uuid,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.viagem_convites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages invites"
  ON public.viagem_convites FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trip_role RPC function
CREATE OR REPLACE FUNCTION public.trip_role(_viagem_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.viagem_membros
  WHERE viagem_id = _viagem_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Seed existing trips: add owner as member
INSERT INTO public.viagem_membros (viagem_id, user_id, role, joined_at)
SELECT id, user_id, 'owner', created_at
FROM public.viagens
ON CONFLICT (viagem_id, user_id) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_viagem_membros_updated_at
  BEFORE UPDATE ON public.viagem_membros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_viagem_convites_updated_at
  BEFORE UPDATE ON public.viagem_convites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
