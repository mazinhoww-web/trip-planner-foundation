
-- Enums
CREATE TYPE public.viagem_status AS ENUM ('planejada', 'em_andamento', 'concluida');
CREATE TYPE public.reserva_status AS ENUM ('confirmado', 'pendente', 'cancelado');
CREATE TYPE public.tarefa_prioridade AS ENUM ('baixa', 'media', 'alta');

-- Profiles (auto-created on signup)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Viagens
CREATE TABLE public.viagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  destino TEXT,
  data_inicio DATE,
  data_fim DATE,
  status viagem_status NOT NULL DEFAULT 'planejada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.viagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own viagens" ON public.viagens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Voos
CREATE TABLE public.voos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  numero TEXT,
  companhia TEXT,
  origem TEXT,
  destino TEXT,
  data TIMESTAMPTZ,
  status reserva_status NOT NULL DEFAULT 'pendente',
  valor NUMERIC(12,2),
  moeda TEXT DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.voos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own voos" ON public.voos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Hospedagens
CREATE TABLE public.hospedagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  nome TEXT,
  localizacao TEXT,
  check_in DATE,
  check_out DATE,
  valor NUMERIC(12,2),
  moeda TEXT DEFAULT 'BRL',
  status reserva_status NOT NULL DEFAULT 'pendente',
  dica_viagem TEXT,
  como_chegar TEXT,
  atracoes_proximas TEXT,
  restaurantes_proximos TEXT,
  dica_ia TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.hospedagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own hospedagens" ON public.hospedagens FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Transportes
CREATE TABLE public.transportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  tipo TEXT,
  operadora TEXT,
  origem TEXT,
  destino TEXT,
  data TIMESTAMPTZ,
  status reserva_status NOT NULL DEFAULT 'pendente',
  valor NUMERIC(12,2),
  moeda TEXT DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transportes" ON public.transportes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Despesas
CREATE TABLE public.despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  moeda TEXT DEFAULT 'BRL',
  categoria TEXT,
  data DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own despesas" ON public.despesas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Tarefas
CREATE TABLE public.tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  concluida BOOLEAN NOT NULL DEFAULT false,
  prioridade tarefa_prioridade NOT NULL DEFAULT 'media',
  categoria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tarefas" ON public.tarefas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Documentos
CREATE TABLE public.documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT,
  arquivo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documentos" ON public.documentos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bagagem
CREATE TABLE public.bagagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  item TEXT NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 1,
  conferido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bagagem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bagagem" ON public.bagagem FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Restaurantes
CREATE TABLE public.restaurantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  cidade TEXT,
  tipo TEXT,
  rating NUMERIC(2,1),
  salvo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own restaurantes" ON public.restaurantes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Viajantes
CREATE TABLE public.viajantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  email TEXT,
  telefone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.viajantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own viajantes" ON public.viajantes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Preparativos
CREATE TABLE public.preparativos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  viagem_id UUID REFERENCES public.viagens(id) ON DELETE CASCADE NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.preparativos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preparativos" ON public.preparativos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.viagens (user_id, nome, destino, status)
  VALUES (NEW.id, 'Minha Primeira Viagem', 'A definir', 'planejada');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_viagens_updated_at BEFORE UPDATE ON public.viagens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_voos_updated_at BEFORE UPDATE ON public.voos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_hospedagens_updated_at BEFORE UPDATE ON public.hospedagens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_transportes_updated_at BEFORE UPDATE ON public.transportes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tarefas_updated_at BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_documentos_updated_at BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bagagem_updated_at BEFORE UPDATE ON public.bagagem FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_restaurantes_updated_at BEFORE UPDATE ON public.restaurantes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_viajantes_updated_at BEFORE UPDATE ON public.viajantes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_preparativos_updated_at BEFORE UPDATE ON public.preparativos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
