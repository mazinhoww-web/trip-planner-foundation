import { Suspense, lazy, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTrip } from '@/hooks/useTrip';
import { useTripSummary } from '@/hooks/useModuleData';
import { useTripMembers } from '@/hooks/useTripMembers';
import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
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
import { TripUsersPanel } from '@/components/dashboard/TripUsersPanel';
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
import { Plane, Hotel, Bus, ListTodo, DollarSign, LogOut, Utensils, Briefcase, Users, FileText, Package, Plus, Pencil, Trash2, Clock3, Route, CheckCircle2, RotateCcw, TrendingUp, TrendingDown, Wallet, Heart, CalendarDays, Sparkles, MapPin, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { generateStayTips, suggestRestaurants, generateTripTasks, generateItinerary } from '@/services/ai';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';
import { supabase } from '@/integrations/supabase/client';

const ImportReservationDialog = lazy(() =>
  import('@/components/import/ImportReservationDialog').then((mod) => ({ default: mod.ImportReservationDialog })),
);
const TripOpenMap = lazy(() =>
  import('@/components/map/TripOpenMap').then((mod) => ({ default: mod.TripOpenMap })),
);

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

const DASHBOARD_TABS: Array<{ key: string; label: string; icon: typeof Plane }> = [
  { key: 'visao', label: 'Dashboard', icon: TrendingUp },
  { key: 'voos', label: 'Voos', icon: Plane },
  { key: 'hospedagens', label: 'Hospedagens', icon: Hotel },
  { key: 'transportes', label: 'Transportes', icon: Bus },
  { key: 'tarefas', label: 'Tarefas', icon: ListTodo },
  { key: 'roteiro', label: 'Roteiro', icon: CalendarDays },
  { key: 'despesas', label: 'Despesas', icon: DollarSign },
  { key: 'orcamento', label: 'Orçamento', icon: Wallet },
  { key: 'gastronomia', label: 'Gastronomia', icon: Utensils },
  { key: 'apoio', label: 'Apoio', icon: Briefcase },
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

function formatDateShort(date?: string | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

function formatCurrency(value?: number | null, currency: string = 'BRL') {
  if (value == null) return 'Valor não informado';
  const validCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'BRL';
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: validCurrency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(value);
  }
}

function formatByCurrency(items: { currency: string; total: number }[]) {
  if (items.length === 0) return 'Sem valor';
  return items.map((i) => formatCurrency(i.total, i.currency)).join(' + ');
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function dateDiffInDays(start: string, end: string) {
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((right - left) / (1000 * 60 * 60 * 24)));
}

function buildMapsUrl(type: 'route' | 'search', opts: { origin?: string | null; destination?: string | null; query?: string | null }) {
  if (type === 'route') {
    const o = opts.origin ?? '';
    const d = opts.destination ?? '';
    if (!o && !d) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=transit`;
  }
  const q = opts.query ?? '';
  if (!q.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function tripCoverImage(destination?: string | null) {
  const dest = (destination ?? '').toLowerCase();
  if (dest.includes('suica') || dest.includes('austria') || dest.includes('switz') || dest.includes('alpes')) {
    return 'https://images.unsplash.com/photo-1508261305438-4dc5f19834f4?auto=format&fit=crop&w=1600&q=80';
  }
  if (dest.includes('praia') || dest.includes('ilha')) {
    return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80';
  }
  return 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80';
}

type DayChip = {
  day: string;
  label: string;
  count: number;
  allConfirmed: boolean;
};

function buildDayChips<T>(items: T[], getDate: (item: T) => string | null, getStatus: (item: T) => ReservaStatus): DayChip[] {
  const byDay = new Map<string, { count: number; allConfirmed: boolean }>();

  for (const item of items) {
    const date = normalizeDate(getDate(item));
    if (!date) continue;

    const current = byDay.get(date) ?? { count: 0, allConfirmed: true };
    current.count += 1;
    if (getStatus(item) !== 'confirmado') {
      current.allConfirmed = false;
    }
    byDay.set(date, current);
  }

  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, data]) => ({
      day,
      label: formatDateShort(day),
      count: data.count,
      allConfirmed: data.allConfirmed,
    }))
    .slice(0, 6);
}

function buildTransportInsights(transport: Tables<'transportes'>) {
  const tips: string[] = [];

  if (transport.tipo?.toLowerCase().includes('trem')) {
    tips.push('Chegue com 20 minutos de antecedência para embarque tranquilo.');
    tips.push('Confirme na estação se o trecho possui troca de plataforma/conexão.');
  } else if (transport.tipo?.toLowerCase().includes('onibus') || transport.tipo?.toLowerCase().includes('bus')) {
    tips.push('Valide bagagem e ponto de embarque com antecedência.');
    tips.push('Tenha um plano B para atrasos de trânsito no horário de pico.');
  } else {
    tips.push('Revise ponto de encontro e horário de saída com a operadora.');
  }

  tips.push('Mantenha comprovante digital e offline durante o trajeto.');

  const risk =
    transport.status === 'confirmado'
      ? 'Conexão: baixa'
      : transport.status === 'pendente'
        ? 'Conexão: moderada'
        : 'Conexão: cancelada';

  return { tips, risk };
}

function splitInsightList(value: string | null | undefined, limit: number = 8) {
  if (!value) return [];
  return value
    .split(/\n|;|•/g)
    .map((item) => item.trim().replace(/^[\-\*]\s*/, ''))
    .filter(Boolean)
    .slice(0, limit);
}

function stayHighlight(stay: Tables<'hospedagens'>) {
  return stay.dica_viagem || stay.dica_ia || 'Aproveite tours de trem panorâmico e confirme reservas com antecedência.';
}

function transportReservationCode(transport: Tables<'transportes'>) {
  const compact = transport.id.replace(/-/g, '').slice(0, 14).toUpperCase();
  return compact || 'N/A';
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
  const [supportForms, setSupportForms] = useState<SupportForms>(emptySupportForms);
  const [isReconciling, setIsReconciling] = useState(false);
  const [openingDocumentPath, setOpeningDocumentPath] = useState<string | null>(null);
  const [downloadingDocumentPath, setDownloadingDocumentPath] = useState<string | null>(null);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);
  const fallbackCanEdit = !!currentTrip && currentTrip.user_id === user?.id;
  const canEditTrip = tripMembers.permission.role ? tripMembers.permission.canEdit : fallbackCanEdit;

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

  // Load user profile cidade_origem
  useMemo(() => {
    if (!user?.id) return;
    supabase
      .from('profiles')
      .select('cidade_origem')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.cidade_origem) setUserHomeCity(data.cidade_origem);
      });
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
    setEditingStay(null);
    setStayForm(emptyStay);
    setStayDialogOpen(true);
  };

  const openEditStay = (stay: Tables<'hospedagens'>) => {
    if (!ensureCanEdit()) return;
    setStayDetailOpen(false);
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

  const createDocument = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.documentoNome.trim()) return;
    await documentsModule.create({
      nome: supportForms.documentoNome.trim(),
      tipo: supportForms.documentoTipo.trim() || null,
      arquivo_url: supportForms.documentoUrl.trim() || null,
    });
    setSupportForms((s) => ({ ...s, documentoNome: '', documentoTipo: '', documentoUrl: '' }));
  };

  const removeDocument = async (id: string) => {
    if (!ensureCanEdit()) return;
    await documentsModule.remove(id);
  };

  const resolveDocumentUrl = async (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const { data, error } = await supabase.storage.from('imports').createSignedUrl(path, 60 * 15);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Não foi possível abrir o comprovante.');
    }

    return data.signedUrl;
  };

  const openSupportDocument = async (path: string | null) => {
    if (!path) {
      toast.error('Documento sem caminho disponível.');
      return;
    }

    setOpeningDocumentPath(path);
    try {
      const url = await resolveDocumentUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[dashboard][document_open_failure]', { path, error });
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o documento.');
    } finally {
      setOpeningDocumentPath((current) => (current === path ? null : current));
    }
  };

  const downloadSupportDocument = async (path: string | null, fileName?: string | null) => {
    if (!path) {
      toast.error('Documento sem caminho disponível.');
      return;
    }

    setDownloadingDocumentPath(path);
    try {
      const url = await resolveDocumentUrl(path);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'comprovante';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('[dashboard][document_download_failure]', { path, error });
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o documento.');
    } finally {
      setDownloadingDocumentPath((current) => (current === path ? null : current));
    }
  };

  const createLuggageItem = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.bagagemItem.trim()) return;
    await luggageModule.create({
      item: supportForms.bagagemItem.trim(),
      quantidade: Number(supportForms.bagagemQuantidade || 1),
      conferido: false,
    });
    setSupportForms((s) => ({ ...s, bagagemItem: '', bagagemQuantidade: '1' }));
  };

  const toggleLuggageChecked = async (item: Tables<'bagagem'>) => {
    if (!ensureCanEdit()) return;
    await luggageModule.update({
      id: item.id,
      updates: { conferido: !item.conferido },
    });
  };

  const removeLuggageItem = async (id: string) => {
    if (!ensureCanEdit()) return;
    await luggageModule.remove(id);
  };

  const createTraveler = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.viajanteNome.trim()) return;
    await travelersModule.create({
      nome: supportForms.viajanteNome.trim(),
      email: supportForms.viajanteEmail.trim() || null,
      telefone: supportForms.viajanteTelefone.trim() || null,
    });
    setSupportForms((s) => ({ ...s, viajanteNome: '', viajanteEmail: '', viajanteTelefone: '' }));
  };

  const removeTraveler = async (id: string) => {
    if (!ensureCanEdit()) return;
    await travelersModule.remove(id);
  };

  const createPrepItem = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.preparativoTitulo.trim()) return;
    await prepModule.create({
      titulo: supportForms.preparativoTitulo.trim(),
      descricao: supportForms.preparativoDescricao.trim() || null,
      concluido: false,
    });
    setSupportForms((s) => ({ ...s, preparativoTitulo: '', preparativoDescricao: '' }));
  };

  const togglePrepDone = async (item: Tables<'preparativos'>) => {
    if (!ensureCanEdit()) return;
    await prepModule.update({
      id: item.id,
      updates: { concluido: !item.concluido },
    });
  };

  const removePrepItem = async (id: string) => {
    if (!ensureCanEdit()) return;
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
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-50/70 to-slate-100/70">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-white/88 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Plane className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display leading-none">TripPlanner</h1>
              <p className="mt-1 text-xs text-muted-foreground">Planejamento inteligente de viagem</p>
            </div>
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

            <TripTopActions isReconciling={isReconciling} onReconcile={reconcileFromServer}>
              {canEditTrip ? (
                <Suspense fallback={<Button disabled>Carregando importação...</Button>}>
                  <ImportReservationDialog />
                </Suspense>
              ) : (
                <Button disabled variant="outline">
                  Importação disponível para owner/editor
                </Button>
              )}
            </TripTopActions>

            {tripMembers.permission.role === 'viewer' && !canEditTrip && (
              <Card className="mt-4 border-slate-300/60 bg-slate-100/60">
                <CardContent className="p-3 text-sm text-slate-700">
                  Você está com papel <strong>viewer</strong> nesta viagem. É possível visualizar os dados, mas edições ficam bloqueadas.
                </CardContent>
              </Card>
            )}

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
                  className="inline-flex h-auto w-max min-w-full items-center gap-2 rounded-2xl border border-border/70 bg-white/90 p-2 shadow-sm"
                  aria-label="Navegação entre módulos da viagem"
                >
                  {DASHBOARD_TABS.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key} className="shrink-0 gap-2 rounded-xl px-3 py-2 text-xs sm:text-sm">
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

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
                      <CardTitle className="text-base">Cobertura da viagem</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <p className="font-medium text-emerald-700">
                          {stayCoverageGaps.length === 0 ? 'Hospedagens cobertas' : `${stayCoverageGaps.length} gap(s) de hospedagem`}
                        </p>
                        <p className="text-xs text-emerald-700/80">
                          {stayCoverageGaps.length === 0
                            ? 'Sem noites descobertas no intervalo atual.'
                            : 'Revise os períodos sem check-in/check-out registrados.'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                        <p className="font-medium text-sky-700">
                          {transportCoverageGaps.length === 0 ? 'Trocas de cidade cobertas' : `${transportCoverageGaps.length} trecho(s) sem transporte`}
                        </p>
                        <p className="text-xs text-sky-700/80">
                          {transportCoverageGaps.length === 0
                            ? 'Nenhum deslocamento entre cidades ficou descoberto.'
                            : 'Adicione voos/transportes para fechar os deslocamentos faltantes.'}
                        </p>
                      </div>
                      <p><strong>Restaurantes salvos:</strong> {restaurantsFavorites.length}</p>
                      <p><strong>Documentos:</strong> {documentsModule.data.length}</p>
                      <p><strong>Viajantes:</strong> {travelersModule.data.length}</p>
                      <p><strong>Real x estimado:</strong> {formatCurrency(realTotal)} / {formatCurrency(estimadoTotal)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-base">Mapa da viagem (OpenStreetMap)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Suspense fallback={<div className="h-[320px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
                      <TripOpenMap
                        stays={staysModule.data}
                        transports={transportsModule.data}
                        flights={flightsModule.data}
                        height="clamp(220px, 42vh, 320px)"
                      />
                    </Suspense>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="border-emerald-400/60 bg-emerald-50 text-emerald-700">Hospedagens</Badge>
                      <Badge variant="outline" className="border-sky-400/60 bg-sky-50 text-sky-700">Transportes</Badge>
                      <Badge variant="outline" className="border-indigo-400/60 bg-indigo-50 text-indigo-700">Voos</Badge>
                      <span className="self-center">Pins numerados mostram ordem de estadias no roteiro.</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="voos" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Gestão de voos</CardTitle>
                      <Dialog open={flightDialogOpen} onOpenChange={setFlightDialogOpen}>
                        <DialogTrigger asChild>
                          <Button onClick={openCreateFlight} disabled={!canEditTrip}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo voo
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-2xl">
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
                            <Button onClick={submitFlight} disabled={!canEditTrip || flightsModule.isCreating || flightsModule.isUpdating}>
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

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Voos no filtro</p>
                        <p className="text-lg font-semibold">{flightStats.total}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Confirmados</p>
                        <p className="text-lg font-semibold">{flightStats.confirmed}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Custo somado</p>
                        <p className="text-lg font-semibold">{formatByCurrency(flightStats.byCurrency)}</p>
                      </div>
                    </div>

                    {flightDayChips.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {flightDayChips.map((chip) => (
                          <button
                            key={chip.day}
                            type="button"
                            className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                          >
                            <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                            <p className="text-sm font-semibold">{chip.count} voo(s)</p>
                          </button>
                        ))}
                      </div>
                    )}

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
                              {buildMapsUrl('route', { origin: flight.origem, destination: flight.destino }) && (
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                                  <a href={buildMapsUrl('route', { origin: flight.origem, destination: flight.destino })!} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3" />
                                    Ver rota
                                  </a>
                                </Button>
                              )}
                              <div className="flex items-center gap-2">
                                {statusBadge(flight.status)}
                                <Button variant="outline" size="icon" aria-label="Editar voo" onClick={() => openEditFlight(flight)} disabled={!canEditTrip}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <ConfirmActionButton
                                  ariaLabel="Remover voo"
                                  title="Remover voo"
                                  description="Essa ação remove o voo definitivamente desta viagem."
                                  confirmLabel="Remover"
                                  disabled={!canEditTrip || flightsModule.isRemoving}
                                  onConfirm={() => removeFlight(flight.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
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
                      <div className="space-y-3 text-sm">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-lg font-semibold">{selectedFlight.origem || 'Origem'} → {selectedFlight.destino || 'Destino'}</p>
                              <p className="text-muted-foreground">{selectedFlight.companhia || 'Companhia'} • {selectedFlight.numero || 'Sem número'}</p>
                            </div>
                            {statusBadge(selectedFlight.status)}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Data</p>
                              <p className="font-medium">{formatDateTime(selectedFlight.data)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Valor</p>
                              <p className="font-medium">{formatCurrency(selectedFlight.valor, selectedFlight.moeda ?? 'BRL')}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Companhia</p>
                              <p className="font-medium">{selectedFlight.companhia || 'Não informada'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Trajeto</p>
                          <div className="mt-3 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                              <div>
                                <p className="font-medium">{selectedFlight.origem || 'Origem'}</p>
                                <p className="text-xs text-muted-foreground">Embarque</p>
                              </div>
                            </div>
                            <div className="ml-1 h-8 w-px bg-border" />
                            <div className="flex items-start gap-3">
                              <div className="mt-1 h-3 w-3 rounded-full bg-primary/50" />
                              <div>
                                <p className="font-medium">{selectedFlight.destino || 'Destino'}</p>
                                <p className="text-xs text-muted-foreground">Chegada</p>
                              </div>
                            </div>
                          </div>
                          {buildMapsUrl('route', { origin: selectedFlight.origem, destination: selectedFlight.destino }) && (
                            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" asChild>
                              <a href={buildMapsUrl('route', { origin: selectedFlight.origem, destination: selectedFlight.destino })!} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                                Abrir rota no Google Maps
                              </a>
                            </Button>
                          )}
                        </div>
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
                          <Button onClick={openCreateStay} disabled={!canEditTrip}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nova hospedagem
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-3xl">
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
                            <Button onClick={submitStay} disabled={!canEditTrip || staysModule.isCreating || staysModule.isUpdating}>
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

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Hospedagens</p>
                        <p className="text-lg font-semibold">{stayStats.total}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Noites cobertas</p>
                        <p className="text-lg font-semibold">{stayNightsTotal}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Cidades</p>
                        <p className="text-lg font-semibold">{stayStats.cities}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Custo somado</p>
                        <p className="text-lg font-semibold">{formatByCurrency(stayStats.byCurrency)}</p>
                      </div>
                    </div>

                    {stayDayChips.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {stayDayChips.map((chip) => (
                          <button
                            key={chip.day}
                            type="button"
                            className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                          >
                            <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                            <p className="text-sm font-semibold">{chip.count} check-in(s)</p>
                          </button>
                        ))}
                      </div>
                    )}

                    <Suspense fallback={<div className="h-[280px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
                      <TripOpenMap
                        stays={staysFiltered}
                        transports={transportsModule.data}
                        flights={flightsModule.data}
                        height="clamp(200px, 36vh, 280px)"
                      />
                    </Suspense>

                    {(stayCoverageGaps.length > 0 || transportCoverageGaps.length > 0) && (
                      <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 p-3 text-sm">
                        {stayCoverageGaps.length > 0 && (
                          <p className="mb-1 text-amber-900">
                            {stayCoverageGaps.length} intervalo(s) sem hospedagem: {stayCoverageGaps.slice(0, 2).map((gap) => `${formatDateShort(gap.start)}-${formatDateShort(gap.end)}`).join(', ')}
                          </p>
                        )}
                        {transportCoverageGaps.length > 0 && (
                          <p className="text-amber-900">
                            {transportCoverageGaps.length} troca(s) de cidade sem transporte registrado.
                          </p>
                        )}
                      </div>
                    )}

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
                              {buildMapsUrl('search', { query: [stay.nome, stay.localizacao].filter(Boolean).join(' ') }) && (
                                <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                                  <a href={buildMapsUrl('search', { query: [stay.nome, stay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                                    <MapPin className="h-3 w-3" />
                                    Ver no Google Maps
                                  </a>
                                </Button>
                              )}
                              <div className="flex items-center justify-between">
                                {statusBadge(stay.status)}
                                <div className="flex flex-wrap justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => enrichStay(stay)}
                                    disabled={!canEditTrip || enrichingStayId === stay.id}
                                  >
                                    {enrichingStayId === stay.id ? 'Gerando...' : 'Gerar dicas IA'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => suggestAndSaveRestaurants(stay)}
                                    disabled={!canEditTrip || suggestingRestaurantsStayId === stay.id}
                                  >
                                    {suggestingRestaurantsStayId === stay.id ? 'Sugerindo...' : 'Sugerir restaurantes'}
                                  </Button>
                                  <Button variant="outline" size="icon" aria-label="Editar hospedagem" onClick={() => openEditStay(stay)} disabled={!canEditTrip}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <ConfirmActionButton
                                    ariaLabel="Remover hospedagem"
                                    title="Remover hospedagem"
                                    description="A hospedagem será removida do roteiro e não poderá ser recuperada."
                                    confirmLabel="Remover"
                                    disabled={!canEditTrip || staysModule.isRemoving}
                                    onConfirm={() => removeStay(stay.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </ConfirmActionButton>
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
                  <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Detalhes da hospedagem</DialogTitle>
                      <DialogDescription>Visão rica com informações de apoio da estadia.</DialogDescription>
                    </DialogHeader>
                    {selectedStay && (
                      <div className="space-y-3 text-sm">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-lg font-semibold">{selectedStay.nome || 'Hospedagem'}</p>
                              <p className="text-muted-foreground">{selectedStay.localizacao || 'Localização não informada'}</p>
                            </div>
                            {statusBadge(selectedStay.status)}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Check-in</p>
                              <p className="font-medium">{formatDate(selectedStay.check_in)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Check-out</p>
                              <p className="font-medium">{formatDate(selectedStay.check_out)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Valor</p>
                              <p className="font-medium">{formatCurrency(selectedStay.valor, selectedStay.moeda ?? 'BRL')}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Mapa da hospedagem</p>
                          <div className="mt-2">
                            <Suspense fallback={<div className="h-[220px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
                              <TripOpenMap stays={[selectedStay]} transports={[]} height="clamp(180px, 32vh, 220px)" />
                            </Suspense>
                          </div>
                          {buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') }) && (
                            <Button variant="outline" size="sm" className="mt-2 gap-1.5 text-xs" asChild>
                              <a href={buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                                Abrir no Google Maps
                              </a>
                            </Button>
                          )}
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Como chegar</p>
                          <p className="mt-2 text-muted-foreground">{selectedStay.como_chegar || 'Sem instruções de chegada ainda.'}</p>
                          {buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') }) && (
                            <Button variant="outline" size="sm" className="mt-2 gap-1.5 text-xs" asChild>
                              <a href={buildMapsUrl('search', { query: [selectedStay.nome, selectedStay.localizacao].filter(Boolean).join(' ') })!} target="_blank" rel="noopener noreferrer">
                                <MapPin className="h-3 w-3" />
                                Abrir no Google Maps
                              </a>
                            </Button>
                          )}
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Atrações turísticas</p>
                          {splitInsightList(selectedStay.atracoes_proximas).length === 0 ? (
                            <p className="mt-2 text-muted-foreground">Sem atrações cadastradas.</p>
                          ) : (
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {splitInsightList(selectedStay.atracoes_proximas).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Restaurantes recomendados</p>
                          {splitInsightList(selectedStay.restaurantes_proximos).length === 0 ? (
                            <p className="mt-2 text-muted-foreground">Sem restaurantes sugeridos.</p>
                          ) : (
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {splitInsightList(selectedStay.restaurantes_proximos).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="rounded-xl border bg-primary/5 p-3">
                          <p className="font-semibold text-primary">Dicas personalizadas</p>
                          <p className="mt-2 text-muted-foreground">{stayHighlight(selectedStay)}</p>
                          {selectedStay.dica_ia && (
                            <div className="mt-2 rounded-md border bg-background/80 p-2 text-xs text-muted-foreground">
                              {selectedStay.dica_ia}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Checklist de chegada</p>
                          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <label className="flex items-center gap-2"><input type="checkbox" /> Validar horário de check-in</label>
                            <label className="flex items-center gap-2"><input type="checkbox" /> Confirmar Wi-Fi / café da manhã</label>
                            <label className="flex items-center gap-2"><input type="checkbox" /> Revisar política de cancelamento</label>
                            <label className="flex items-center gap-2"><input type="checkbox" /> Salvar comprovante offline</label>
                          </div>
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Voucher / Comprovante</p>
                          {selectedStayDocuments.length === 0 ? (
                            <p className="mt-2 text-muted-foreground">Nenhum comprovante associado automaticamente.</p>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {selectedStayDocuments.slice(0, 3).map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between rounded-md border bg-background p-2">
                                  <div>
                                    <p className="font-medium">{doc.nome}</p>
                                    <p className="text-xs text-muted-foreground">{doc.tipo || 'Documento importado'}</p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openSupportDocument(doc.arquivo_url)}
                                      disabled={openingDocumentPath === doc.arquivo_url}
                                    >
                                      {openingDocumentPath === doc.arquivo_url ? 'Abrindo...' : 'Abrir'}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => downloadSupportDocument(doc.arquivo_url, doc.nome)}
                                      disabled={downloadingDocumentPath === doc.arquivo_url}
                                    >
                                      {downloadingDocumentPath === doc.arquivo_url ? 'Baixando...' : 'Baixar'}
                                    </Button>
                                    <ConfirmActionButton
                                      ariaLabel="Remover comprovante"
                                      title="Remover comprovante"
                                      description="O comprovante será removido da viagem."
                                      confirmLabel="Remover"
                                      onConfirm={() => removeDocument(doc.id)}
                                      disabled={!canEditTrip}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </ConfirmActionButton>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="pt-2 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => enrichStay(selectedStay)}
                            disabled={!canEditTrip || enrichingStayId === selectedStay.id}
                          >
                            {enrichingStayId === selectedStay.id ? 'Gerando...' : 'Regenerar dicas IA'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => suggestAndSaveRestaurants(selectedStay)}
                            disabled={!canEditTrip || suggestingRestaurantsStayId === selectedStay.id}
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
                          <Button onClick={openCreateTransport} disabled={!canEditTrip}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo transporte
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-2xl">
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
                            <Button onClick={submitTransport} disabled={!canEditTrip || transportsModule.isCreating || transportsModule.isUpdating}>
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

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Trechos no filtro</p>
                        <p className="text-lg font-semibold">{transportStats.total}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Confirmados</p>
                        <p className="text-lg font-semibold">{transportStats.confirmed}</p>
                      </div>
                      <div className="rounded-xl border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Custo somado</p>
                        <p className="text-lg font-semibold">{formatByCurrency(transportStats.byCurrency)}</p>
                      </div>
                    </div>

                    {transportDayChips.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {transportDayChips.map((chip) => (
                          <button
                            key={chip.day}
                            type="button"
                            className={`rounded-2xl border px-3 py-2 text-left ${chip.allConfirmed ? 'border-emerald-400 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}
                          >
                            <p className="text-xs uppercase text-muted-foreground">{chip.label}</p>
                            <p className="text-sm font-semibold">{chip.count} trecho(s)</p>
                          </button>
                        ))}
                      </div>
                    )}

                    <Suspense fallback={<div className="h-[260px] rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Carregando mapa...</div>}>
                      <TripOpenMap
                        stays={staysModule.data}
                        transports={transportFiltered}
                        flights={flightsModule.data}
                        height="clamp(200px, 34vh, 260px)"
                      />
                    </Suspense>

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
                                {buildMapsUrl('route', { origin: transport.origem, destination: transport.destino }) && (
                                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                                    <a href={buildMapsUrl('route', { origin: transport.origem, destination: transport.destino })!} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="h-3 w-3" />
                                      Ver rota
                                    </a>
                                  </Button>
                                )}
                                <div className="flex items-center gap-2">
                                  {statusBadge(transport.status)}
                                  <Button variant="outline" size="icon" aria-label="Editar transporte" onClick={() => openEditTransport(transport)} disabled={!canEditTrip}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <ConfirmActionButton
                                    ariaLabel="Remover transporte"
                                    title="Remover transporte"
                                    description="Esse trecho de transporte será excluído da timeline."
                                    confirmLabel="Remover"
                                    disabled={!canEditTrip || transportsModule.isRemoving}
                                    onConfirm={() => removeTransport(transport.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </ConfirmActionButton>
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
                      <div className="space-y-3 text-sm">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-lg font-semibold">{selectedTransport.origem || 'Origem'} → {selectedTransport.destino || 'Destino'}</p>
                              <p className="text-muted-foreground">{selectedTransport.tipo || 'Transporte'} • {selectedTransport.operadora || 'Operadora não informada'}</p>
                            </div>
                            {statusBadge(selectedTransport.status)}
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Data</p>
                              <p className="font-medium">{formatDateTime(selectedTransport.data)}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Valor</p>
                              <p className="font-medium">{formatCurrency(selectedTransport.valor, selectedTransport.moeda ?? 'BRL')}</p>
                            </div>
                            <div className="rounded-lg border bg-background p-2">
                              <p className="text-[11px] text-muted-foreground">Código da reserva</p>
                              <p className="font-mono text-xs font-semibold">{transportReservationCode(selectedTransport)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Trajeto</p>
                          <div className="mt-3 space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 h-3 w-3 rounded-full bg-primary" />
                              <div>
                                <p className="font-medium">{selectedTransport.origem || 'Origem'}</p>
                                <p className="text-xs text-muted-foreground">Embarque</p>
                              </div>
                            </div>
                            <div className="ml-1 h-8 w-px bg-border" />
                            <div className="flex items-start gap-3">
                              <div className="mt-1 h-3 w-3 rounded-full bg-primary/50" />
                              <div>
                                <p className="font-medium">{selectedTransport.destino || 'Destino'}</p>
                                <p className="text-xs text-muted-foreground">Chegada</p>
                              </div>
                            </div>
                          </div>
                          {buildMapsUrl('route', { origin: selectedTransport.origem, destination: selectedTransport.destino }) && (
                            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" asChild>
                              <a href={buildMapsUrl('route', { origin: selectedTransport.origem, destination: selectedTransport.destino })!} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                                Abrir rota no Google Maps
                              </a>
                            </Button>
                          )}
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="font-semibold">Insights do trajeto</p>
                          <Badge variant="secondary" className="mt-2">{buildTransportInsights(selectedTransport).risk}</Badge>
                          <div className="mt-3">
                            <p className="text-xs font-medium uppercase text-muted-foreground">Dicas do trajeto</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {buildTransportInsights(selectedTransport).tips.slice(0, 3).map((tip) => (
                                <li key={tip}>{tip}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="mt-3">
                            <p className="text-xs font-medium uppercase text-muted-foreground">Ao chegar</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              <li>Confira plataforma/ponto de desembarque antes de sair.</li>
                              <li>Mantenha comprovante e localização offline no celular.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="tarefas" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Tarefas da viagem</CardTitle>
                      <Button
                        variant="outline"
                        disabled={!canEditTrip || generatingTasks}
                        onClick={async () => {
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
                                } catch { /* skip duplicates */ }
                              }
                              toast.success(`${created} tarefa(s) gerada(s) por IA.`);
                            } else {
                              toast.error(result.error || 'Não foi possível gerar tarefas.');
                            }
                          } catch (err) {
                            toast.error('Erro ao gerar tarefas com IA.');
                          } finally {
                            setGeneratingTasks(false);
                          }
                        }}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {generatingTasks ? 'Gerando...' : 'Gerar tarefas com IA'}
                      </Button>
                    </div>
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
                      <Button onClick={createTask} disabled={!canEditTrip || !taskForm.titulo.trim() || tasksModule.isCreating}>
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
                                  disabled={!canEditTrip || tasksModule.isUpdating}
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
                                <ConfirmActionButton
                                  ariaLabel="Remover tarefa"
                                  title="Remover tarefa"
                                  description="Esta tarefa será removida da lista."
                                  confirmLabel="Remover"
                                  disabled={!canEditTrip || tasksModule.isRemoving}
                                  onConfirm={() => removeTask(task.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="roteiro" className="space-y-4">
                <Card className="border-border/50">
                  <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CardTitle className="font-display text-xl">Roteiro da viagem</CardTitle>
                      <Button
                        variant="outline"
                        disabled={!canEditTrip || generatingItinerary}
                        onClick={async () => {
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
                                atracoes_proximas: s.atracoes_proximas,
                                restaurantes_proximos: s.restaurantes_proximos,
                                dica_viagem: s.dica_viagem,
                              })),
                              flights: flightsModule.data.map((f) => ({ origem: f.origem, destino: f.destino, data: f.data })),
                              transports: transportsModule.data.map((t) => ({ tipo: t.tipo, origem: t.origem, destino: t.destino, data: t.data })),
                              restaurants: restaurantsModule.data.filter((r) => r.salvo).map((r) => ({ nome: r.nome, cidade: r.cidade, tipo: r.tipo })),
                            });
                            if (result.data && result.data.length > 0) {
                              // Remove existing AI-generated items first
                              const existingAi = roteiroModule.data.filter((r) => r.sugerido_por_ia);
                              for (const item of existingAi) {
                                try { await roteiroModule.remove(item.id); } catch { /* ok */ }
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
                        }}
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {generatingItinerary ? 'Gerando roteiro...' : 'Gerar roteiro com IA'}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {roteiroModule.isLoading ? (
                      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                        Carregando roteiro...
                      </div>
                    ) : roteiroModule.data.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-8 text-center">
                        <CalendarDays className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Nenhuma atividade no roteiro.</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Clique em "Gerar roteiro com IA" para criar um itinerário dia-a-dia com base na sua viagem.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {(() => {
                          const byDay = new Map<string, typeof roteiroModule.data>();
                          for (const item of roteiroModule.data) {
                            const day = item.dia;
                            if (!byDay.has(day)) byDay.set(day, []);
                            byDay.get(day)!.push(item);
                          }
                          const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));

                          return sortedDays.map(([day, items]) => {
                            const sorted = [...items].sort((a, b) => a.ordem - b.ordem);
                            return (
                              <div key={day} className="rounded-xl border bg-muted/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                  <h3 className="font-display text-lg font-semibold">{formatDate(day)}</h3>
                                  <Badge variant="secondary">{sorted.length} atividade(s)</Badge>
                                </div>
                                <div className="space-y-2">
                                  {sorted.map((item, idx) => (
                                    <div key={item.id} className="flex items-start gap-3 rounded-lg border bg-background p-3">
                                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                                        {idx + 1}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <p className="font-medium">{item.titulo}</p>
                                          {item.horario_sugerido && (
                                            <Badge variant="outline" className="text-xs">
                                              <Clock3 className="mr-1 h-3 w-3" />
                                              {item.horario_sugerido}
                                            </Badge>
                                          )}
                                          <Badge variant="secondary" className="text-xs">{item.categoria}</Badge>
                                        </div>
                                        {item.descricao && (
                                          <p className="mt-1 text-sm text-muted-foreground">{item.descricao}</p>
                                        )}
                                        <div className="mt-1 flex items-center gap-2">
                                          {item.localizacao && (
                                            <span className="flex items-center text-xs text-muted-foreground">
                                              <MapPin className="mr-1 h-3 w-3" />
                                              {item.localizacao}
                                            </span>
                                          )}
                                          {item.link_maps && (
                                            <a
                                              href={item.link_maps}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center text-xs text-primary hover:underline"
                                            >
                                              <ExternalLink className="mr-1 h-3 w-3" />
                                              Maps
                                            </a>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex flex-col gap-1">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          disabled={idx === 0 || !canEditTrip}
                                          onClick={async () => {
                                            const prev = sorted[idx - 1];
                                            await roteiroModule.update({ id: item.id, updates: { ordem: prev.ordem } });
                                            await roteiroModule.update({ id: prev.id, updates: { ordem: item.ordem } });
                                          }}
                                        >
                                          <ChevronUp className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          disabled={idx === sorted.length - 1 || !canEditTrip}
                                          onClick={async () => {
                                            const next = sorted[idx + 1];
                                            await roteiroModule.update({ id: item.id, updates: { ordem: next.ordem } });
                                            await roteiroModule.update({ id: next.id, updates: { ordem: item.ordem } });
                                          }}
                                        >
                                          <ChevronDown className="h-3 w-3" />
                                        </Button>
                                        <ConfirmActionButton
                                          ariaLabel="Remover atividade"
                                          title="Remover atividade"
                                          description="Esta atividade será removida do roteiro."
                                          confirmLabel="Remover"
                                          disabled={!canEditTrip}
                                          onConfirm={() => roteiroModule.remove(item.id)}
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </ConfirmActionButton>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          });
                        })()}
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
                          <Button disabled={!canEditTrip}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nova despesa
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-xl">
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
                              disabled={!canEditTrip || !expenseForm.titulo.trim() || !expenseForm.valor || expensesModule.isCreating}
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
                              <ConfirmActionButton
                                ariaLabel="Remover despesa"
                                title="Remover despesa"
                                description="Essa despesa será removida e os totais serão recalculados."
                                confirmLabel="Remover"
                                disabled={!canEditTrip || expensesModule.isRemoving}
                                onConfirm={() => removeExpense(expense.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </ConfirmActionButton>
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
                      <CardTitle className="text-sm text-muted-foreground">Total real (despesas)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-2xl font-bold">
                        <Wallet className="h-5 w-5 text-primary" />
                        {formatByCurrency(realByCurrency)}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">Baseado em despesas efetivamente lançadas.</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Total estimado (reservas)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatByCurrency(estimadoByCurrency)}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Soma de voos, hospedagens e transportes não cancelados.
                      </p>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>✈ Voos: {formatByCurrency(flightStats.byCurrency)}</p>
                        <p>🏨 Hospedagens: {formatByCurrency(stayStats.byCurrency)}</p>
                        <p>🚌 Transportes: {formatByCurrency(transportStats.byCurrency)}</p>
                      </div>
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
                      <Button onClick={createRestaurant} disabled={!canEditTrip || !restaurantForm.nome.trim() || restaurantsModule.isCreating}>
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
                                  disabled={!canEditTrip || restaurantsModule.isUpdating}
                                >
                                  <Heart className={`mr-1 h-4 w-4 ${item.salvo ? 'fill-current' : ''}`} />
                                  {item.salvo ? 'Favorito' : 'Favoritar'}
                                </Button>
                                <ConfirmActionButton
                                  ariaLabel="Remover restaurante"
                                  title="Remover restaurante"
                                  description="Esse restaurante será removido dos favoritos da viagem."
                                  confirmLabel="Remover"
                                  disabled={!canEditTrip || restaurantsModule.isRemoving}
                                  onConfirm={() => removeRestaurant(item.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
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
                  <div className="space-y-4">
                    <TripUsersPanel tripMembers={tripMembers} currentUserId={user?.id} />

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
                        <Button onClick={createDocument} disabled={!canEditTrip || !supportForms.documentoNome.trim() || documentsModule.isCreating}>Adicionar documento</Button>
                        <div className="space-y-2">
                          {documentsModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum documento.</p>
                          ) : documentsModule.data.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{doc.nome}</span>
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openSupportDocument(doc.arquivo_url)}
                                  disabled={openingDocumentPath === doc.arquivo_url}
                                >
                                  {openingDocumentPath === doc.arquivo_url ? 'Abrindo...' : 'Abrir'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadSupportDocument(doc.arquivo_url, doc.nome)}
                                  disabled={downloadingDocumentPath === doc.arquivo_url}
                                >
                                  {downloadingDocumentPath === doc.arquivo_url ? 'Baixando...' : 'Baixar'}
                                </Button>
                                <ConfirmActionButton
                                  ariaLabel="Remover documento"
                                  title="Remover documento"
                                  description="O documento de apoio será removido da viagem."
                                  confirmLabel="Remover"
                                  onConfirm={() => removeDocument(doc.id)}
                                  disabled={!canEditTrip}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
                              </div>
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
                        <Button onClick={createLuggageItem} disabled={!canEditTrip || !supportForms.bagagemItem.trim() || luggageModule.isCreating}>Adicionar item</Button>
                        <div className="space-y-2">
                          {luggageModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum item.</p>
                          ) : luggageModule.data.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{item.item} · {item.quantidade}x</span>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => toggleLuggageChecked(item)} disabled={!canEditTrip}>{item.conferido ? 'Desmarcar' : 'Conferir'}</Button>
                                <ConfirmActionButton
                                  ariaLabel="Remover item de bagagem"
                                  title="Remover item de bagagem"
                                  description="Esse item será removido da checklist de bagagem."
                                  confirmLabel="Remover"
                                  onConfirm={() => removeLuggageItem(item.id)}
                                  disabled={!canEditTrip}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
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
                        <Button onClick={createTraveler} disabled={!canEditTrip || !supportForms.viajanteNome.trim() || travelersModule.isCreating}>Adicionar viajante</Button>
                        <div className="space-y-2">
                          {travelersModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum viajante.</p>
                          ) : travelersModule.data.map((traveler) => (
                            <div key={traveler.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span>{traveler.nome}</span>
                              <ConfirmActionButton
                                ariaLabel="Remover viajante"
                                title="Remover viajante"
                                description="Esse viajante será removido da lista da viagem."
                                confirmLabel="Remover"
                                onConfirm={() => removeTraveler(traveler.id)}
                                disabled={!canEditTrip}
                              >
                                <Trash2 className="h-4 w-4" />
                              </ConfirmActionButton>
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
                        <Button onClick={createPrepItem} disabled={!canEditTrip || !supportForms.preparativoTitulo.trim() || prepModule.isCreating}>Adicionar preparativo</Button>
                        <div className="space-y-2">
                          {prepModule.data.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nenhum preparativo.</p>
                          ) : prepModule.data.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                              <span className={item.concluido ? 'line-through text-muted-foreground' : ''}>{item.titulo}</span>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => togglePrepDone(item)} disabled={!canEditTrip}>{item.concluido ? 'Reabrir' : 'Concluir'}</Button>
                                <ConfirmActionButton
                                  ariaLabel="Remover preparativo"
                                  title="Remover preparativo"
                                  description="Este preparativo será removido da checklist."
                                  confirmLabel="Remover"
                                  onConfirm={() => removePrepItem(item.id)}
                                  disabled={!canEditTrip}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </ConfirmActionButton>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
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
