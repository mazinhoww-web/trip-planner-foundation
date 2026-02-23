import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Viagem {
  id: string;
  nome: string;
  user_id: string;
  destino: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
}

interface TripContextType {
  currentTrip: Viagem | null;
  currentTripId: string | null;
  trips: Viagem[];
  loading: boolean;
  selectTrip: (id: string) => void;
  refreshTrips: () => Promise<void>;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Viagem[]>([]);
  const [currentTrip, setCurrentTrip] = useState<Viagem | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTrips = useCallback(async () => {
    if (!user) {
      setTrips([]);
      setCurrentTrip(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('viagens')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar viagens:', error.message);
      setLoading(false);
      return;
    }

    let viagens = (data ?? []) as Viagem[];

    // Se não tem nenhuma viagem, cria a seed
    if (viagens.length === 0) {
      const { data: newTrip, error: seedError } = await supabase
        .from('viagens')
        .insert({
          user_id: user.id,
          nome: 'Minha Primeira Viagem',
          destino: 'A definir',
          status: 'planejada',
        })
        .select()
        .single();

      if (seedError) {
        console.error('Erro ao criar viagem seed:', seedError.message);
        setLoading(false);
        return;
      }

      viagens = [newTrip as Viagem];
    }

    setTrips(viagens);

    // Restaura seleção ou usa a mais recente
    const savedId = localStorage.getItem(`tripplanner_current_trip_${user.id}`);
    const saved = savedId ? viagens.find((v) => v.id === savedId) : null;
    setCurrentTrip(saved ?? viagens[0]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const selectTrip = (id: string) => {
    const trip = trips.find((v) => v.id === id);
    if (trip && user) {
      setCurrentTrip(trip);
      localStorage.setItem(`tripplanner_current_trip_${user.id}`, id);
    }
  };

  const refreshTrips = async () => {
    await loadTrips();
  };

  return (
    <TripContext.Provider
      value={{
        currentTrip,
        currentTripId: currentTrip?.id ?? null,
        trips,
        loading,
        selectTrip,
        refreshTrips,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used within TripProvider');
  return context;
}
