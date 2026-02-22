import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plane, Hotel, Bus, ListTodo, DollarSign, LogOut, MapPin, Utensils, Briefcase, Users, FileText, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

const statCards = [
  { label: 'Voos', icon: Plane, table: 'voos' as const },
  { label: 'Hospedagens', icon: Hotel, table: 'hospedagens' as const },
  { label: 'Transportes', icon: Bus, table: 'transportes' as const },
  { label: 'Tarefas', icon: ListTodo, table: 'tarefas' as const },
  { label: 'Despesas', icon: DollarSign, table: 'despesas' as const },
  { label: 'Restaurantes', icon: Utensils, table: 'restaurantes' as const },
  { label: 'Documentos', icon: FileText, table: 'documentos' as const },
  { label: 'Bagagem', icon: Package, table: 'bagagem' as const },
  { label: 'Viajantes', icon: Users, table: 'viajantes' as const },
  { label: 'Preparativos', icon: Briefcase, table: 'preparativos' as const },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { currentTrip, currentTripId, trips, loading: tripLoading, selectTrip } = useTrip();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(false);

  useEffect(() => {
    if (!currentTripId) return;
    
    let cancelled = false;
    setCountsLoading(true);

    async function loadCounts() {
      const results: Record<string, number> = {};
      const promises = statCards.map(async (card) => {
        const { count } = await supabase
          .from(card.table)
          .select('*', { count: 'exact', head: true })
          .eq('viagem_id', currentTripId!);
        results[card.table] = count ?? 0;
      });
      await Promise.all(promises);
      if (!cancelled) {
        setCounts(results);
        setCountsLoading(false);
      }
    }

    loadCounts();
    return () => { cancelled = true; };
  }, [currentTripId]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (tripLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Carregando viagem...</p>
        </div>
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
            <h1 className="text-xl font-bold font-display">TripPlanner</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Trip selector */}
            {trips.length > 1 && (
              <Select value={currentTripId ?? ''} onValueChange={selectTrip}>
                <SelectTrigger className="w-[200px] hidden sm:flex">
                  <SelectValue placeholder="Selecionar viagem" />
                </SelectTrigger>
                <SelectContent>
                  {trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="hidden text-sm text-muted-foreground lg:block">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {currentTrip ? (
          <>
            {/* Trip Card */}
            <Card className="mb-8 overflow-hidden border-border/50">
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold font-display">
                      {currentTrip.nome}
                    </h2>
                    <p className="mt-1 text-muted-foreground">
                      {currentTrip.destino ?? 'Destino a definir'}
                      {currentTrip.data_inicio && ` · ${currentTrip.data_inicio}`}
                      {currentTrip.data_fim && ` a ${currentTrip.data_fim}`}
                    </p>
                    <span className="mt-2 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">
                      {currentTrip.status.replace('_', ' ')}
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
                    <div className="text-2xl font-bold">
                      {countsLoading ? '–' : (counts[card.table] ?? 0)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 rounded-xl border border-dashed border-border bg-muted/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                ID da viagem atual: <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{currentTripId}</code>
              </p>
              <p className="mt-2 text-muted-foreground">
                Módulos de CRUD serão implementados nas próximas fases.
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
