
CREATE TABLE public.roteiro_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dia date NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  titulo text NOT NULL,
  descricao text,
  horario_sugerido text,
  categoria text,
  localizacao text,
  link_maps text,
  sugerido_por_ia boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roteiro_dias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own roteiro" ON public.roteiro_dias
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_roteiro_dias_updated_at
  BEFORE UPDATE ON public.roteiro_dias
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
