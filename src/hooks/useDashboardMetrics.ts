import { useMemo } from 'react';
import { Tables } from '@/integrations/supabase/types';
import {
  buildDayChips,
  dateDiffInDays,
  formatDate,
  normalizeDate,
  type ReservaStatus,
} from '@/pages/dashboardHelpers';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';

type CurrencyTotal = { currency: string; total: number };
type ExpenseByCategory = { categoria: string; total: number };
type ExpenseByDate = { data: string; total: number };
type UpcomingEvent = { id: string; tipo: string; titulo: string; data: string };

type DashboardMetricsParams = {
  currentTrip: Tables<'viagens'> | null;
  flights: Tables<'voos'>[];
  stays: Tables<'hospedagens'>[];
  transports: Tables<'transportes'>[];
  tasks: Tables<'tarefas'>[];
  expenses: Tables<'despesas'>[];
  restaurants: Tables<'restaurantes'>[];
  documents: Tables<'documentos'>[];
  selectedStay: Tables<'hospedagens'> | null;
  flightSearch: string;
  flightStatus: 'todos' | ReservaStatus;
  staySearch: string;
  stayStatus: 'todos' | ReservaStatus;
  transportSearch: string;
  transportStatus: 'todos' | ReservaStatus;
  taskSearch: string;
  userHomeCity: string | null;
  dismissedGapKeys: Set<string>;
};

export function useDashboardMetrics(params: DashboardMetricsParams) {
  const {
    currentTrip,
    flights,
    stays,
    transports,
    tasks,
    expenses,
    restaurants,
    documents,
    selectedStay,
    flightSearch,
    flightStatus,
    staySearch,
    stayStatus,
    transportSearch,
    transportStatus,
    taskSearch,
    userHomeCity,
    dismissedGapKeys,
  } = params;

  const flightsFiltered = useMemo(() => {
    return flights
      .filter((flight) => (flightStatus === 'todos' ? true : flight.status === flightStatus))
      .filter((flight) => {
        const bag = [flight.numero, flight.companhia, flight.origem, flight.destino].join(' ').toLowerCase();
        return bag.includes(flightSearch.toLowerCase());
      });
  }, [flightSearch, flightStatus, flights]);

  const staysFiltered = useMemo(() => {
    return stays
      .filter((stay) => (stayStatus === 'todos' ? true : stay.status === stayStatus))
      .filter((stay) => {
        const bag = [stay.nome, stay.localizacao].join(' ').toLowerCase();
        return bag.includes(staySearch.toLowerCase());
      });
  }, [staySearch, stayStatus, stays]);

  const transportFiltered = useMemo(() => {
    return transports
      .filter((transport) => (transportStatus === 'todos' ? true : transport.status === transportStatus))
      .filter((transport) => {
        const bag = [transport.tipo, transport.operadora, transport.origem, transport.destino].join(' ').toLowerCase();
        return bag.includes(transportSearch.toLowerCase());
      })
      .sort((left, right) => {
        if (!left.data) return 1;
        if (!right.data) return -1;
        return new Date(left.data).getTime() - new Date(right.data).getTime();
      });
  }, [transportSearch, transportStatus, transports]);

  const tasksFiltered = useMemo(() => {
    return tasks.filter((task) => {
      const bag = [task.titulo, task.categoria].join(' ').toLowerCase();
      return bag.includes(taskSearch.toLowerCase());
    });
  }, [taskSearch, tasks]);

  const realByCurrency = useMemo<CurrencyTotal[]>(() => {
    const map = new Map<string, number>();
    for (const expense of expenses) {
      const cur = expense.moeda?.toUpperCase() || 'BRL';
      map.set(cur, (map.get(cur) ?? 0) + Number(expense.valor ?? 0));
    }
    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [expenses]);

  const realTotal = useMemo(() => expenses.reduce((acc, item) => acc + Number(item.valor ?? 0), 0), [expenses]);

  const estimadoByCurrency = useMemo<CurrencyTotal[]>(() => {
    const map = new Map<string, number>();
    const allItems = [
      ...flights.filter((item) => item.status !== 'cancelado').map((item) => ({ valor: item.valor, moeda: item.moeda })),
      ...stays.filter((item) => item.status !== 'cancelado').map((item) => ({ valor: item.valor, moeda: item.moeda })),
      ...transports.filter((item) => item.status !== 'cancelado').map((item) => ({ valor: item.valor, moeda: item.moeda })),
    ];

    for (const item of allItems) {
      const cur = item.moeda?.toUpperCase() || 'BRL';
      map.set(cur, (map.get(cur) ?? 0) + Number(item.valor ?? 0));
    }
    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [flights, stays, transports]);

  const estimadoTotal = useMemo(() => {
    const moduleTotals = [...flights, ...stays, ...transports];
    return moduleTotals.reduce((acc, item) => {
      if (item.status === 'cancelado') return acc;
      return acc + Number(item.valor ?? 0);
    }, 0);
  }, [flights, stays, transports]);

  const variacaoTotal = realTotal - estimadoTotal;

  const expensesByCategory = useMemo<ExpenseByCategory[]>(() => {
    const map = new Map<string, number>();
    for (const expense of expenses) {
      const category = expense.categoria?.trim() || 'Sem categoria';
      map.set(category, (map.get(category) ?? 0) + Number(expense.valor ?? 0));
    }
    return Array.from(map.entries())
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const expensesByDate = useMemo<ExpenseByDate[]>(() => {
    const map = new Map<string, number>();
    for (const expense of expenses) {
      const date = expense.data || 'Sem data';
      map.set(date, (map.get(date) ?? 0) + Number(expense.valor ?? 0));
    }
    return Array.from(map.entries())
      .map(([data, total]) => ({ data, total }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [expenses]);

  const restaurantsFavorites = useMemo(() => restaurants.filter((item) => item.salvo), [restaurants]);

  const upcomingEvents = useMemo<UpcomingEvent[]>(() => {
    const now = new Date();
    const events: UpcomingEvent[] = [];

    for (const item of flights) {
      if (!item.data) continue;
      const date = new Date(item.data);
      if (date < now) continue;
      events.push({
        id: `voo-${item.id}`,
        tipo: 'Voo',
        titulo: `${item.origem || 'Origem'} → ${item.destino || 'Destino'}`,
        data: item.data,
      });
    }

    for (const item of transports) {
      if (!item.data) continue;
      const date = new Date(item.data);
      if (date < now) continue;
      events.push({
        id: `transporte-${item.id}`,
        tipo: 'Transporte',
        titulo: `${item.tipo || 'Deslocamento'} · ${item.origem || 'Origem'} → ${item.destino || 'Destino'}`,
        data: item.data,
      });
    }

    for (const item of stays) {
      if (!item.check_in) continue;
      const date = new Date(`${item.check_in}T12:00:00`);
      if (date < now) continue;
      events.push({
        id: `hospedagem-${item.id}`,
        tipo: 'Check-in',
        titulo: item.nome || 'Hospedagem',
        data: date.toISOString(),
      });
    }

    return events
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .slice(0, 8);
  }, [flights, stays, transports]);

  const stayCoverageGaps = useMemo(
    () => calculateStayCoverageGaps(stays, currentTrip?.data_inicio ?? null, currentTrip?.data_fim ?? null),
    [currentTrip?.data_fim, currentTrip?.data_inicio, stays],
  );

  const inferredHomeCity = useMemo(() => {
    if (userHomeCity) return userHomeCity;
    const firstFlight = flights
      .filter((flight) => flight.status !== 'cancelado' && flight.origem)
      .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))[0];
    return firstFlight?.origem ?? null;
  }, [flights, userHomeCity]);

  const transportCoverageGaps = useMemo(() => {
    return calculateTransportCoverageGaps(stays, transports, flights, inferredHomeCity);
  }, [flights, inferredHomeCity, stays, transports]);

  const stayGapLines = useMemo(() => {
    return stayCoverageGaps
      .slice(0, 3)
      .map((gap) => ({
        key: `stay-gap-${gap.start}-${gap.end}`,
        text: `Hospedagem: ${formatDate(gap.start)} até ${formatDate(gap.end)} (${gap.nights} noite(s)) sem reserva.`,
      }))
      .filter((gap) => !dismissedGapKeys.has(gap.key));
  }, [dismissedGapKeys, stayCoverageGaps]);

  const transportGapLines = useMemo(() => {
    return transportCoverageGaps
      .slice(0, 5)
      .map((gap) => ({
        key: `transport-gap-${gap.from}-${gap.to}-${gap.referenceDate ?? 'sem-data'}`,
        text: `Transporte: ${gap.from} → ${gap.to} — ${gap.reason}`,
        from: gap.from,
        to: gap.to,
        mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(gap.from)}&destination=${encodeURIComponent(gap.to)}&travelmode=transit`,
      }))
      .filter((gap) => !dismissedGapKeys.has(gap.key));
  }, [dismissedGapKeys, transportCoverageGaps]);

  const heroDateRangeLabel = useMemo(() => {
    const start = currentTrip?.data_inicio ? formatDate(currentTrip.data_inicio) : '';
    const end = currentTrip?.data_fim ? formatDate(currentTrip.data_fim) : '';
    if (start && end) return `${start} - ${end}`;
    return start || end || '';
  }, [currentTrip?.data_fim, currentTrip?.data_inicio]);

  const selectedStayDocuments = useMemo(() => {
    if (!selectedStay) return [];
    const tokens = [selectedStay.nome, selectedStay.localizacao]
      .map((value) => value?.toLowerCase().trim())
      .filter((value): value is string => !!value);
    if (tokens.length === 0) return [];

    return documents.filter((doc) => {
      const bag = `${doc.nome} ${doc.arquivo_url || ''}`.toLowerCase();
      return tokens.some((token) => bag.includes(token));
    });
  }, [documents, selectedStay]);

  const stayNightsTotal = useMemo(() => {
    return stays
      .filter((stay) => stay.status !== 'cancelado')
      .reduce((total, stay) => {
        if (!stay.check_in || !stay.check_out) return total;
        const start = normalizeDate(stay.check_in);
        const end = normalizeDate(stay.check_out);
        if (!start || !end) return total;
        return total + dateDiffInDays(start, end);
      }, 0);
  }, [stays]);

  const flightDayChips = useMemo(() => {
    return buildDayChips(flightsFiltered, (flight) => normalizeDate(flight.data), (flight) => flight.status);
  }, [flightsFiltered]);

  const stayDayChips = useMemo(() => {
    return buildDayChips(staysFiltered, (stay) => stay.check_in, (stay) => stay.status);
  }, [staysFiltered]);

  const transportDayChips = useMemo(() => {
    return buildDayChips(transportFiltered, (transport) => normalizeDate(transport.data), (transport) => transport.status);
  }, [transportFiltered]);

  const daysUntilTrip = useMemo(() => {
    const start = normalizeDate(currentTrip?.data_inicio);
    if (!start) return null;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return dateDiffInDays(today, start);
  }, [currentTrip?.data_inicio]);

  const flightStats = useMemo(() => {
    const active = flightsFiltered.filter((flight) => flight.status !== 'cancelado');
    const confirmed = active.filter((flight) => flight.status === 'confirmado').length;
    const byCurrency = new Map<string, number>();
    for (const flight of active) {
      const cur = flight.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(flight.valor ?? 0));
    }
    return {
      total: flightsFiltered.length,
      confirmed,
      byCurrency: Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total })),
    };
  }, [flightsFiltered]);

  const stayStats = useMemo(() => {
    const active = staysFiltered.filter((stay) => stay.status !== 'cancelado');
    const byCurrency = new Map<string, number>();
    for (const stay of active) {
      const cur = stay.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(stay.valor ?? 0));
    }
    const cities = new Set(active.map((stay) => stay.localizacao?.trim()).filter(Boolean));
    return {
      total: staysFiltered.length,
      active: active.length,
      byCurrency: Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total })),
      cities: cities.size,
    };
  }, [staysFiltered]);

  const transportStats = useMemo(() => {
    const active = transportFiltered.filter((transport) => transport.status !== 'cancelado');
    const confirmed = active.filter((transport) => transport.status === 'confirmado').length;
    const byCurrency = new Map<string, number>();
    for (const transport of active) {
      const cur = transport.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(transport.valor ?? 0));
    }
    return {
      total: transportFiltered.length,
      confirmed,
      byCurrency: Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total })),
    };
  }, [transportFiltered]);

  return {
    flightsFiltered,
    staysFiltered,
    transportFiltered,
    tasksFiltered,
    realByCurrency,
    realTotal,
    estimadoByCurrency,
    estimadoTotal,
    variacaoTotal,
    expensesByCategory,
    expensesByDate,
    restaurantsFavorites,
    upcomingEvents,
    stayCoverageGaps,
    inferredHomeCity,
    transportCoverageGaps,
    stayGapLines,
    transportGapLines,
    heroDateRangeLabel,
    selectedStayDocuments,
    stayNightsTotal,
    flightDayChips,
    stayDayChips,
    transportDayChips,
    daysUntilTrip,
    flightStats,
    stayStats,
    transportStats,
  };
}
