-- Fix role helper recursion on viagem_membros policies in environments
-- where helper functions were created without row_security = off.

CREATE OR REPLACE FUNCTION public.trip_role(_viagem_id uuid)
RETURNS public.viagem_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, row_security = off
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
SET search_path = public, row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_trip(_viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) IN ('owner'::public.viagem_role, 'editor'::public.viagem_role);
$$;

CREATE OR REPLACE FUNCTION public.is_trip_owner(_viagem_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, row_security = off
AS $$
  SELECT public.trip_role(_viagem_id) = 'owner'::public.viagem_role;
$$;

GRANT EXECUTE ON FUNCTION public.trip_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_trip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_trip_owner(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members can view membros" ON public.viagem_membros;
CREATE POLICY "Members can view membros"
ON public.viagem_membros
FOR SELECT
TO authenticated
USING (public.can_view_trip(viagem_id));
