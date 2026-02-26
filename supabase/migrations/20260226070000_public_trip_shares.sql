-- Public read-only share links for trips

CREATE TABLE IF NOT EXISTS public.viagem_compartilhamentos_publicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  criado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  expira_em TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_viagem_compartilhamentos_viagem
  ON public.viagem_compartilhamentos_publicos (viagem_id);

CREATE INDEX IF NOT EXISTS idx_viagem_compartilhamentos_status
  ON public.viagem_compartilhamentos_publicos (ativo, expira_em);

ALTER TABLE public.viagem_compartilhamentos_publicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shares_select_own" ON public.viagem_compartilhamentos_publicos;
CREATE POLICY "shares_select_own"
  ON public.viagem_compartilhamentos_publicos
  FOR SELECT
  USING (auth.uid() = criado_por);

DROP POLICY IF EXISTS "shares_insert_own" ON public.viagem_compartilhamentos_publicos;
CREATE POLICY "shares_insert_own"
  ON public.viagem_compartilhamentos_publicos
  FOR INSERT
  WITH CHECK (auth.uid() = criado_por);

DROP POLICY IF EXISTS "shares_update_own" ON public.viagem_compartilhamentos_publicos;
CREATE POLICY "shares_update_own"
  ON public.viagem_compartilhamentos_publicos
  FOR UPDATE
  USING (auth.uid() = criado_por)
  WITH CHECK (auth.uid() = criado_por);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_viagem_compartilhamentos_publicos_updated_at'
  ) THEN
    CREATE TRIGGER update_viagem_compartilhamentos_publicos_updated_at
    BEFORE UPDATE ON public.viagem_compartilhamentos_publicos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
