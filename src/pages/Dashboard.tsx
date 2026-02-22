import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useModuleData, useTripSummary } from '@/hooks/useModuleData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { Plane, Hotel, Bus, ListTodo, DollarSign, LogOut, MapPin, Utensils, Briefcase, Users, FileText, Package, Plus, Pencil, Trash2, Clock3, Route, CheckCircle2, RotateCcw, TrendingUp, TrendingDown, Wallet, RefreshCcw, Heart, CalendarDays } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { generateStayTips, suggestRestaurants } from '@/services/ai';
import { ImportReservationDialog } from '@/components/import/ImportReservationDialog';

const statCards = [
  { label: 'Voos', icon: Plane, key: 'voos' },
  { label: 'Hospedagens', icon: Hotel, key: 'hospedagens' },
  { label: 'Transportes', icon: Bus, key: 'transportes' },
  { label: 'Tarefas', icon: ListTodo, key: 'tarefas' },
  { label: 'Despesas', icon: DollarSign, key: 'despesas' },
  { label: 'Restaurantes', icon: Utensils, key: 'restaurantes' },
  { label: 'Documentos', icon: FileText, key: 'documentos' },
  { label: 'Bagagem', icon: Package, key: 'bagagem' },
  { label: 'Viajantes', icon: Users, key: 'viajantes' },
  { label: 'Preparativos', icon: Briefcase, key: 'preparativos' },
];

type ReservaStatus = 'confirmado' | 'pendente' | 'cancelado';
type TarefaPrioridade = 'baixa' | 'media' | 'alta';

const STATUS_LABEL: Record<ReservaStatus, string> = {
  confirmado: 'Confirmado',
  pendente: 'Pendente',
  cancelado: 'Cancelado',
};

const STATUS_BADGE: Record<ReservaStatus, string> = {
  confirmado: 'bg-emerald-500/15 text-emerald-700 border-emerald-600/30',
  pendente: 'bg-amber-500/15 text-amber-700 border-amber-600/30',
  cancelado: 'bg-rose-500/15 text-rose-700 border-rose-600/30',
};

const PRIORIDADE_LABEL: Record<TarefaPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

const PRIORIDADE_BADGE: Record<TarefaPrioridade, string> = {
  baixa: 'bg-slate-500/15 text-slate-700 border-slate-600/30',
  media: 'bg-sky-500/15 text-sky-700 border-sky-600/30',
  alta: 'bg-rose-500/15 text-rose-700 border-rose-600/30',
};

const CHART_COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#65a30d'];

function statusBadge(status: ReservaStatus) {
  return (
    <Badge variant="outline" className={STATUS_BADGE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function prioridadeBadge(prioridade: TarefaPrioridade) {
  return (
    <Badge variant="outline" className={PRIORIDADE_BADGE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

function toDateTimeLocal(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function formatDate(date?: string | null) {
  if (!date) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
}

function formatCurrency(value?: number | null, currency: string = 'BRL') {
  if (value == null) return 'Valor não informado';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: currency || 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

type FlightFormState = {
  numero: string;
  companhia: string;
  origem: string;
  destino: string;
  data: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
};

type StayFormState = {
  nome: string;
  localizacao: string;
  check_in: string;
  check_out: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
  dica_viagem: string;
  como_chegar: string;
  atracoes_proximas: string;
  restaurantes_proximos: string;
  dica_ia: string;
};

type TransportFormState = {
  tipo: string;
  operadora: string;
  origem: string;
  destino: string;
  data: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
};

type TaskFormState = {
  titulo: string;
  categoria: string;
  prioridade: TarefaPrioridade;
};

type ExpenseFormState = {
  titulo: string;
  valor: string;
  moeda: string;
  categoria: string;
  data: string;
};

type RestaurantFormState = {
  nome: string;
  cidade: string;
  tipo: string;
  rating: string;
};

type SupportForms = {
  documentoNome: string;
  documentoTipo: string;
  documentoUrl: string;
  bagagemItem: string;
  bagagemQuantidade: string;
  viajanteNome: string;
  viajanteEmail: string;
  viajanteTelefone: string;
  preparativoTitulo: string;
  preparativoDescricao: string;
};

const emptyFlight: FlightFormState = {
  numero: '',
  companhia: '',
  origem: '',
  destino: '',
  data: '',
  status: 'pendente',
  valor: '',
  moeda: 'BRL',
};

const emptyStay: StayFormState = {
  nome: '',
  localizacao: '',
  check_in: '',
  check_out: '',
  status: 'pendente',
  valor: '',
  moeda: 'BRL',
  dica_viagem: '',
  como_chegar: '',
  atracoes_proximas: '',
  restaurantes_proximos: '',
  dica_ia: '',
};

const emptyTransport: TransportFormState = {
  tipo: '',
  operadora: '',
  origem: '',
  destino: '',
  data: '',
  status: 'pendente',
  valor: '',
  moeda: 'BRL',
};

const emptyTask: TaskFormState = {
  titulo: '',
  categoria: '',
  prioridade: 'media',
};

const emptyExpense: ExpenseFormState = {
  titulo: '',
  valor: '',
  moeda: 'BRL',
  categoria: '',
  data: '',
};

const emptyRestaurant: RestaurantFormState = {
  nome: '',
  cidade: '',
  tipo: '',
  rating: '',
};

const emptySupportForms: SupportForms = {
  documentoNome: '',
  documentoTipo: '',
  documentoUrl: '',
  bagagemItem: '',
  bagagemQuantidade: '1',
  viajanteNome: '',
  viajanteEmail: '',
  viajanteTelefone: '',
  preparativoTitulo: '',
  preparativoDescricao: '',
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { currentTrip, currentTripId, trips, loading: tripLoading, selectTrip } = useTrip();
  const navigate = useNavigate();
  const { data: counts, isLoading: countsLoading } = useTripSummary();
  const flightsModule = useModuleData('voos');
  const staysModule = useModuleData('hospedagens');
  const transportsModule = useModuleData('transportes');
  const tasksModule = useModuleData('tarefas');
  const expensesModule = useModuleData('despesas');
  const restaurantsModule = useModuleData('restaurantes');
  const documentsModule = useModuleData('documentos');
  const luggageModule = useModuleData('bagagem');
  const travelersModule = useModuleData('viajantes');
  const prepModule = useModuleData('preparativos');

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
  const [supportForms, setSupportForms] = useState<SupportForms>(emptySupportForms);
  const [isReconciling, setIsReconciling] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
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

  const realTotal = useMemo(() => {
    return expensesModule.data.reduce((acc, item) => acc + Number(item.valor ?? 0), 0);
  }, [expensesModule.data]);

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

  const openCreateFlight = () => {
    setEditingFlight(null);
    setFlightForm(emptyFlight);
    setFlightDialogOpen(true);
  };

  const openEditFlight = (flight: Tables<'voos'>) => {
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
    if (!window.confirm('Deseja remover este voo?')) return;
    await flightsModule.remove(id);
    if (selectedFlight?.id === id) setFlightDetailOpen(false);
  };

  const openCreateStay = () => {
    setEditingStay(null);
    setStayForm(emptyStay);
    setStayDialogOpen(true);
  };

  const openEditStay = (stay: Tables<'hospedagens'>) => {
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
    if (!window.confirm('Deseja remover esta hospedagem?')) return;
    await staysModule.remove(id);
    if (selectedStay?.id === id) setStayDetailOpen(false);
  };

  const enrichStay = async (stay: Tables<'hospedagens'>, silent: boolean = false) => {
    setEnrichingStayId(stay.id);
    try {
      const result = await generateStayTips({
        hotelName: stay.nome,
        location: stay.localizacao,
        checkIn: stay.check_in,
        checkOut: stay.check_out,
        tripDestination: currentTrip?.destino,
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
    setEditingTransport(null);
    setTransportForm(emptyTransport);
    setTransportDialogOpen(true);
  };

  const openEditTransport = (transport: Tables<'transportes'>) => {
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
    if (!window.confirm('Deseja remover este transporte?')) return;
    await transportsModule.remove(id);
    if (selectedTransport?.id === id) setTransportDetailOpen(false);
  };

  const createTask = async () => {
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
    await tasksModule.update({
      id: task.id,
      updates: {
        concluida: !task.concluida,
      },
    });
  };

  const removeTask = async (id: string) => {
    if (!window.confirm('Deseja remover esta tarefa?')) return;
    await tasksModule.remove(id);
  };

  const createExpense = async () => {
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
    if (!window.confirm('Deseja remover esta despesa?')) return;
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
    await restaurantsModule.update({
      id: restaurant.id,
      updates: { salvo: !restaurant.salvo },
    });
  };

  const removeRestaurant = async (id: string) => {
    if (!window.confirm('Deseja remover este restaurante?')) return;
    await restaurantsModule.remove(id);
  };

  const createDocument = async () => {
    if (!supportForms.documentoNome.trim()) return;
    await documentsModule.create({
      nome: supportForms.documentoNome.trim(),
      tipo: supportForms.documentoTipo.trim() || null,
      arquivo_url: supportForms.documentoUrl.trim() || null,
    });
    setSupportForms((s) => ({ ...s, documentoNome: '', documentoTipo: '', documentoUrl: '' }));
  };

  const removeDocument = async (id: string) => {
    if (!window.confirm('Deseja remover este documento?')) return;
    await documentsModule.remove(id);
  };

  const createLuggageItem = async () => {
    if (!supportForms.bagagemItem.trim()) return;
    await luggageModule.create({
      item: supportForms.bagagemItem.trim(),
      quantidade: Number(supportForms.bagagemQuantidade || 1),
      conferido: false,
    });
    setSupportForms((s) => ({ ...s, bagagemItem: '', bagagemQuantidade: '1' }));
  };

  const toggleLuggageChecked = async (item: Tables<'bagagem'>) => {
    await luggageModule.update({
      id: item.id,
      updates: { conferido: !item.conferido },
    });
  };

  const removeLuggageItem = async (id: string) => {
    if (!window.confirm('Deseja remover este item de bagagem?')) return;
    await luggageModule.remove(id);
  };

  const createTraveler = async () => {
    if (!supportForms.viajanteNome.trim()) return;
    await travelersModule.create({
      nome: supportForms.viajanteNome.trim(),
      email: supportForms.viajanteEmail.trim() || null,
      telefone: supportForms.viajanteTelefone.trim() || null,
    });
    setSupportForms((s) => ({ ...s, viajanteNome: '', viajanteEmail: '', viajanteTelefone: '' }));
  };

  const removeTraveler = async (id: string) => {
    if (!window.confirm('Deseja remover este viajante?')) return;
    await travelersModule.remove(id);
  };

  const createPrepItem = async () => {
    if (!supportForms.preparativoTitulo.trim()) return;
    await prepModule.create({
      titulo: supportForms.preparativoTitulo.trim(),
      descricao: supportForms.preparativoDescricao.trim() || null,
      concluido: false,
    });
    setSupportForms((s) => ({ ...s, preparativoTitulo: '', preparativoDescricao: '' }));
  };

  const togglePrepDone = async (item: Tables<'preparativos'>) => {
    await prepModule.update({
      id: item.id,
      updates: { concluido: !item.concluido },
    });
  };

  const removePrepItem = async (id: string) => {
    if (!window.confirm('Deseja remover este preparativo?')) return;
    await prepModule.remove(id);
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
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Plane className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold font-display">TripPlanner</h1>
          </div>
          <div className="flex items-center gap-3">
            {trips.length > 1 && (
              <Select value={currentTripId ?? ''} onValueChange={selectTrip}>
                <SelectTrigger className="w-[200px] hidden sm:flex">
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
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {currentTrip ? (
          <>
            <Card className="mb-8 overflow-hidden border-border/50">
              <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold font-display">{currentTrip.nome}</h2>
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

            <div className="mb-6 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={reconcileFromServer} disabled={isReconciling}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
                Reconciliar dados
              </Button>
              <ImportReservationDialog />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {statCards.map((card) => (
                <Card key={card.key} className="border-border/50 transition-shadow hover:shadow-md">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
                    <card.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {countsLoading ? '–' : ((counts as Record<string, number>)?.[card.key] ?? 0)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-9">
                <TabsTrigger value="visao">Visão</TabsTrigger>
                <TabsTrigger value="voos">Voos</TabsTrigger>
                <TabsTrigger value="hospedagens">Hospedagens</TabsTrigger>
                <TabsTrigger value="transportes">Transportes</TabsTrigger>
                <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
                <TabsTrigger value="despesas">Despesas</TabsTrigger>
                <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
                <TabsTrigger value="gastronomia">Gastronomia</TabsTrigger>
                <TabsTrigger value="apoio">Apoio</TabsTrigger>
              </TabsList>

              <TabsContent value="visao" className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="border-border/50 lg:col-span-2">
                    <CardHeader>
                      <CardTitle className="font-display text-xl">Próximos eventos</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {upcomingEvents.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                          Sem eventos futuros no momento.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {upcomingEvents.map((event) => (
                            <div key={event.id} className="flex items-start justify-between rounded-lg border p-3">
                              <div>
                                <p className="font-medium">{event.titulo}</p>
                                <p className="text-sm text-muted-foreground">{event.tipo}</p>
                              </div>
                              <Badge variant="secondary" className="whitespace-nowrap">
                                <CalendarDays className="mr-1 h-3.5 w-3.5" />
                                {formatDateTime(event.data)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle className="text-base">Resumo rápido</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p><strong>Restaurantes salvos:</strong> {restaurantsFavorites.length}</p>
                      <p><strong>Documentos:</strong> {documentsModule.data.length}</p>
                      <p><strong>Itens bagagem:</strong> {luggageModule.data.length}</p>
                      <p><strong>Viajantes:</strong> {travelersModule.data.length}</p>
                      <p><strong>Preparativos:</strong> {prepModule.data.length}</p>
                      <p><strong>Real x estimado:</strong> {formatCurrency(realTotal)} / {formatCurrency(estimadoTotal)}</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="voos" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Gestão de voos</CardTitle>
                      <Dialog open={flightDialogOpen} onOpenChange={setFlightDialogOpen}>
                        <DialogTrigger asChild>
                          <Button onClick={openCreateFlight}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo voo
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{editingFlight ? 'Editar voo' : 'Novo voo'}</DialogTitle>
                            <DialogDescription>
                              Preencha as informações para salvar no banco real.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-2 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Número do voo</Label>
                              <Input value={flightForm.numero} onChange={(e) => setFlightForm((s) => ({ ...s, numero: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Companhia</Label>
                              <Input value={flightForm.companhia} onChange={(e) => setFlightForm((s) => ({ ...s, companhia: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Origem</Label>
                              <Input value={flightForm.origem} onChange={(e) => setFlightForm((s) => ({ ...s, origem: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Destino</Label>
                              <Input value={flightForm.destino} onChange={(e) => setFlightForm((s) => ({ ...s, destino: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Data e hora</Label>
                              <Input type="datetime-local" value={flightForm.data} onChange={(e) => setFlightForm((s) => ({ ...s, data: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select value={flightForm.status} onValueChange={(value: ReservaStatus) => setFlightForm((s) => ({ ...s, status: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="confirmado">Confirmado</SelectItem>
                                  <SelectItem value="cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Valor</Label>
                              <Input type="number" step="0.01" value={flightForm.valor} onChange={(e) => setFlightForm((s) => ({ ...s, valor: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Moeda</Label>
                              <Input value={flightForm.moeda} onChange={(e) => setFlightForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setFlightDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={submitFlight} disabled={flightsModule.isCreating || flightsModule.isUpdating}>
                              Salvar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                      <Input
                        placeholder="Buscar por número, companhia, origem ou destino"
                        value={flightSearch}
                        onChange={(e) => setFlightSearch(e.target.value)}
                      />
                      <Select value={flightStatus} onValueChange={(value: 'todos' | ReservaStatus) => setFlightStatus(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os status</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {flightsModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando voos...
                      </div>
                    ) : flightsFiltered.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <Plane className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhum voo encontrado com os filtros atuais.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {flightsFiltered.map((flight) => (
                          <Card key={flight.id} className="border-border/50">
                            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <button
                                type="button"
                                className="text-left"
                                onClick={() => {
                                  setSelectedFlight(flight);
                                  setFlightDetailOpen(true);
                                }}
                              >
                                <p className="font-semibold">
                                  {flight.numero || 'Sem número'} · {flight.companhia || 'Companhia não informada'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {flight.origem || 'Origem'} → {flight.destino || 'Destino'} · {formatDateTime(flight.data)}
                                </p>
                                <p className="mt-1 text-sm font-medium">{formatCurrency(flight.valor, flight.moeda ?? 'BRL')}</p>
                              </button>
                              <div className="flex items-center gap-2">
                                {statusBadge(flight.status)}
                                <Button variant="outline" size="icon" onClick={() => openEditFlight(flight)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => removeFlight(flight.id)} disabled={flightsModule.isRemoving}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dialog open={flightDetailOpen} onOpenChange={setFlightDetailOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Detalhes do voo</DialogTitle>
                      <DialogDescription>Informações completas do trecho selecionado.</DialogDescription>
                    </DialogHeader>
                    {selectedFlight && (
                      <div className="space-y-2 text-sm">
                        <p><strong>Número:</strong> {selectedFlight.numero || 'Não informado'}</p>
                        <p><strong>Companhia:</strong> {selectedFlight.companhia || 'Não informado'}</p>
                        <p><strong>Trecho:</strong> {selectedFlight.origem || 'Origem'} → {selectedFlight.destino || 'Destino'}</p>
                        <p><strong>Data:</strong> {formatDateTime(selectedFlight.data)}</p>
                        <p><strong>Status:</strong> {STATUS_LABEL[selectedFlight.status]}</p>
                        <p><strong>Valor:</strong> {formatCurrency(selectedFlight.valor, selectedFlight.moeda ?? 'BRL')}</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="hospedagens" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Gestão de hospedagens</CardTitle>
                      <Dialog open={stayDialogOpen} onOpenChange={setStayDialogOpen}>
                        <DialogTrigger asChild>
                          <Button onClick={openCreateStay}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nova hospedagem
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>{editingStay ? 'Editar hospedagem' : 'Nova hospedagem'}</DialogTitle>
                            <DialogDescription>
                              Cadastro completo com detalhes ricos da hospedagem.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-2 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Nome</Label>
                              <Input value={stayForm.nome} onChange={(e) => setStayForm((s) => ({ ...s, nome: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Localização</Label>
                              <Input value={stayForm.localizacao} onChange={(e) => setStayForm((s) => ({ ...s, localizacao: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Check-in</Label>
                              <Input type="date" value={stayForm.check_in} onChange={(e) => setStayForm((s) => ({ ...s, check_in: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Check-out</Label>
                              <Input type="date" value={stayForm.check_out} onChange={(e) => setStayForm((s) => ({ ...s, check_out: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select value={stayForm.status} onValueChange={(value: ReservaStatus) => setStayForm((s) => ({ ...s, status: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="confirmado">Confirmado</SelectItem>
                                  <SelectItem value="cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Valor</Label>
                              <Input type="number" step="0.01" value={stayForm.valor} onChange={(e) => setStayForm((s) => ({ ...s, valor: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Moeda</Label>
                              <Input value={stayForm.moeda} onChange={(e) => setStayForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                            </div>
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Dica de viagem</Label>
                              <Textarea value={stayForm.dica_viagem} onChange={(e) => setStayForm((s) => ({ ...s, dica_viagem: e.target.value }))} />
                            </div>
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Como chegar</Label>
                              <Textarea value={stayForm.como_chegar} onChange={(e) => setStayForm((s) => ({ ...s, como_chegar: e.target.value }))} />
                            </div>
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Atrações próximas</Label>
                              <Textarea value={stayForm.atracoes_proximas} onChange={(e) => setStayForm((s) => ({ ...s, atracoes_proximas: e.target.value }))} />
                            </div>
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Restaurantes próximos</Label>
                              <Textarea value={stayForm.restaurantes_proximos} onChange={(e) => setStayForm((s) => ({ ...s, restaurantes_proximos: e.target.value }))} />
                            </div>
                            <div className="sm:col-span-2 space-y-2">
                              <Label>Dica IA</Label>
                              <Textarea value={stayForm.dica_ia} onChange={(e) => setStayForm((s) => ({ ...s, dica_ia: e.target.value }))} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setStayDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={submitStay} disabled={staysModule.isCreating || staysModule.isUpdating}>
                              Salvar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                      <Input
                        placeholder="Buscar por nome ou localização"
                        value={staySearch}
                        onChange={(e) => setStaySearch(e.target.value)}
                      />
                      <Select value={stayStatus} onValueChange={(value: 'todos' | ReservaStatus) => setStayStatus(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os status</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {staysModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando hospedagens...
                      </div>
                    ) : staysFiltered.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <Hotel className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhuma hospedagem encontrada com os filtros atuais.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {staysFiltered.map((stay) => (
                          <Card key={stay.id} className="border-border/50">
                            <CardContent className="space-y-2 p-4">
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => {
                                  setSelectedStay(stay);
                                  setStayDetailOpen(true);
                                }}
                              >
                                <p className="font-semibold">{stay.nome || 'Hospedagem sem nome'}</p>
                                <p className="text-sm text-muted-foreground">{stay.localizacao || 'Localização não informada'}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(stay.check_in)} até {formatDate(stay.check_out)}
                                </p>
                                <p className="text-sm font-medium">{formatCurrency(stay.valor, stay.moeda ?? 'BRL')}</p>
                              </button>
                              <div className="flex items-center justify-between">
                                {statusBadge(stay.status)}
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => enrichStay(stay)}
                                    disabled={enrichingStayId === stay.id}
                                  >
                                    {enrichingStayId === stay.id ? 'Gerando...' : 'Gerar dicas IA'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => suggestAndSaveRestaurants(stay)}
                                    disabled={suggestingRestaurantsStayId === stay.id}
                                  >
                                    {suggestingRestaurantsStayId === stay.id ? 'Sugerindo...' : 'Sugerir restaurantes'}
                                  </Button>
                                  <Button variant="outline" size="icon" onClick={() => openEditStay(stay)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon" onClick={() => removeStay(stay.id)} disabled={staysModule.isRemoving}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dialog open={stayDetailOpen} onOpenChange={setStayDetailOpen}>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Detalhes da hospedagem</DialogTitle>
                      <DialogDescription>Visão rica com informações de apoio da estadia.</DialogDescription>
                    </DialogHeader>
                    {selectedStay && (
                      <div className="space-y-3 text-sm">
                        <p><strong>Nome:</strong> {selectedStay.nome || 'Não informado'}</p>
                        <p><strong>Localização:</strong> {selectedStay.localizacao || 'Não informado'}</p>
                        <p><strong>Período:</strong> {formatDate(selectedStay.check_in)} até {formatDate(selectedStay.check_out)}</p>
                        <p><strong>Status:</strong> {STATUS_LABEL[selectedStay.status]}</p>
                        <p><strong>Valor:</strong> {formatCurrency(selectedStay.valor, selectedStay.moeda ?? 'BRL')}</p>
                        <p><strong>Dica de viagem:</strong> {selectedStay.dica_viagem || '—'}</p>
                        <p><strong>Como chegar:</strong> {selectedStay.como_chegar || '—'}</p>
                        <p><strong>Atrações próximas:</strong> {selectedStay.atracoes_proximas || '—'}</p>
                        <p><strong>Restaurantes próximos:</strong> {selectedStay.restaurantes_proximos || '—'}</p>
                        <p><strong>Dica IA:</strong> {selectedStay.dica_ia || '—'}</p>
                        <div className="pt-2 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => enrichStay(selectedStay)}
                            disabled={enrichingStayId === selectedStay.id}
                          >
                            {enrichingStayId === selectedStay.id ? 'Gerando...' : 'Regenerar dicas IA'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => suggestAndSaveRestaurants(selectedStay)}
                            disabled={suggestingRestaurantsStayId === selectedStay.id}
                          >
                            {suggestingRestaurantsStayId === selectedStay.id ? 'Sugerindo...' : 'Sugerir restaurantes'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="transportes" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Linha do tempo de transportes</CardTitle>
                      <Dialog open={transportDialogOpen} onOpenChange={setTransportDialogOpen}>
                        <DialogTrigger asChild>
                          <Button onClick={openCreateTransport}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo transporte
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{editingTransport ? 'Editar transporte' : 'Novo transporte'}</DialogTitle>
                            <DialogDescription>
                              Cadastro do trecho para compor a timeline da viagem.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-2 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Tipo</Label>
                              <Input placeholder="Ex.: Transfer, Trem, Ônibus" value={transportForm.tipo} onChange={(e) => setTransportForm((s) => ({ ...s, tipo: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Operadora</Label>
                              <Input value={transportForm.operadora} onChange={(e) => setTransportForm((s) => ({ ...s, operadora: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Origem</Label>
                              <Input value={transportForm.origem} onChange={(e) => setTransportForm((s) => ({ ...s, origem: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Destino</Label>
                              <Input value={transportForm.destino} onChange={(e) => setTransportForm((s) => ({ ...s, destino: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Data e hora</Label>
                              <Input type="datetime-local" value={transportForm.data} onChange={(e) => setTransportForm((s) => ({ ...s, data: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select value={transportForm.status} onValueChange={(value: ReservaStatus) => setTransportForm((s) => ({ ...s, status: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pendente">Pendente</SelectItem>
                                  <SelectItem value="confirmado">Confirmado</SelectItem>
                                  <SelectItem value="cancelado">Cancelado</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Valor</Label>
                              <Input type="number" step="0.01" value={transportForm.valor} onChange={(e) => setTransportForm((s) => ({ ...s, valor: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Moeda</Label>
                              <Input value={transportForm.moeda} onChange={(e) => setTransportForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setTransportDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={submitTransport} disabled={transportsModule.isCreating || transportsModule.isUpdating}>
                              Salvar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                      <Input
                        placeholder="Buscar por tipo, operadora, origem ou destino"
                        value={transportSearch}
                        onChange={(e) => setTransportSearch(e.target.value)}
                      />
                      <Select value={transportStatus} onValueChange={(value: 'todos' | ReservaStatus) => setTransportStatus(value)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os status</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {transportsModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando transportes...
                      </div>
                    ) : transportFiltered.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <Bus className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhum transporte encontrado com os filtros atuais.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {transportFiltered.map((transport) => (
                          <div key={transport.id} className="relative pl-8">
                            <div className="absolute left-2 top-2 h-full w-px bg-border" />
                            <div className="absolute left-0 top-2 h-4 w-4 rounded-full border-2 border-primary bg-background" />
                            <Card className="border-border/50">
                              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                <button
                                  type="button"
                                  className="text-left"
                                  onClick={() => {
                                    setSelectedTransport(transport);
                                    setTransportDetailOpen(true);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Route className="h-4 w-4 text-primary" />
                                    <p className="font-semibold">{transport.tipo || 'Transporte'}</p>
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {transport.origem || 'Origem'} → {transport.destino || 'Destino'} · {transport.operadora || 'Operadora não informada'}
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    <Clock3 className="mr-1 inline h-3.5 w-3.5" />
                                    {formatDateTime(transport.data)}
                                  </p>
                                  <p className="text-sm font-medium">{formatCurrency(transport.valor, transport.moeda ?? 'BRL')}</p>
                                </button>
                                <div className="flex items-center gap-2">
                                  {statusBadge(transport.status)}
                                  <Button variant="outline" size="icon" onClick={() => openEditTransport(transport)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon" onClick={() => removeTransport(transport.id)} disabled={transportsModule.isRemoving}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Dialog open={transportDetailOpen} onOpenChange={setTransportDetailOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Detalhes do transporte</DialogTitle>
                      <DialogDescription>Informações completas do deslocamento selecionado.</DialogDescription>
                    </DialogHeader>
                    {selectedTransport && (
                      <div className="space-y-2 text-sm">
                        <p><strong>Tipo:</strong> {selectedTransport.tipo || 'Não informado'}</p>
                        <p><strong>Operadora:</strong> {selectedTransport.operadora || 'Não informado'}</p>
                        <p><strong>Trecho:</strong> {selectedTransport.origem || 'Origem'} → {selectedTransport.destino || 'Destino'}</p>
                        <p><strong>Data:</strong> {formatDateTime(selectedTransport.data)}</p>
                        <p><strong>Status:</strong> {STATUS_LABEL[selectedTransport.status]}</p>
                        <p><strong>Valor:</strong> {formatCurrency(selectedTransport.valor, selectedTransport.moeda ?? 'BRL')}</p>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="tarefas" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">Tarefas da viagem</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
                      <Input
                        placeholder="Título da tarefa"
                        value={taskForm.titulo}
                        onChange={(e) => setTaskForm((s) => ({ ...s, titulo: e.target.value }))}
                      />
                      <Input
                        placeholder="Categoria"
                        value={taskForm.categoria}
                        onChange={(e) => setTaskForm((s) => ({ ...s, categoria: e.target.value }))}
                      />
                      <Select
                        value={taskForm.prioridade}
                        onValueChange={(value: TarefaPrioridade) => setTaskForm((s) => ({ ...s, prioridade: value }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={createTask} disabled={!taskForm.titulo.trim() || tasksModule.isCreating}>
                        <Plus className="mr-2 h-4 w-4" />
                        Criar tarefa
                      </Button>
                    </div>

                    <Input
                      placeholder="Buscar tarefa por título ou categoria"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                    />

                    {tasksModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando tarefas...
                      </div>
                    ) : tasksFiltered.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <ListTodo className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {tasksFiltered.map((task) => (
                          <Card key={task.id} className="border-border/50">
                            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className={`font-medium ${task.concluida ? 'line-through text-muted-foreground' : ''}`}>
                                  {task.titulo}
                                </p>
                                <div className="mt-1 flex items-center gap-2">
                                  {prioridadeBadge(task.prioridade)}
                                  {task.categoria && <Badge variant="secondary">{task.categoria}</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => toggleTask(task)}
                                  disabled={tasksModule.isUpdating}
                                >
                                  {task.concluida ? (
                                    <>
                                      <RotateCcw className="mr-1 h-4 w-4" />
                                      Reabrir
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="mr-1 h-4 w-4" />
                                      Concluir
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => removeTask(task.id)}
                                  disabled={tasksModule.isRemoving}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="despesas" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Despesas reais</CardTitle>
                      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Nova despesa
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-xl">
                          <DialogHeader>
                            <DialogTitle>Nova despesa</DialogTitle>
                            <DialogDescription>
                              Essa despesa impacta imediatamente o orçamento real da viagem.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-4 py-2 sm:grid-cols-2">
                            <div className="space-y-2 sm:col-span-2">
                              <Label>Título</Label>
                              <Input value={expenseForm.titulo} onChange={(e) => setExpenseForm((s) => ({ ...s, titulo: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Valor</Label>
                              <Input type="number" step="0.01" value={expenseForm.valor} onChange={(e) => setExpenseForm((s) => ({ ...s, valor: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Moeda</Label>
                              <Input value={expenseForm.moeda} onChange={(e) => setExpenseForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Categoria</Label>
                              <Input value={expenseForm.categoria} onChange={(e) => setExpenseForm((s) => ({ ...s, categoria: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                              <Label>Data</Label>
                              <Input type="date" value={expenseForm.data} onChange={(e) => setExpenseForm((s) => ({ ...s, data: e.target.value }))} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancelar</Button>
                            <Button
                              onClick={createExpense}
                              disabled={!expenseForm.titulo.trim() || !expenseForm.valor || expensesModule.isCreating}
                            >
                              Salvar despesa
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {expensesModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando despesas...
                      </div>
                    ) : expensesModule.data.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <DollarSign className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhuma despesa registrada ainda.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {expensesModule.data.map((expense) => (
                          <Card key={expense.id} className="border-border/50">
                            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-medium">{expense.titulo}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(expense.categoria?.trim() || 'Sem categoria')} · {formatDate(expense.data)}
                                </p>
                                <p className="text-sm font-semibold">{formatCurrency(expense.valor, expense.moeda ?? 'BRL')}</p>
                              </div>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => removeExpense(expense.id)}
                                disabled={expensesModule.isRemoving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="orcamento" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Total real</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-2xl font-bold">
                        <Wallet className="h-5 w-5 text-primary" />
                        {formatCurrency(realTotal, 'BRL')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Baseado em despesas efetivamente lançadas.</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Total estimado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(estimadoTotal, 'BRL')}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Soma dinâmica de voos, hospedagens e transportes não cancelados.
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Variação (real - estimado)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-2xl font-bold">
                        {variacaoTotal > 0 ? <TrendingUp className="h-5 w-5 text-rose-600" /> : <TrendingDown className="h-5 w-5 text-emerald-600" />}
                        {formatCurrency(variacaoTotal, 'BRL')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {variacaoTotal > 0 ? 'Acima do estimado' : 'Dentro/abaixo do estimado'}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle className="text-base">Despesas por categoria</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      {expensesByCategory.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Sem dados de categorias para exibir.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expensesByCategory}
                              dataKey="total"
                              nameKey="categoria"
                              innerRadius={60}
                              outerRadius={95}
                              paddingAngle={2}
                            >
                              {expensesByCategory.map((entry, index) => (
                                <Cell key={entry.categoria} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value, 'BRL')} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50">
                    <CardHeader>
                      <CardTitle className="text-base">Evolução de despesas por data</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                      {expensesByDate.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Sem dados de despesas para exibir.
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={expensesByDate}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="data" />
                            <YAxis />
                            <Tooltip formatter={(value: number) => formatCurrency(value, 'BRL')} />
                            <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="gastronomia" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="font-display text-xl">Gastronomia da viagem</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        placeholder="Nome do restaurante"
                        value={restaurantForm.nome}
                        onChange={(e) => setRestaurantForm((s) => ({ ...s, nome: e.target.value }))}
                      />
                      <Input
                        placeholder="Cidade/Bairro"
                        value={restaurantForm.cidade}
                        onChange={(e) => setRestaurantForm((s) => ({ ...s, cidade: e.target.value }))}
                      />
                      <Input
                        placeholder="Tipo de cozinha"
                        value={restaurantForm.tipo}
                        onChange={(e) => setRestaurantForm((s) => ({ ...s, tipo: e.target.value }))}
                      />
                      <Input
                        placeholder="Rating (0-5)"
                        type="number"
                        step="0.1"
                        min="0"
                        max="5"
                        value={restaurantForm.rating}
                        onChange={(e) => setRestaurantForm((s) => ({ ...s, rating: e.target.value }))}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={createRestaurant} disabled={!restaurantForm.nome.trim() || restaurantsModule.isCreating}>
                        <Plus className="mr-2 h-4 w-4" />
                        Salvar restaurante
                      </Button>
                    </div>

                    {restaurantsModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando restaurantes...
                      </div>
                    ) : restaurantsModule.data.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <Utensils className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhum restaurante salvo para esta viagem.</p>
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {restaurantsModule.data.map((item) => (
                          <Card key={item.id} className="border-border/50">
                            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="font-medium">{item.nome}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(item.cidade || 'Cidade não informada')} · {(item.tipo || 'Tipo não informado')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {item.rating != null ? `Nota ${item.rating.toFixed(1)}` : 'Sem avaliação'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant={item.salvo ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => toggleRestaurantFavorite(item)}
                                  disabled={restaurantsModule.isUpdating}
                                >
                                  <Heart className={`mr-1 h-4 w-4 ${item.salvo ? 'fill-current' : ''}`} />
                                  {item.salvo ? 'Favorito' : 'Favoritar'}
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => removeRestaurant(item.id)} disabled={restaurantsModule.isRemoving}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="apoio" className="space-y-4">
                {supportError && (
                  <Card className="border-rose-500/40 bg-rose-500/5">
                    <CardContent className="p-4 text-sm text-rose-700">
                      Erro ao carregar módulos de apoio: {supportError}
                    </CardContent>
                  </Card>
                )}

                {supportIsLoading ? (
                  <Card className="border-border/50">
                    <CardContent className="p-8 text-center text-muted-foreground">Carregando módulos de apoio...</CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-base">Documentos</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input placeholder="Nome" value={supportForms.documentoNome} onChange={(e) => setSupportForms((s) => ({ ...s, documentoNome: e.target.value }))} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Tipo" value={supportForms.documentoTipo} onChange={(e) => setSupportForms((s) => ({ ...s, documentoTipo: e.target.value }))} />
                          <Input placeholder="URL (opcional)" value={supportForms.documentoUrl} onChange={(e) => setSupportForms((s) => ({ ...s, documentoUrl: e.target.value }))} />
                        </div>
                        <Button onClick={createDocument} disabled={!supportForms.documentoNome.trim() || documentsModule.isCreating}>Adicionar documento</Button>
                        <div className="space-y-2">
                          {documentsModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum documento.</p>
                          ) : documentsModule.data.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{doc.nome}</span>
                              <Button variant="outline" size="icon" onClick={() => removeDocument(doc.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-base">Bagagem</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
                          <Input placeholder="Item" value={supportForms.bagagemItem} onChange={(e) => setSupportForms((s) => ({ ...s, bagagemItem: e.target.value }))} />
                          <Input type="number" min="1" placeholder="Qtd" value={supportForms.bagagemQuantidade} onChange={(e) => setSupportForms((s) => ({ ...s, bagagemQuantidade: e.target.value }))} />
                        </div>
                        <Button onClick={createLuggageItem} disabled={!supportForms.bagagemItem.trim() || luggageModule.isCreating}>Adicionar item</Button>
                        <div className="space-y-2">
                          {luggageModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum item.</p>
                          ) : luggageModule.data.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{item.item} · {item.quantidade}x</span>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => toggleLuggageChecked(item)}>{item.conferido ? 'Desmarcar' : 'Conferir'}</Button>
                                <Button variant="outline" size="icon" onClick={() => removeLuggageItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-base">Viajantes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input placeholder="Nome" value={supportForms.viajanteNome} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteNome: e.target.value }))} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Email" value={supportForms.viajanteEmail} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteEmail: e.target.value }))} />
                          <Input placeholder="Telefone" value={supportForms.viajanteTelefone} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteTelefone: e.target.value }))} />
                        </div>
                        <Button onClick={createTraveler} disabled={!supportForms.viajanteNome.trim() || travelersModule.isCreating}>Adicionar viajante</Button>
                        <div className="space-y-2">
                          {travelersModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum viajante.</p>
                          ) : travelersModule.data.map((traveler) => (
                            <div key={traveler.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{traveler.nome}</span>
                              <Button variant="outline" size="icon" onClick={() => removeTraveler(traveler.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50">
                      <CardHeader>
                        <CardTitle className="text-base">Preparativos</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input placeholder="Título" value={supportForms.preparativoTitulo} onChange={(e) => setSupportForms((s) => ({ ...s, preparativoTitulo: e.target.value }))} />
                        <Textarea placeholder="Descrição (opcional)" value={supportForms.preparativoDescricao} onChange={(e) => setSupportForms((s) => ({ ...s, preparativoDescricao: e.target.value }))} />
                        <Button onClick={createPrepItem} disabled={!supportForms.preparativoTitulo.trim() || prepModule.isCreating}>Adicionar preparativo</Button>
                        <div className="space-y-2">
                          {prepModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum preparativo.</p>
                          ) : prepModule.data.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span className={item.concluido ? 'line-through text-muted-foreground' : ''}>{item.titulo}</span>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => togglePrepDone(item)}>{item.concluido ? 'Reabrir' : 'Concluir'}</Button>
                                <Button variant="outline" size="icon" onClick={() => removePrepItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
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
