import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useTripSummary } from '@/hooks/useModuleData';
import { useTripMembers } from '@/hooks/useTripMembers';
import {
  useDocuments,
  useExpenses,
  useFlights,
  useLuggage,
  usePreparativos,
  useRestaurants,
  useRoteiro,
  useStays,
  useTasks,
  useTransports,
  useTravelers,
} from '@/hooks/useTripModules';
import { TripCoverageAlert } from '@/components/dashboard/TripCoverageAlert';
import { TripHero } from '@/components/dashboard/TripHero';
import { TripStatsGrid } from '@/components/dashboard/TripStatsGrid';
import { TripTopActions } from '@/components/dashboard/TripTopActions';
import { TripCollaborationBanner, TripViewerNotice } from '@/components/dashboard/TripCollaborationPanels';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { generateStayTips, suggestRestaurants, generateTripTasks, generateItinerary } from '@/services/ai';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTripExportActions } from '@/hooks/useTripExportActions';
import { useSupportResources } from '@/hooks/useSupportResources';
import {
  buildDayChips,
  buildMapsUrl,
  buildTransportInsights,
  DASHBOARD_TABS,
  dateDiffInDays,
  emptyExpense,
  emptyFlight,
  emptyRestaurant,
  emptyStay,
  emptyTask,
  emptyTransport,
  formatByCurrency,
  formatCurrency,
  formatDate,
  formatDateShort,
  formatDateTime,
  normalizeDate,
  prioridadeBadge,
  splitInsightList,
  statCards,
  statusBadge,
  stayHighlight,
  toDateTimeLocal,
  transportReservationCode,
  tripCoverImage,
  type ExpenseFormState,
  type FlightFormState,
  type ReservaStatus,
  type RestaurantFormState,
  type StayFormState,
  type TarefaPrioridade,
  type TaskFormState,
  type TransportFormState,
} from './dashboardHelpers';

const ImportReservationDialog = lazy(() =>
  import('@/components/import/ImportReservationDialog').then((mod) => ({ default: mod.ImportReservationDialog })),
);
const OverviewTabPanel = lazy(() =>
  import('@/components/dashboard/OverviewTabPanel').then((mod) => ({ default: mod.OverviewTabPanel })),
);
const FlightsTabPanel = lazy(() =>
  import('@/components/dashboard/FlightsTabPanel').then((mod) => ({ default: mod.FlightsTabPanel })),
);
const StaysTabPanel = lazy(() =>
  import('@/components/dashboard/StaysTabPanel').then((mod) => ({ default: mod.StaysTabPanel })),
);
const TransportsTabPanel = lazy(() =>
  import('@/components/dashboard/TransportsTabPanel').then((mod) => ({ default: mod.TransportsTabPanel })),
);
const TasksTabPanel = lazy(() =>
  import('@/components/dashboard/TasksTabPanel').then((mod) => ({ default: mod.TasksTabPanel })),
);
const RoteiroTabPanel = lazy(() =>
  import('@/components/dashboard/RoteiroTabPanel').then((mod) => ({ default: mod.RoteiroTabPanel })),
);
const ExpensesTabPanel = lazy(() =>
  import('@/components/dashboard/ExpensesTabPanel').then((mod) => ({ default: mod.ExpensesTabPanel })),
);
const BudgetTabPanel = lazy(() =>
  import('@/components/dashboard/BudgetTabPanel').then((mod) => ({ default: mod.BudgetTabPanel })),
);
const GastronomyTabPanel = lazy(() =>
  import('@/components/dashboard/GastronomyTabPanel').then((mod) => ({ default: mod.GastronomyTabPanel })),
);
const SupportTabPanel = lazy(() =>
  import('@/components/dashboard/SupportTabPanel').then((mod) => ({ default: mod.SupportTabPanel })),
);

function TabPanelFallback({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
      Carregando {label}...
    </div>
  );
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { currentTrip, currentTripId, trips, loading: tripLoading, selectTrip } = useTrip();
  const tripMembers = useTripMembers(currentTripId);
  const navigate = useNavigate();
  const { data: counts, isLoading: countsLoading } = useTripSummary();
  const flightsModule = useFlights();
  const staysModule = useStays();
  const transportsModule = useTransports();
  const tasksModule = useTasks();
  const expensesModule = useExpenses();
  const restaurantsModule = useRestaurants();
  const documentsModule = useDocuments();
  const luggageModule = useLuggage();
  const travelersModule = useTravelers();
  const prepModule = usePreparativos();
  const roteiroModule = useRoteiro();

  const [activeTab, setActiveTab] = useState('visao');

  const [flightSearch, setFlightSearch] = useState('');
  const [flightStatus, setFlightStatus] = useState<'todos' | ReservaStatus>('todos');
  const [flightDialogOpen, setFlightDialogOpen] = useState(false);
  const [flightDetailOpen, setFlightDetailOpen] = useState(false);
  const [flightForm, setFlightForm] = useState<FlightFormState>(emptyFlight);
  const [editingFlight, setEditingFlight] = useState<Tables<'voos'> | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<Tables<'voos'> | null>(null);

  const [staySearch, setStaySearch] = useState('');
  const [stayStatus, setStayStatus] = useState<'todos' | ReservaStatus>('todos');
  const [stayDialogOpen, setStayDialogOpen] = useState(false);
  const [stayDetailOpen, setStayDetailOpen] = useState(false);
  const [stayForm, setStayForm] = useState<StayFormState>(emptyStay);
  const [editingStay, setEditingStay] = useState<Tables<'hospedagens'> | null>(null);
  const [selectedStay, setSelectedStay] = useState<Tables<'hospedagens'> | null>(null);
  const [enrichingStayId, setEnrichingStayId] = useState<string | null>(null);
  const [suggestingRestaurantsStayId, setSuggestingRestaurantsStayId] = useState<string | null>(null);

  const [transportSearch, setTransportSearch] = useState('');
  const [transportStatus, setTransportStatus] = useState<'todos' | ReservaStatus>('todos');
  const [transportDialogOpen, setTransportDialogOpen] = useState(false);
  const [transportDetailOpen, setTransportDetailOpen] = useState(false);
  const [transportForm, setTransportForm] = useState<TransportFormState>(emptyTransport);
  const [editingTransport, setEditingTransport] = useState<Tables<'transportes'> | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<Tables<'transportes'> | null>(null);

  const [taskSearch, setTaskSearch] = useState('');
  const [taskForm, setTaskForm] = useState<TaskFormState>(emptyTask);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(emptyExpense);
  const [restaurantForm, setRestaurantForm] = useState<RestaurantFormState>(emptyRestaurant);
  const [isReconciling, setIsReconciling] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const fallbackCanEdit = !!currentTrip && currentTrip.user_id === user?.id;
  const canEditTrip = tripMembers.permission.role ? tripMembers.permission.canEdit : fallbackCanEdit;
  const aiImportGate = useFeatureGate('ff_ai_import_enabled');
  const collabGate = useFeatureGate('ff_collab_enabled');
  const exportPdfGate = useFeatureGate('ff_export_pdf');
  const exportJsonGate = useFeatureGate('ff_export_json_full');
  const publicApiGate = useFeatureGate('ff_public_api_access');
  const webhookGate = useFeatureGate('ff_webhooks_enabled');
  const { isExportingData, exportJson, exportPdf } = useTripExportActions(currentTripId);
  const supportResources = useSupportResources({
    canEditTrip,
    documentsModule,
    luggageModule,
    travelersModule,
    prepModule,
  });
  const isAnyCrudDialogOpen =
    flightDialogOpen ||
    flightDetailOpen ||
    stayDialogOpen ||
    stayDetailOpen ||
    transportDialogOpen ||
    transportDetailOpen ||
    expenseDialogOpen;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('tp-any-dialog-open', isAnyCrudDialogOpen);
    return () => {
      document.body.classList.remove('tp-any-dialog-open');
    };
  }, [isAnyCrudDialogOpen]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const ensureCanEdit = () => {
    if (canEditTrip) return true;
    toast.error('Você está com papel de visualização nesta viagem.');
    return false;
  };

  const flightsFiltered = useMemo(() => {
    return flightsModule.data
      .filter((f) => (flightStatus === 'todos' ? true : f.status === flightStatus))
      .filter((f) => {
        const bag = [f.numero, f.companhia, f.origem, f.destino].join(' ').toLowerCase();
        return bag.includes(flightSearch.toLowerCase());
      });
  }, [flightsModule.data, flightSearch, flightStatus]);

  const staysFiltered = useMemo(() => {
    return staysModule.data
      .filter((h) => (stayStatus === 'todos' ? true : h.status === stayStatus))
      .filter((h) => {
        const bag = [h.nome, h.localizacao].join(' ').toLowerCase();
        return bag.includes(staySearch.toLowerCase());
      });
  }, [staysModule.data, staySearch, stayStatus]);

  const transportFiltered = useMemo(() => {
    return transportsModule.data
      .filter((t) => (transportStatus === 'todos' ? true : t.status === transportStatus))
      .filter((t) => {
        const bag = [t.tipo, t.operadora, t.origem, t.destino].join(' ').toLowerCase();
        return bag.includes(transportSearch.toLowerCase());
      })
      .sort((a, b) => {
        if (!a.data) return 1;
        if (!b.data) return -1;
        return new Date(a.data).getTime() - new Date(b.data).getTime();
      });
  }, [transportsModule.data, transportSearch, transportStatus]);

  const tasksFiltered = useMemo(() => {
    return tasksModule.data.filter((task) => {
      const bag = [task.titulo, task.categoria].join(' ').toLowerCase();
      return bag.includes(taskSearch.toLowerCase());
    });
  }, [taskSearch, tasksModule.data]);

  const realByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of expensesModule.data) {
      const cur = item.moeda?.toUpperCase() || 'BRL';
      map.set(cur, (map.get(cur) ?? 0) + Number(item.valor ?? 0));
    }
    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [expensesModule.data]);

  const realTotal = useMemo(() => {
    return expensesModule.data.reduce((acc, item) => acc + Number(item.valor ?? 0), 0);
  }, [expensesModule.data]);

  const estimadoByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    const allItems = [
      ...flightsModule.data.filter(i => i.status !== 'cancelado').map(i => ({ valor: i.valor, moeda: i.moeda, source: 'Voos' })),
      ...staysModule.data.filter(i => i.status !== 'cancelado').map(i => ({ valor: i.valor, moeda: i.moeda, source: 'Hospedagens' })),
      ...transportsModule.data.filter(i => i.status !== 'cancelado').map(i => ({ valor: i.valor, moeda: i.moeda, source: 'Transportes' })),
    ];
    for (const item of allItems) {
      const cur = item.moeda?.toUpperCase() || 'BRL';
      map.set(cur, (map.get(cur) ?? 0) + Number(item.valor ?? 0));
    }
    return Array.from(map.entries()).map(([currency, total]) => ({ currency, total }));
  }, [flightsModule.data, staysModule.data, transportsModule.data]);

  const estimadoTotal = useMemo(() => {
    const moduleTotals = [flightsModule.data, staysModule.data, transportsModule.data].flat();
    return moduleTotals.reduce((acc, item) => {
      if (item.status === 'cancelado') return acc;
      return acc + Number(item.valor ?? 0);
    }, 0);
  }, [flightsModule.data, staysModule.data, transportsModule.data]);

  const variacaoTotal = realTotal - estimadoTotal;

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of expensesModule.data) {
      const category = (item.categoria?.trim() || 'Sem categoria');
      map.set(category, (map.get(category) ?? 0) + Number(item.valor ?? 0));
    }

    return Array.from(map.entries())
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  }, [expensesModule.data]);

  const expensesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of expensesModule.data) {
      const date = item.data || 'Sem data';
      map.set(date, (map.get(date) ?? 0) + Number(item.valor ?? 0));
    }
    return Array.from(map.entries())
      .map(([data, total]) => ({ data, total }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [expensesModule.data]);

  const restaurantsFavorites = useMemo(() => {
    return restaurantsModule.data.filter((item) => item.salvo);
  }, [restaurantsModule.data]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const events: { id: string; tipo: string; titulo: string; data: string }[] = [];

    flightsModule.data.forEach((item) => {
      if (!item.data) return;
      const dt = new Date(item.data);
      if (dt < now) return;
      events.push({
        id: `voo-${item.id}`,
        tipo: 'Voo',
        titulo: `${item.origem || 'Origem'} → ${item.destino || 'Destino'}`,
        data: item.data,
      });
    });

    transportsModule.data.forEach((item) => {
      if (!item.data) return;
      const dt = new Date(item.data);
      if (dt < now) return;
      events.push({
        id: `transporte-${item.id}`,
        tipo: 'Transporte',
        titulo: `${item.tipo || 'Deslocamento'} · ${item.origem || 'Origem'} → ${item.destino || 'Destino'}`,
        data: item.data,
      });
    });

    staysModule.data.forEach((item) => {
      if (!item.check_in) return;
      const dt = new Date(`${item.check_in}T12:00:00`);
      if (dt < now) return;
      events.push({
        id: `hospedagem-${item.id}`,
        tipo: 'Check-in',
        titulo: item.nome || 'Hospedagem',
        data: dt.toISOString(),
      });
    });

    return events
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
      .slice(0, 8);
  }, [flightsModule.data, transportsModule.data, staysModule.data]);

  const stayCoverageGaps = useMemo(() => {
    return calculateStayCoverageGaps(
      staysModule.data,
      currentTrip?.data_inicio ?? null,
      currentTrip?.data_fim ?? null,
    );
  }, [currentTrip?.data_fim, currentTrip?.data_inicio, staysModule.data]);

  const [userHomeCity, setUserHomeCity] = useState<string | null>(null);

  const loadProfile = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[dashboard][profile_load_failed]', error);
      return;
    }

    if (data) {
      setProfile(data as Tables<'profiles'>);
      if (data.cidade_origem) {
        setUserHomeCity(data.cidade_origem);
      }
    }
  };

  // Load user profile cidade_origem
  useEffect(() => {
    void loadProfile();
  }, [user?.id]);

  // Infer home city from first flight when profile cidade_origem is null
  const inferredHomeCity = useMemo(() => {
    if (userHomeCity) return userHomeCity;
    const firstFlight = flightsModule.data
      .filter((f) => f.status !== 'cancelado' && f.origem)
      .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))[0];
    return firstFlight?.origem ?? null;
  }, [userHomeCity, flightsModule.data]);

  const transportCoverageGaps = useMemo(() => {
    return calculateTransportCoverageGaps(staysModule.data, transportsModule.data, flightsModule.data, inferredHomeCity);
  }, [flightsModule.data, staysModule.data, transportsModule.data, inferredHomeCity]);

  const [dismissedGapKeys, setDismissedGapKeys] = useState<Set<string>>(new Set());

  const handleDismissGap = (key: string) => {
    setDismissedGapKeys((prev) => new Set(prev).add(key));
  };

  const stayGapLines = useMemo(() => {
    return stayCoverageGaps.slice(0, 3).map((gap) => ({
      key: `stay-gap-${gap.start}-${gap.end}`,
      text: `Hospedagem: ${formatDate(gap.start)} até ${formatDate(gap.end)} (${gap.nights} noite(s)) sem reserva.`,
    })).filter((g) => !dismissedGapKeys.has(g.key));
  }, [stayCoverageGaps, dismissedGapKeys]);

  const transportGapLines = useMemo(() => {
    return transportCoverageGaps.slice(0, 5).map((gap) => {
      const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(gap.from)}&destination=${encodeURIComponent(gap.to)}&travelmode=transit`;
      return {
        key: `transport-gap-${gap.from}-${gap.to}-${gap.referenceDate ?? 'sem-data'}`,
        text: `Transporte: ${gap.from} → ${gap.to} — ${gap.reason}`,
        from: gap.from,
        to: gap.to,
        mapsUrl,
      };
    }).filter((g) => !dismissedGapKeys.has(g.key));
  }, [transportCoverageGaps, dismissedGapKeys]);

  const handleAddTransportFromGap = async (from: string, to: string) => {
    if (!ensureCanEdit()) return;
    try {
      await transportsModule.create({
        tipo: 'Terrestre',
        operadora: null,
        origem: from,
        destino: to,
        data: null,
        status: 'pendente',
        valor: null,
        moeda: 'BRL',
      });
      toast.success(`Transporte ${from} → ${to} adicionado com sucesso!`);
    } catch {
      toast.error('Erro ao adicionar transporte.');
    }
  };

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

    return documentsModule.data.filter((doc) => {
      const bag = `${doc.nome} ${doc.arquivo_url || ''}`.toLowerCase();
      return tokens.some((token) => bag.includes(token));
    });
  }, [documentsModule.data, selectedStay]);

  const stayNightsTotal = useMemo(() => {
    return staysModule.data
      .filter((stay) => stay.status !== 'cancelado')
      .reduce((total, stay) => {
        if (!stay.check_in || !stay.check_out) return total;
        const start = normalizeDate(stay.check_in);
        const end = normalizeDate(stay.check_out);
        if (!start || !end) return total;
        return total + dateDiffInDays(start, end);
      }, 0);
  }, [staysModule.data]);

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
    for (const f of active) {
      const cur = f.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(f.valor ?? 0));
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
    for (const s of active) {
      const cur = s.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(s.valor ?? 0));
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
    for (const t of active) {
      const cur = t.moeda?.toUpperCase() || 'BRL';
      byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + Number(t.valor ?? 0));
    }
    return {
      total: transportFiltered.length,
      confirmed,
      byCurrency: Array.from(byCurrency.entries()).map(([currency, total]) => ({ currency, total })),
    };
  }, [transportFiltered]);

  const supportIsLoading =
    documentsModule.isLoading ||
    luggageModule.isLoading ||
    travelersModule.isLoading ||
    prepModule.isLoading;

  const supportError =
    documentsModule.error ||
    luggageModule.error ||
    travelersModule.error ||
    prepModule.error;
  const dashboardError =
    flightsModule.error ||
    staysModule.error ||
    transportsModule.error ||
    tasksModule.error ||
    expensesModule.error ||
    restaurantsModule.error ||
    supportError;

  useEffect(() => {
    if (flightDialogOpen) setFlightDetailOpen(false);
  }, [flightDialogOpen]);

  useEffect(() => {
    if (stayDialogOpen) setStayDetailOpen(false);
  }, [stayDialogOpen]);

  useEffect(() => {
    if (transportDialogOpen) setTransportDetailOpen(false);
  }, [transportDialogOpen]);

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

  const enrichStay = async (stay: Tables<'hospedagens'>, silent: boolean = false) => {
    if (!ensureCanEdit()) return;
    setEnrichingStayId(stay.id);
    try {
      // Buscar voo relevante para contexto de rota
      const flights = flightsModule.data ?? [];
      const relevantFlight = flights.find(f =>
        f.destino && stay.localizacao?.toLowerCase().includes(f.destino.toLowerCase())
      ) ?? flights[0] ?? null;

      const result = await generateStayTips({
        hotelName: stay.nome,
        location: stay.localizacao,
        checkIn: stay.check_in,
        checkOut: stay.check_out,
        tripDestination: currentTrip?.destino,
        flightOrigin: relevantFlight?.origem ?? null,
        flightDestination: relevantFlight?.destino ?? null,
        userHomeCity: userHomeCity,
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
      setEnrichingStayId((curr) => (curr === stay.id ? null : curr));
    }
  };

  const suggestAndSaveRestaurants = async (stay: Tables<'hospedagens'>) => {
    if (!ensureCanEdit()) return;
    setSuggestingRestaurantsStayId(stay.id);
    try {
      const result = await suggestRestaurants({
        city: stay.localizacao,
        location: stay.localizacao,
        tripDestination: currentTrip?.destino,
      });

      const suggestions = result.data ?? [];
      if (suggestions.length === 0) {
        toast.warning('Nenhuma sugestão disponível no momento.');
        return;
      }

      const existing = new Set(restaurantsModule.data.map((r) => r.nome.trim().toLowerCase()));
      const uniqueSuggestions = suggestions.filter((s) => !existing.has(s.nome.trim().toLowerCase()));

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
      setSuggestingRestaurantsStayId((curr) => (curr === stay.id ? null : curr));
    }
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

  const createTask = async () => {
    if (!ensureCanEdit()) return;
    if (!taskForm.titulo.trim()) return;
    const payload: Omit<TablesInsert<'tarefas'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
      titulo: taskForm.titulo.trim(),
      categoria: taskForm.categoria.trim() || null,
      prioridade: taskForm.prioridade,
      concluida: false,
    };
    await tasksModule.create(payload);
    setTaskForm(emptyTask);
  };

  const toggleTask = async (task: Tables<'tarefas'>) => {
    if (!ensureCanEdit()) return;
    await tasksModule.update({
      id: task.id,
      updates: {
        concluida: !task.concluida,
      },
    });
  };

  const removeTask = async (id: string) => {
    if (!ensureCanEdit()) return;
    await tasksModule.remove(id);
  };

  const generateTasksWithAi = async () => {
    if (!ensureCanEdit()) return;
    setGeneratingTasks(true);
    try {
      const result = await generateTripTasks({
        destination: currentTrip?.destino,
        startDate: currentTrip?.data_inicio,
        endDate: currentTrip?.data_fim,
        userHomeCity,
        flights: flightsModule.data.map((f) => ({ origem: f.origem, destino: f.destino })),
        stays: staysModule.data.map((s) => ({ localizacao: s.localizacao, check_in: s.check_in })),
        existingTasks: tasksModule.data.map((t) => t.titulo),
      });
      if (result.data && result.data.length > 0) {
        let created = 0;
        for (const task of result.data) {
          try {
            await tasksModule.create({
              titulo: task.titulo,
              categoria: task.categoria,
              prioridade: task.prioridade as TarefaPrioridade,
            });
            created++;
          } catch {
            // Skip possible duplicates.
          }
        }
        toast.success(`${created} tarefa(s) gerada(s) por IA.`);
      } else {
        toast.error(result.error || 'Não foi possível gerar tarefas.');
      }
    } catch {
      toast.error('Erro ao gerar tarefas com IA.');
    } finally {
      setGeneratingTasks(false);
    }
  };

  const generateRoteiroWithAi = async () => {
    if (!ensureCanEdit()) return;
    setGeneratingItinerary(true);
    try {
      const result = await generateItinerary({
        destination: currentTrip?.destino,
        startDate: currentTrip?.data_inicio,
        endDate: currentTrip?.data_fim,
        userHomeCity,
        stays: staysModule.data.map((s) => ({
          nome: s.nome,
          localizacao: s.localizacao,
          check_in: s.check_in,
          check_out: s.check_out,
          hora_check_in: '15:00',
          hora_check_out: '11:00',
          atracoes_proximas: s.atracoes_proximas,
          restaurantes_proximos: s.restaurantes_proximos,
          dica_viagem: s.dica_viagem,
        })),
        flights: flightsModule.data.map((f) => {
          const dt = f.data ? new Date(f.data) : null;
          const hora = dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(11, 16) : null;
          return {
            origem: f.origem,
            destino: f.destino,
            data: f.data,
            hora_partida: hora,
            hora_chegada: hora,
          };
        }),
        transports: transportsModule.data.map((t) => {
          const dt = t.data ? new Date(t.data) : null;
          const hora = dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(11, 16) : null;
          return { tipo: t.tipo, origem: t.origem, destino: t.destino, data: t.data, hora };
        }),
        restaurants: restaurantsModule.data.filter((r) => r.salvo).map((r) => ({ nome: r.nome, cidade: r.cidade, tipo: r.tipo })),
      });
      if (result.data && result.data.length > 0) {
        const existingAi = roteiroModule.data.filter((r) => r.sugerido_por_ia);
        for (const item of existingAi) {
          try { await roteiroModule.remove(item.id); } catch { /* ignore */ }
        }
        let created = 0;
        for (const item of result.data) {
          try {
            await roteiroModule.create({
              dia: item.dia,
              ordem: item.ordem,
              titulo: item.titulo,
              descricao: item.descricao,
              horario_sugerido: item.horario_sugerido,
              categoria: item.categoria,
              localizacao: item.localizacao,
              link_maps: item.link_maps,
              sugerido_por_ia: true,
            } as any);
            created++;
          } catch { /* skip */ }
        }
        toast.success(`Roteiro gerado: ${created} atividade(s).`);
      } else {
        toast.error(result.error || 'Não foi possível gerar o roteiro.');
      }
    } catch {
      toast.error('Erro ao gerar roteiro com IA.');
    } finally {
      setGeneratingItinerary(false);
    }
  };

  const reorderRoteiroItem = async (current: Tables<'roteiro'>, target: Tables<'roteiro'>) => {
    if (!ensureCanEdit()) return;
    await roteiroModule.update({ id: current.id, updates: { ordem: target.ordem } });
    await roteiroModule.update({ id: target.id, updates: { ordem: current.ordem } });
  };

  const removeRoteiroItem = async (id: string) => {
    if (!ensureCanEdit()) return;
    await roteiroModule.remove(id);
  };

  const createExpense = async () => {
    if (!ensureCanEdit()) return;
    if (!expenseForm.titulo.trim() || !expenseForm.valor) return;
    const payload: Omit<TablesInsert<'despesas'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
      titulo: expenseForm.titulo.trim(),
      valor: Number(expenseForm.valor),
      moeda: expenseForm.moeda.trim() || 'BRL',
      categoria: expenseForm.categoria.trim() || null,
      data: expenseForm.data || null,
    };
    await expensesModule.create(payload);
    setExpenseForm(emptyExpense);
    setExpenseDialogOpen(false);
  };

  const removeExpense = async (id: string) => {
    if (!ensureCanEdit()) return;
    await expensesModule.remove(id);
  };

  const reconcileFromServer = async () => {
    setIsReconciling(true);
    try {
      await Promise.all([
        flightsModule.refetch(),
        staysModule.refetch(),
        transportsModule.refetch(),
        tasksModule.refetch(),
        expensesModule.refetch(),
        restaurantsModule.refetch(),
        documentsModule.refetch(),
        luggageModule.refetch(),
        travelersModule.refetch(),
        prepModule.refetch(),
        tripMembers.refetchMembers(),
        tripMembers.refetchInvites(),
      ]);
      toast.success('Dados reconciliados com o banco.');
    } catch (error) {
      console.error('[dashboard][reconcile_failure]', error);
      toast.error('Não foi possível reconciliar os dados agora.');
    } finally {
      setIsReconciling(false);
    }
  };

  const createRestaurant = async () => {
    if (!ensureCanEdit()) return;
    if (!restaurantForm.nome.trim()) return;
    await restaurantsModule.create({
      nome: restaurantForm.nome.trim(),
      cidade: restaurantForm.cidade.trim() || null,
      tipo: restaurantForm.tipo.trim() || null,
      rating: restaurantForm.rating ? Number(restaurantForm.rating) : null,
      salvo: true,
    });
    setRestaurantForm(emptyRestaurant);
  };

  const toggleRestaurantFavorite = async (restaurant: Tables<'restaurantes'>) => {
    if (!ensureCanEdit()) return;
    await restaurantsModule.update({
      id: restaurant.id,
      updates: { salvo: !restaurant.salvo },
    });
  };

  const removeRestaurant = async (id: string) => {
    if (!ensureCanEdit()) return;
    await restaurantsModule.remove(id);
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
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-50/70 to-slate-100/70">
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-white/92 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1220px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold font-display leading-none sm:text-xl">Trip Planner Foundation</h1>
              <p className="mt-1 hidden truncate text-[11px] text-muted-foreground sm:block sm:text-xs">Experiência co-brand LATAM Airlines + LATAM Pass</p>
            </div>
          </div>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:gap-3">
            {trips.length > 1 && (
              <Select value={currentTripId ?? ''} onValueChange={selectTrip}>
                <SelectTrigger className="h-9 w-[160px] sm:w-[200px]">
                  <SelectValue placeholder="Selecionar viagem" />
                </SelectTrigger>
                <SelectContent>
                  {trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="hidden text-sm text-muted-foreground lg:block">{user?.email}</span>
            <Button variant="outline" size="sm" className="h-9 px-3" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1220px] px-4 py-8 sm:px-6">
        {currentTrip ? (
          <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
            <aside className="hidden xl:block">
              <div className="tp-surface sticky top-[96px] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Módulos</p>
                <div className="mt-3 space-y-1">
                  {DASHBOARD_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                        activeTab === tab.key
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <section>
            <TripHero
              name={currentTrip.nome}
              status={currentTrip.status}
              daysUntilTrip={daysUntilTrip}
              destinationLabel={currentTrip.destino ?? 'Destino a definir'}
              dateRangeLabel={heroDateRangeLabel}
              coverImage={tripCoverImage(currentTrip.destino)}
            />

            <TripTopActions
              isReconciling={isReconciling}
              onReconcile={reconcileFromServer}
              showManageUsers={collabGate.enabled}
              onManageUsers={() => setActiveTab('apoio')}
            >
              {canEditTrip ? (
                aiImportGate.enabled ? (
                  <Suspense fallback={<Button disabled>Carregando importação...</Button>}>
                    <div className="flex gap-2 flex-wrap">
                      <ImportReservationDialog />
                    </div>
                  </Suspense>
                ) : (
                  <Button disabled variant="outline">
                    Importação IA indisponível no plano atual
                  </Button>
                )
              ) : (
                <Button disabled variant="outline">
                  Importação disponível para owner/editor
                </Button>
              )}
            </TripTopActions>

            <TripCollaborationBanner onManageUsers={() => setActiveTab('apoio')} />

            <TripViewerNotice visible={tripMembers.permission.role === 'viewer' && !canEditTrip} />

            <TripCoverageAlert stayGapLines={stayGapLines} transportGapLines={transportGapLines} onAddTransport={handleAddTransportFromGap} onDismissGap={handleDismissGap} />

            <TripStatsGrid cards={statCards} counts={counts as Record<string, number> | undefined} isLoading={countsLoading} />

            {dashboardError && (
              <Card className="mt-6 border-rose-500/30 bg-rose-500/5" role="alert" aria-live="polite">
                <CardContent className="p-4">
                  <p className="font-medium text-rose-800">Encontramos um problema ao carregar parte dos dados.</p>
                  <p className="mt-1 text-sm text-rose-700">
                    Recarregue a página ou use “Reconciliar dados”. Se persistir, faça login novamente.
                  </p>
                </CardContent>
              </Card>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
              <div className="overflow-x-auto pb-1 tp-scroll">
                <TabsList
                  className="inline-flex h-auto w-max min-w-full snap-x snap-mandatory items-center gap-2 rounded-2xl border border-primary/15 bg-white/90 p-2 shadow-sm"
                  aria-label="Navegação entre módulos da viagem"
                >
                  {DASHBOARD_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.key}
                      value={tab.key}
                      className="min-h-9 shrink-0 snap-start whitespace-nowrap gap-2 rounded-xl px-3 py-2 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm sm:min-h-10 sm:px-4 sm:text-sm"
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value="visao" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="dashboard" />}>
                  <OverviewTabPanel
                    upcomingEvents={upcomingEvents}
                    formatDateTime={formatDateTime}
                    stayCoverageGapCount={stayCoverageGaps.length}
                    transportCoverageGapCount={transportCoverageGaps.length}
                    restaurantsSavedCount={restaurantsFavorites.length}
                    documentsCount={documentsModule.data.length}
                    travelersCount={travelersModule.data.length}
                    realTotal={realTotal}
                    estimadoTotal={estimadoTotal}
                    formatCurrency={formatCurrency}
                    isAnyCrudDialogOpen={isAnyCrudDialogOpen}
                    stays={staysModule.data}
                    transports={transportsModule.data}
                    flights={flightsModule.data}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="voos" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="voos" />}>
                  <FlightsTabPanel
                    canEditTrip={canEditTrip}
                    flightDialogOpen={flightDialogOpen}
                    setFlightDialogOpen={setFlightDialogOpen}
                    openCreateFlight={openCreateFlight}
                    editingFlight={editingFlight}
                    flightForm={flightForm}
                    setFlightForm={setFlightForm}
                    submitFlight={submitFlight}
                    isCreatingFlight={flightsModule.isCreating}
                    isUpdatingFlight={flightsModule.isUpdating}
                    flightSearch={flightSearch}
                    setFlightSearch={setFlightSearch}
                    flightStatus={flightStatus}
                    setFlightStatus={setFlightStatus}
                    flightStats={flightStats}
                    formatByCurrency={formatByCurrency}
                    flightDayChips={flightDayChips}
                    flightsLoading={flightsModule.isLoading}
                    flightsFiltered={flightsFiltered}
                    onSelectFlight={(flight) => {
                      setSelectedFlight(flight);
                      setFlightDetailOpen(true);
                    }}
                    buildMapsUrl={buildMapsUrl}
                    statusBadge={statusBadge}
                    openEditFlight={openEditFlight}
                    removeFlight={removeFlight}
                    isRemovingFlight={flightsModule.isRemoving}
                    flightDetailOpen={flightDetailOpen}
                    setFlightDetailOpen={setFlightDetailOpen}
                    selectedFlight={selectedFlight}
                    formatDateTime={formatDateTime}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="hospedagens" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="hospedagens" />}>
                  <StaysTabPanel
                    canEditTrip={canEditTrip}
                    stayDialogOpen={stayDialogOpen}
                    setStayDialogOpen={setStayDialogOpen}
                    openCreateStay={openCreateStay}
                    editingStay={editingStay}
                    stayForm={stayForm}
                    setStayForm={setStayForm}
                    submitStay={submitStay}
                    isCreatingStay={staysModule.isCreating}
                    isUpdatingStay={staysModule.isUpdating}
                    staySearch={staySearch}
                    setStaySearch={setStaySearch}
                    stayStatus={stayStatus}
                    setStayStatus={setStayStatus}
                    stayStats={stayStats}
                    stayNightsTotal={stayNightsTotal}
                    formatByCurrency={formatByCurrency}
                    stayDayChips={stayDayChips}
                    isAnyCrudDialogOpen={isAnyCrudDialogOpen}
                    staysFiltered={staysFiltered}
                    transports={transportsModule.data}
                    flights={flightsModule.data}
                    stayCoverageGaps={stayCoverageGaps}
                    transportCoverageGaps={transportCoverageGaps}
                    formatDateShort={formatDateShort}
                    staysLoading={staysModule.isLoading}
                    statusBadge={statusBadge}
                    buildMapsUrl={buildMapsUrl}
                    onEnrichStay={enrichStay}
                    onSuggestRestaurants={suggestAndSaveRestaurants}
                    onOpenStayDetail={(stay) => {
                      setSelectedStay(stay);
                      setStayDetailOpen(true);
                    }}
                    openEditStay={openEditStay}
                    removeStay={removeStay}
                    isRemovingStay={staysModule.isRemoving}
                    enrichingStayId={enrichingStayId}
                    suggestingRestaurantsStayId={suggestingRestaurantsStayId}
                    stayDetailOpen={stayDetailOpen}
                    setStayDetailOpen={setStayDetailOpen}
                    selectedStay={selectedStay}
                    formatDate={formatDate}
                    formatCurrency={formatCurrency}
                    splitInsightList={splitInsightList}
                    stayHighlight={stayHighlight}
                    selectedStayDocuments={selectedStayDocuments}
                    openSupportDocument={supportResources.openSupportDocument}
                    openingDocumentPath={supportResources.openingDocumentPath}
                    downloadSupportDocument={supportResources.downloadSupportDocument}
                    downloadingDocumentPath={supportResources.downloadingDocumentPath}
                    removeDocument={supportResources.removeDocument}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="transportes" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="transportes" />}>
                  <TransportsTabPanel
                    canEditTrip={canEditTrip}
                    transportDialogOpen={transportDialogOpen}
                    setTransportDialogOpen={setTransportDialogOpen}
                    openCreateTransport={openCreateTransport}
                    editingTransport={editingTransport}
                    transportForm={transportForm}
                    setTransportForm={setTransportForm}
                    submitTransport={submitTransport}
                    isCreatingTransport={transportsModule.isCreating}
                    isUpdatingTransport={transportsModule.isUpdating}
                    transportSearch={transportSearch}
                    setTransportSearch={setTransportSearch}
                    transportStatus={transportStatus}
                    setTransportStatus={setTransportStatus}
                    transportStats={transportStats}
                    formatByCurrency={formatByCurrency}
                    transportDayChips={transportDayChips}
                    isAnyCrudDialogOpen={isAnyCrudDialogOpen}
                    stays={staysModule.data}
                    transportFiltered={transportFiltered}
                    flights={flightsModule.data}
                    transportsLoading={transportsModule.isLoading}
                    onSelectTransport={(transport) => {
                      setSelectedTransport(transport);
                      setTransportDetailOpen(true);
                    }}
                    buildMapsUrl={buildMapsUrl}
                    statusBadge={statusBadge}
                    openEditTransport={openEditTransport}
                    removeTransport={removeTransport}
                    isRemovingTransport={transportsModule.isRemoving}
                    transportDetailOpen={transportDetailOpen}
                    setTransportDetailOpen={setTransportDetailOpen}
                    selectedTransport={selectedTransport}
                    formatDateTime={formatDateTime}
                    formatCurrency={formatCurrency}
                    transportReservationCode={transportReservationCode}
                    buildTransportInsights={buildTransportInsights}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="tarefas" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="tarefas" />}>
                  <TasksTabPanel
                    canEditTrip={canEditTrip}
                    generatingTasks={generatingTasks}
                    onGenerateTasks={generateTasksWithAi}
                    taskForm={taskForm}
                    onTaskTitleChange={(value) => setTaskForm((current) => ({ ...current, titulo: value }))}
                    onTaskCategoryChange={(value) => setTaskForm((current) => ({ ...current, categoria: value }))}
                    onTaskPriorityChange={(value) => setTaskForm((current) => ({ ...current, prioridade: value }))}
                    onCreateTask={createTask}
                    isCreatingTask={tasksModule.isCreating}
                    taskSearch={taskSearch}
                    onTaskSearchChange={setTaskSearch}
                    tasksLoading={tasksModule.isLoading}
                    tasksFiltered={tasksFiltered}
                    onToggleTask={toggleTask}
                    isUpdatingTask={tasksModule.isUpdating}
                    onRemoveTask={removeTask}
                    isRemovingTask={tasksModule.isRemoving}
                    prioridadeBadge={prioridadeBadge}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="roteiro" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="roteiro" />}>
                  <RoteiroTabPanel
                    canEditTrip={canEditTrip}
                    generatingItinerary={generatingItinerary}
                    onGenerateItinerary={generateRoteiroWithAi}
                    roteiroLoading={roteiroModule.isLoading}
                    roteiroItems={roteiroModule.data}
                    formatDate={formatDate}
                    onReorder={reorderRoteiroItem}
                    onRemove={removeRoteiroItem}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="despesas" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="despesas" />}>
                  <ExpensesTabPanel
                    canEditTrip={canEditTrip}
                    expenseDialogOpen={expenseDialogOpen}
                    setExpenseDialogOpen={setExpenseDialogOpen}
                    expenseForm={expenseForm}
                    setExpenseForm={setExpenseForm}
                    onCreateExpense={createExpense}
                    isCreatingExpense={expensesModule.isCreating}
                    expensesLoading={expensesModule.isLoading}
                    expenses={expensesModule.data}
                    onRemoveExpense={removeExpense}
                    isRemovingExpense={expensesModule.isRemoving}
                    formatDate={formatDate}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="orcamento" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="orçamento" />}>
                  <BudgetTabPanel
                    canExportPdf={exportPdfGate.enabled}
                    canExportJson={exportJsonGate.enabled}
                    isExportingData={isExportingData}
                    planTier={collabGate.planTier}
                    onExportJson={exportJson}
                    onExportPdf={exportPdf}
                    realByCurrency={realByCurrency}
                    estimadoByCurrency={estimadoByCurrency}
                    flightByCurrency={flightStats.byCurrency}
                    stayByCurrency={stayStats.byCurrency}
                    transportByCurrency={transportStats.byCurrency}
                    variacaoTotal={variacaoTotal}
                    expensesByCategory={expensesByCategory}
                    expensesByDate={expensesByDate}
                    formatByCurrency={formatByCurrency}
                    formatCurrency={formatCurrency}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="gastronomia" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="gastronomia" />}>
                  <GastronomyTabPanel
                    restaurantForm={restaurantForm}
                    setRestaurantForm={setRestaurantForm}
                    canEditTrip={canEditTrip}
                    restaurantsModule={restaurantsModule}
                    createRestaurant={createRestaurant}
                    toggleRestaurantFavorite={toggleRestaurantFavorite}
                    removeRestaurant={removeRestaurant}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="apoio" className="space-y-4">
                <Suspense fallback={<TabPanelFallback label="apoio" />}>
                  <SupportTabPanel
                    supportError={supportError}
                    supportIsLoading={supportIsLoading}
                    userId={user?.id}
                    userEmail={user?.email}
                    profile={profile}
                    onProfileRefresh={loadProfile}
                    collabEnabled={collabGate.enabled}
                    tripMembers={tripMembers}
                    currentTripId={currentTripId}
                    publicApiEnabled={publicApiGate.enabled}
                    webhookEnabled={webhookGate.enabled}
                    supportResourcesProps={{
                      canEditTrip,
                      supportForms: supportResources.supportForms,
                      setSupportForms: supportResources.setSupportForms,
                      documentsModule,
                      luggageModule,
                      travelersModule,
                      prepModule,
                      openingDocumentPath: supportResources.openingDocumentPath,
                      downloadingDocumentPath: supportResources.downloadingDocumentPath,
                      createDocument: supportResources.createDocument,
                      removeDocument: supportResources.removeDocument,
                      openSupportDocument: supportResources.openSupportDocument,
                      downloadSupportDocument: supportResources.downloadSupportDocument,
                      createLuggageItem: supportResources.createLuggageItem,
                      toggleLuggageChecked: supportResources.toggleLuggageChecked,
                      removeLuggageItem: supportResources.removeLuggageItem,
                      createTraveler: supportResources.createTraveler,
                      removeTraveler: supportResources.removeTraveler,
                      createPrepItem: supportResources.createPrepItem,
                      togglePrepDone: supportResources.togglePrepDone,
                      removePrepItem: supportResources.removePrepItem,
                    }}
                  />
                </Suspense>
              </TabsContent>
            </Tabs>
            </section>
          </div>
        ) : (
          <div className="text-center py-20">
            <p className="text-muted-foreground">Nenhuma viagem encontrada.</p>
          </div>
        )}
      </main>
    </div>
  );
}
