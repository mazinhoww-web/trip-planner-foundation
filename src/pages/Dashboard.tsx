import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plane, Hotel, Bus, ListTodo, DollarSign, LogOut, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Viagem {
  id: string;
  nome: string;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
}

const statCards = [
  { label: 'Voos', icon: Plane, table: 'voos' as const },
  { label: 'Hospedagens', icon: Hotel, table: 'hospedagens' as const },
  { label: 'Transportes', icon: Bus, table: 'transportes' as const },
  { label: 'Tarefas', icon: ListTodo, table: 'tarefas' as const },
  { label: 'Despesas', icon: DollarSign, table: 'despesas' as const },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [viagem, setViagem] = useState<Viagem | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: viagens } = await supabase
        .from('viagens')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      
      const currentViagem = viagens?.[0] ?? null;
      setViagem(currentViagem);

      if (currentViagem) {
        const results: Record<string, number> = {};
        for (const card of statCards) {
          const { count } = await supabase
            .from(card.table)
            .select('*', { count: 'exact', head: true })
            .eq('viagem_id', currentViagem.id);
          results[card.table] = count ?? 0;
        }
        setCounts(results);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
              TripPlanner
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {viagem ? (
          <>
            {/* Trip Card */}
            <Card className="mb-8 overflow-hidden border-border/50">
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)' }}>
                      {viagem.nome}
                    </h2>
                    <p className="mt-1 text-muted-foreground">
                      {viagem.destino ?? 'Destino a definir'}
                      {viagem.data_inicio && ` · ${viagem.data_inicio}`}
                      {viagem.data_fim && ` a ${viagem.data_fim}`}
                    </p>
                    <span className="mt-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">
                      {viagem.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {statCards.map((card) => (
                <Card key={card.table} className="border-border/50 transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {card.label}
                    </CardTitle>
                    <card.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{counts[card.table] ?? 0}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/50 p-8 text-center">
              <p className="text-muted-foreground">
                Módulos completos (voos, hospedagens, tarefas, etc.) serão implementados nas próximas fases.
              </p>
            </div>
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Nenhuma viagem encontrada.</p>
          </div>
        )}
      </main>
    </div>
  );
}
