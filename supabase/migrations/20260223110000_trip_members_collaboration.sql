-- Trip collaboration: owner/editor/viewer + email invites

-- 1) Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'viagem_role') THEN
    CREATE TYPE public.viagem_role AS ENUM ('owner', 'editor', 'viewer');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'convite_status') THEN
    CREATE TYPE public.convite_status AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

-- 2) Tables
CREATE TABLE IF NOT EXISTS public.viagem_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.viagem_role NOT NULL,
  invited_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viagem_membros_unique UNIQUE (viagem_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.viagem_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.viagem_role NOT NULL DEFAULT 'viewer',
  status public.convite_status NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viagem_convites_email_status ON public.viagem_convites (lower(email), status);
CREATE INDEX IF NOT EXISTS idx_viagem_convites_viagem_status ON public.viagem_convites (viagem_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_viagem_convites_token_hash ON public.viagem_convites (token_hash);
CREATE INDEX IF NOT EXISTS idx_viagem_membros_viagem_role ON public.viagem_membros (viagem_id, role);

ALTER TABLE public.viagem_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagem_convites ENABLE ROW LEVEL SECURITY;

-- 3) Updated-at triggers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_viagem_membros_updated_at'
  ) THEN
    CREATE TRIGGER update_viagem_membros_updated_at
    BEFORE UPDATE ON public.viagem_membros
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_viagem_convites_updated_at'
  ) THEN
    CREATE TRIGGER update_viagem_convites_updated_at
    BEFORE UPDATE ON public.viagem_convites
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- 4) Permission helper functions
CREATE OR REPLACE FUNCTION public.trip_role(_viagem_id uuid)
RETURNS public.viagem_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH owner_check AS (
    SELECT 'owner'::public.viagem_role AS role
    FROM public.viagens v
    WHERE v.id = _viagem_id
      AND v.user_id = auth.uid()
    LIMIT 1
  ),
  member_check AS (
    SELECT m.role
    FROM public.viagem_membros m
    WHERE m.viagem_id = _viagem_id
      AND m.user_id = auth.uid()
    ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END
    LIMIT 1
  )
  SELECT role FROM owner_check
  UNION ALL
  SELECT role FROM member_check
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_view_trip(_viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_trip(_viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) IN ('owner'::public.viagem_role, 'editor'::public.viagem_role);
$$;

CREATE OR REPLACE FUNCTION public.is_trip_owner(_viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) = 'owner'::public.viagem_role;
$$;

GRANT EXECUTE ON FUNCTION public.trip_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;

-- 5) Owner member auto-maintenance
CREATE OR REPLACE FUNCTION public.ensure_viagem_owner_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.viagem_membros (viagem_id, user_id, role, invited_by, joined_at)
  VALUES (NEW.id, NEW.user_id, 'owner', NEW.user_id, now())
  ON CONFLICT (viagem_id, user_id)
  DO UPDATE SET role = 'owner', invited_by = NEW.user_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'ensure_viagem_owner_member_after_insert'
  ) THEN
    CREATE TRIGGER ensure_viagem_owner_member_after_insert
    AFTER INSERT ON public.viagens
    FOR EACH ROW
    EXECUTE FUNCTION public.ensure_viagem_owner_member();
  END IF;
END $$;

-- 6) Backfill existing owners
INSERT INTO public.viagem_membros (viagem_id, user_id, role, invited_by, joined_at)
SELECT v.id, v.user_id, 'owner'::public.viagem_role, v.user_id, now()
FROM public.viagens v
ON CONFLICT (viagem_id, user_id)
DO UPDATE SET role = 'owner';

-- 7) Collaboration table policies
DROP POLICY IF EXISTS "Trip owners manage membros" ON public.viagem_membros;
DROP POLICY IF EXISTS "Members can view membros" ON public.viagem_membros;

CREATE POLICY "Members can view membros"
ON public.viagem_membros
FOR SELECT
TO authenticated
USING (public.can_view_trip(viagem_id));

CREATE POLICY "Trip owners manage membros"
ON public.viagem_membros
FOR ALL
TO authenticated
USING (public.is_trip_owner(viagem_id))
WITH CHECK (public.is_trip_owner(viagem_id));

DROP POLICY IF EXISTS "Trip owners manage convites" ON public.viagem_convites;
CREATE POLICY "Trip owners manage convites"
ON public.viagem_convites
FOR ALL
TO authenticated
USING (public.is_trip_owner(viagem_id))
WITH CHECK (public.is_trip_owner(viagem_id));

-- 8) Replace old owner-only policies by role-aware policies
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voos','hospedagens','transportes','despesas','tarefas','documentos','bagagem','restaurantes','viajantes','preparativos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users manage own ' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_by_trip_access', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_by_trip_edit', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_by_trip_edit', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_by_trip_edit', t);

    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR SELECT
      TO authenticated
      USING (public.can_view_trip(viagem_id))
    $sql$, t || '_select_by_trip_access', t);

    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR INSERT
      TO authenticated
      WITH CHECK (public.can_edit_trip(viagem_id) AND auth.uid() = user_id)
    $sql$, t || '_insert_by_trip_edit', t);

    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR UPDATE
      TO authenticated
      USING (public.can_edit_trip(viagem_id))
      WITH CHECK (public.can_edit_trip(viagem_id))
    $sql$, t || '_update_by_trip_edit', t);

    EXECUTE format($sql$
      CREATE POLICY %I
      ON public.%I
      FOR DELETE
      TO authenticated
      USING (public.can_edit_trip(viagem_id))
    $sql$, t || '_delete_by_trip_edit', t);
  END LOOP;
END $$;

-- viagens policies (special: ownership controls write)
DROP POLICY IF EXISTS "Users manage own viagens" ON public.viagens;
DROP POLICY IF EXISTS viagens_select_by_membership ON public.viagens;
DROP POLICY IF EXISTS viagens_insert_owner ON public.viagens;
DROP POLICY IF EXISTS viagens_update_owner ON public.viagens;
DROP POLICY IF EXISTS viagens_delete_owner ON public.viagens;

CREATE POLICY viagens_select_by_membership
ON public.viagens
FOR SELECT
TO authenticated
USING (public.can_view_trip(id));

CREATE POLICY viagens_insert_owner
ON public.viagens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY viagens_update_owner
ON public.viagens
FOR UPDATE
TO authenticated
USING (public.is_trip_owner(id))
WITH CHECK (public.is_trip_owner(id));

CREATE POLICY viagens_delete_owner
ON public.viagens
FOR DELETE
TO authenticated
USING (public.is_trip_owner(id));
