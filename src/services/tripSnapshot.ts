import { Tables } from '@/integrations/supabase/types';

export type TripSnapshotInput = {
  trip: Tables<'viagens'>;
  flights: Tables<'voos'>[];
  stays: Tables<'hospedagens'>[];
  transports: Tables<'transportes'>[];
  expenses: Tables<'despesas'>[];
  tasks: Tables<'tarefas'>[];
  restaurants: Tables<'restaurantes'>[];
  documents: Tables<'documentos'>[];
  luggage: Tables<'bagagem'>[];
  travelers: Tables<'viajantes'>[];
  preparativos: Tables<'preparativos'>[];
  roteiro: Tables<'roteiro_dias'>[];
};

export type TripSnapshot = {
  version: '1.0';
  exportedAt: string;
  trip: {
    id: string;
    nome: string;
    destino: string | null;
    status: string | null;
    data_inicio: string | null;
    data_fim: string | null;
  };
  totals: {
    voos: number;
    hospedagens: number;
    transportes: number;
    despesas: number;
    tarefas: number;
    restaurantes: number;
    documentos: number;
    bagagem: number;
    viajantes: number;
    preparativos: number;
    roteiro: number;
  };
  modules: {
    voos: Tables<'voos'>[];
    hospedagens: Tables<'hospedagens'>[];
    transportes: Tables<'transportes'>[];
    despesas: Tables<'despesas'>[];
    tarefas: Tables<'tarefas'>[];
    restaurantes: Tables<'restaurantes'>[];
    documentos: Tables<'documentos'>[];
    bagagem: Tables<'bagagem'>[];
    viajantes: Tables<'viajantes'>[];
    preparativos: Tables<'preparativos'>[];
    roteiro: Tables<'roteiro_dias'>[];
  };
};

export function buildTripSnapshot(input: TripSnapshotInput): TripSnapshot {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    trip: {
      id: input.trip.id,
      nome: input.trip.nome,
      destino: input.trip.destino,
      status: input.trip.status,
      data_inicio: input.trip.data_inicio,
      data_fim: input.trip.data_fim,
    },
    totals: {
      voos: input.flights.length,
      hospedagens: input.stays.length,
      transportes: input.transports.length,
      despesas: input.expenses.length,
      tarefas: input.tasks.length,
      restaurantes: input.restaurants.length,
      documentos: input.documents.length,
      bagagem: input.luggage.length,
      viajantes: input.travelers.length,
      preparativos: input.preparativos.length,
      roteiro: input.roteiro.length,
    },
    modules: {
      voos: input.flights,
      hospedagens: input.stays,
      transportes: input.transports,
      despesas: input.expenses,
      tarefas: input.tasks,
      restaurantes: input.restaurants,
      documentos: input.documents,
      bagagem: input.luggage,
      viajantes: input.travelers,
      preparativos: input.preparativos,
      roteiro: input.roteiro,
    },
  };
}
