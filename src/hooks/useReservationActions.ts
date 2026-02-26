import { Dispatch, SetStateAction, useState } from 'react';
import { toast } from 'sonner';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { generateStayTips, suggestRestaurants } from '@/services/ai';
import {
  emptyFlight,
  emptyStay,
  emptyTransport,
  toDateTimeLocal,
  type FlightFormState,
  type StayFormState,
  type TransportFormState,
} from '@/pages/dashboardHelpers';

type FlightsModule = {
  data: Tables<'voos'>[];
  create: (
    record: Omit<TablesInsert<'voos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>,
  ) => Promise<Tables<'voos'> | null>;
  update: (payload: { id: string; updates: Partial<TablesInsert<'voos'>> }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

type StaysModule = {
  data: Tables<'hospedagens'>[];
  create: (
    record: Omit<TablesInsert<'hospedagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>,
  ) => Promise<Tables<'hospedagens'> | null>;
  update: (payload: { id: string; updates: Partial<TablesInsert<'hospedagens'>> }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

type TransportsModule = {
  create: (
    record: Omit<TablesInsert<'transportes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>,
  ) => Promise<Tables<'transportes'> | null>;
  update: (payload: { id: string; updates: Partial<TablesInsert<'transportes'>> }) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
};

type RestaurantsModule = {
  data: Tables<'restaurantes'>[];
  create: (
    record: Omit<TablesInsert<'restaurantes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>,
  ) => Promise<Tables<'restaurantes'> | null>;
};

type UseReservationActionsArgs = {
  ensureCanEdit: () => boolean;
  currentTripDestination?: string | null;
  userHomeCity?: string | null;
  flightsModule: FlightsModule;
  staysModule: StaysModule;
  transportsModule: TransportsModule;
  restaurantsModule: RestaurantsModule;
  flightForm: FlightFormState;
  setFlightForm: Dispatch<SetStateAction<FlightFormState>>;
  editingFlight: Tables<'voos'> | null;
  setEditingFlight: Dispatch<SetStateAction<Tables<'voos'> | null>>;
  setFlightDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedFlight: Tables<'voos'> | null;
  setFlightDetailOpen: Dispatch<SetStateAction<boolean>>;
  stayForm: StayFormState;
  setStayForm: Dispatch<SetStateAction<StayFormState>>;
  editingStay: Tables<'hospedagens'> | null;
  setEditingStay: Dispatch<SetStateAction<Tables<'hospedagens'> | null>>;
  setStayDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedStay: Tables<'hospedagens'> | null;
  setSelectedStay: Dispatch<SetStateAction<Tables<'hospedagens'> | null>>;
  setStayDetailOpen: Dispatch<SetStateAction<boolean>>;
  transportForm: TransportFormState;
  setTransportForm: Dispatch<SetStateAction<TransportFormState>>;
  editingTransport: Tables<'transportes'> | null;
  setEditingTransport: Dispatch<SetStateAction<Tables<'transportes'> | null>>;
  setTransportDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedTransport: Tables<'transportes'> | null;
  setTransportDetailOpen: Dispatch<SetStateAction<boolean>>;
};

export function useReservationActions({
  ensureCanEdit,
  currentTripDestination,
  userHomeCity,
  flightsModule,
  staysModule,
  transportsModule,
  restaurantsModule,
  flightForm,
  setFlightForm,
  editingFlight,
  setEditingFlight,
  setFlightDialogOpen,
  selectedFlight,
  setFlightDetailOpen,
  stayForm,
  setStayForm,
  editingStay,
  setEditingStay,
  setStayDialogOpen,
  selectedStay,
  setSelectedStay,
  setStayDetailOpen,
  transportForm,
  setTransportForm,
  editingTransport,
  setEditingTransport,
  setTransportDialogOpen,
  selectedTransport,
  setTransportDetailOpen,
}: UseReservationActionsArgs) {
  const [enrichingStayId, setEnrichingStayId] = useState<string | null>(null);
  const [suggestingRestaurantsStayId, setSuggestingRestaurantsStayId] = useState<string | null>(null);

  const openCreateFlight = () => {
    if (!ensureCanEdit()) return;
    setEditingFlight(null);
    setFlightForm(emptyFlight);
    setFlightDialogOpen(true);
  };

  const openEditFlight = (flight: Tables<'voos'>) => {
    if (!ensureCanEdit()) return;
    setEditingFlight(flight);
    setFlightForm({
      numero: flight.numero ?? '',
      companhia: flight.companhia ?? '',
      origem: flight.origem ?? '',
      destino: flight.destino ?? '',
      data: toDateTimeLocal(flight.data),
      status: flight.status,
      valor: flight.valor != null ? String(flight.valor) : '',
      moeda: flight.moeda ?? 'BRL',
    });
    setFlightDialogOpen(true);
  };

  const submitFlight = async () => {
    if (!ensureCanEdit()) return;
    const payload: Omit<TablesInsert<'voos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
      numero: flightForm.numero || null,
      companhia: flightForm.companhia || null,
      origem: flightForm.origem || null,
      destino: flightForm.destino || null,
      data: flightForm.data ? new Date(flightForm.data).toISOString() : null,
      status: flightForm.status,
      valor: flightForm.valor ? Number(flightForm.valor) : null,
      moeda: flightForm.moeda || 'BRL',
    };

    if (editingFlight) {
      await flightsModule.update({ id: editingFlight.id, updates: payload });
    } else {
      await flightsModule.create(payload);
    }
    setFlightDialogOpen(false);
    setEditingFlight(null);
    setFlightForm(emptyFlight);
  };

  const removeFlight = async (id: string) => {
    if (!ensureCanEdit()) return;
    await flightsModule.remove(id);
    if (selectedFlight?.id === id) setFlightDetailOpen(false);
  };

  const openCreateStay = () => {
    if (!ensureCanEdit()) return;
    setStayDetailOpen(false);
    setSelectedStay(null);
    setEditingStay(null);
    setStayForm(emptyStay);
    setStayDialogOpen(true);
  };

  const openEditStay = (stay: Tables<'hospedagens'>) => {
    if (!ensureCanEdit()) return;
    setStayDetailOpen(false);
    setSelectedStay(null);
    setEditingStay(stay);
    setStayForm({
      nome: stay.nome ?? '',
      localizacao: stay.localizacao ?? '',
      check_in: stay.check_in ?? '',
      check_out: stay.check_out ?? '',
      status: stay.status,
      valor: stay.valor != null ? String(stay.valor) : '',
      moeda: stay.moeda ?? 'BRL',
      dica_viagem: stay.dica_viagem ?? '',
      como_chegar: stay.como_chegar ?? '',
      atracoes_proximas: stay.atracoes_proximas ?? '',
      restaurantes_proximos: stay.restaurantes_proximos ?? '',
      dica_ia: stay.dica_ia ?? '',
    });
    setStayDialogOpen(true);
  };

  const enrichStay = async (stay: Tables<'hospedagens'>, silent: boolean = false) => {
    if (!ensureCanEdit()) return;
    setEnrichingStayId(stay.id);
    try {
      const flights = flightsModule.data ?? [];
      const relevantFlight = flights.find((flight) =>
        flight.destino && stay.localizacao?.toLowerCase().includes(flight.destino.toLowerCase())
      ) ?? flights[0] ?? null;

      const result = await generateStayTips({
        hotelName: stay.nome,
        location: stay.localizacao,
        checkIn: stay.check_in,
        checkOut: stay.check_out,
        tripDestination: currentTripDestination,
        flightOrigin: relevantFlight?.origem ?? null,
        flightDestination: relevantFlight?.destino ?? null,
        userHomeCity: userHomeCity ?? null,
      });

      if (!result.data) {
        throw new Error(result.error ?? 'Falha ao enriquecer hospedagem.');
      }

      await staysModule.update({
        id: stay.id,
        updates: result.data,
      });

      if (result.fromFallback) {
        toast.warning('IA indisponível. Dicas básicas foram aplicadas como fallback.');
      } else if (!silent) {
        toast.success('Dicas de hospedagem geradas por IA.');
      }
    } catch (error) {
      console.error('[ia][hospedagem_enriquecimento_falha]', {
        stayId: stay.id,
        error,
      });
      if (!silent) {
        toast.error('Não foi possível enriquecer agora. Você pode seguir normalmente e tentar depois.');
      }
    } finally {
      setEnrichingStayId((current) => (current === stay.id ? null : current));
    }
  };

  const suggestAndSaveRestaurants = async (stay: Tables<'hospedagens'>) => {
    if (!ensureCanEdit()) return;
    setSuggestingRestaurantsStayId(stay.id);
    try {
      const result = await suggestRestaurants({
        city: stay.localizacao,
        location: stay.localizacao,
        tripDestination: currentTripDestination,
      });

      const suggestions = result.data ?? [];
      if (suggestions.length === 0) {
        toast.warning('Nenhuma sugestão disponível no momento.');
        return;
      }

      const existing = new Set(restaurantsModule.data.map((restaurant) => restaurant.nome.trim().toLowerCase()));
      const uniqueSuggestions = suggestions.filter((suggestion) => !existing.has(suggestion.nome.trim().toLowerCase()));

      await Promise.all(uniqueSuggestions.map((item) => {
        const tipo = [item.tipo, item.faixa_preco].filter(Boolean).join(' · ') || null;
        return restaurantsModule.create({
          nome: item.nome,
          cidade: item.cidade,
          tipo,
          rating: null,
          salvo: true,
        });
      }));

      const restaurantHighlights = suggestions
        .map((item) => {
          const details = [item.tipo, item.bairro_regiao].filter(Boolean).join(' - ');
          return details ? `${item.nome} (${details})` : item.nome;
        })
        .join('; ');

      await staysModule.update({
        id: stay.id,
        updates: {
          restaurantes_proximos: restaurantHighlights,
        },
      });

      if (result.fromFallback) {
        toast.warning('Sugestão de restaurantes em fallback. Revise os dados antes de decidir.');
      } else {
        toast.success('Restaurantes sugeridos e salvos na viagem.');
      }
    } catch (error) {
      console.error('[ia][restaurantes_sugestao_falha]', {
        stayId: stay.id,
        error,
      });
      toast.error('Falha ao sugerir restaurantes. O restante do fluxo segue normalmente.');
    } finally {
      setSuggestingRestaurantsStayId((current) => (current === stay.id ? null : current));
    }
  };

  const submitStay = async () => {
    if (!ensureCanEdit()) return;
    const payload: Omit<TablesInsert<'hospedagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
      nome: stayForm.nome || null,
      localizacao: stayForm.localizacao || null,
      check_in: stayForm.check_in || null,
      check_out: stayForm.check_out || null,
      status: stayForm.status,
      valor: stayForm.valor ? Number(stayForm.valor) : null,
      moeda: stayForm.moeda || 'BRL',
      dica_viagem: stayForm.dica_viagem || null,
      como_chegar: stayForm.como_chegar || null,
      atracoes_proximas: stayForm.atracoes_proximas || null,
      restaurantes_proximos: stayForm.restaurantes_proximos || null,
      dica_ia: stayForm.dica_ia || null,
    };

    let createdStay: Tables<'hospedagens'> | null = null;
    if (editingStay) {
      await staysModule.update({ id: editingStay.id, updates: payload });
    } else {
      createdStay = await staysModule.create(payload);
    }
    setStayDialogOpen(false);
    setEditingStay(null);
    setStayForm(emptyStay);

    if (createdStay) {
      toast.info('Gerando dicas de IA para a hospedagem...');
      void enrichStay(createdStay, true);
    }
  };

  const removeStay = async (id: string) => {
    if (!ensureCanEdit()) return;
    await staysModule.remove(id);
    if (selectedStay?.id === id) setStayDetailOpen(false);
  };

  const openCreateTransport = () => {
    if (!ensureCanEdit()) return;
    setEditingTransport(null);
    setTransportForm(emptyTransport);
    setTransportDialogOpen(true);
  };

  const openEditTransport = (transport: Tables<'transportes'>) => {
    if (!ensureCanEdit()) return;
    setEditingTransport(transport);
    setTransportForm({
      tipo: transport.tipo ?? '',
      operadora: transport.operadora ?? '',
      origem: transport.origem ?? '',
      destino: transport.destino ?? '',
      data: toDateTimeLocal(transport.data),
      status: transport.status,
      valor: transport.valor != null ? String(transport.valor) : '',
      moeda: transport.moeda ?? 'BRL',
    });
    setTransportDialogOpen(true);
  };

  const submitTransport = async () => {
    if (!ensureCanEdit()) return;
    const payload: Omit<TablesInsert<'transportes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
      tipo: transportForm.tipo || null,
      operadora: transportForm.operadora || null,
      origem: transportForm.origem || null,
      destino: transportForm.destino || null,
      data: transportForm.data ? new Date(transportForm.data).toISOString() : null,
      status: transportForm.status,
      valor: transportForm.valor ? Number(transportForm.valor) : null,
      moeda: transportForm.moeda || 'BRL',
    };

    if (editingTransport) {
      await transportsModule.update({ id: editingTransport.id, updates: payload });
    } else {
      await transportsModule.create(payload);
    }
    setTransportDialogOpen(false);
    setEditingTransport(null);
    setTransportForm(emptyTransport);
  };

  const removeTransport = async (id: string) => {
    if (!ensureCanEdit()) return;
    await transportsModule.remove(id);
    if (selectedTransport?.id === id) setTransportDetailOpen(false);
  };

  return {
    openCreateFlight,
    openEditFlight,
    submitFlight,
    removeFlight,
    openCreateStay,
    openEditStay,
    submitStay,
    removeStay,
    enrichStay,
    suggestAndSaveRestaurants,
    openCreateTransport,
    openEditTransport,
    submitTransport,
    removeTransport,
    enrichingStayId,
    suggestingRestaurantsStayId,
  };
}
