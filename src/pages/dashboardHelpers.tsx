import { Badge } from '@/components/ui/badge';
import { Tables } from '@/integrations/supabase/types';
import {
  Briefcase,
  Bus,
  CalendarDays,
  DollarSign,
  FileText,
  Hotel,
  ListTodo,
  Package,
  Plane,
  TrendingUp,
  type LucideIcon,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';

type StatCard = { label: string; icon: LucideIcon; key: string };
type DashboardTab = { key: string; label: string; icon: LucideIcon };

export const statCards: StatCard[] = [
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

export const DASHBOARD_TABS: DashboardTab[] = [
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

export type ReservaStatus = 'confirmado' | 'pendente' | 'cancelado';
export type TarefaPrioridade = 'baixa' | 'media' | 'alta';

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

export function statusBadge(status: ReservaStatus) {
  return (
    <Badge variant="outline" className={STATUS_BADGE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function prioridadeBadge(prioridade: TarefaPrioridade) {
  return (
    <Badge variant="outline" className={PRIORIDADE_BADGE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

export function toDateTimeLocal(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(date?: string | null) {
  if (!date) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
}

export function formatDateShort(date?: string | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${date}T12:00:00`));
}

export function formatCurrency(value?: number | null, currency: string = 'BRL') {
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

export function formatByCurrency(items: { currency: string; total: number }[]) {
  if (items.length === 0) return 'Sem valor';
  return items.map((item) => formatCurrency(item.total, item.currency)).join(' + ');
}

export function normalizeDate(value?: string | null) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function dateDiffInDays(start: string, end: string) {
  const left = new Date(`${start}T00:00:00Z`).getTime();
  const right = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((right - left) / (1000 * 60 * 60 * 24)));
}

export function buildMapsUrl(
  type: 'route' | 'search',
  opts: { origin?: string | null; destination?: string | null; query?: string | null },
) {
  if (type === 'route') {
    const origin = opts.origin ?? '';
    const destination = opts.destination ?? '';
    if (!origin && !destination) return null;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;
  }
  const query = opts.query ?? '';
  if (!query.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function tripCoverImage(destination?: string | null) {
  const dest = (destination ?? '').toLowerCase();
  if (dest.includes('suica') || dest.includes('austria') || dest.includes('switz') || dest.includes('alpes')) {
    return 'https://images.unsplash.com/photo-1508261305438-4dc5f19834f4?auto=format&fit=crop&w=1600&q=80';
  }
  if (dest.includes('praia') || dest.includes('ilha')) {
    return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80';
  }
  return 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80';
}

export type DayChip = {
  day: string;
  label: string;
  count: number;
  allConfirmed: boolean;
};

export function buildDayChips<T>(
  items: T[],
  getDate: (item: T) => string | null,
  getStatus: (item: T) => ReservaStatus,
): DayChip[] {
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
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, data]) => ({
      day,
      label: formatDateShort(day),
      count: data.count,
      allConfirmed: data.allConfirmed,
    }))
    .slice(0, 6);
}

export function buildTransportInsights(transport: Tables<'transportes'>) {
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

export function splitInsightList(value: string | null | undefined, limit: number = 8) {
  if (!value) return [];
  return value
    .split(/\n|;|•/g)
    .map((item) => item.trim().replace(/^[\-\*]\s*/, ''))
    .filter(Boolean)
    .slice(0, limit);
}

export function stayHighlight(stay: Tables<'hospedagens'>) {
  return stay.dica_viagem || stay.dica_ia || 'Aproveite tours de trem panorâmico e confirme reservas com antecedência.';
}

export function transportReservationCode(transport: Tables<'transportes'>) {
  const compact = transport.id.replace(/-/g, '').slice(0, 14).toUpperCase();
  return compact || 'N/A';
}

export type FlightFormState = {
  numero: string;
  companhia: string;
  origem: string;
  destino: string;
  data: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
};

export type StayFormState = {
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

export type TransportFormState = {
  tipo: string;
  operadora: string;
  origem: string;
  destino: string;
  data: string;
  status: ReservaStatus;
  valor: string;
  moeda: string;
};

export type TaskFormState = {
  titulo: string;
  categoria: string;
  prioridade: TarefaPrioridade;
};

export type ExpenseFormState = {
  titulo: string;
  valor: string;
  moeda: string;
  categoria: string;
  data: string;
};

export type RestaurantFormState = {
  nome: string;
  cidade: string;
  tipo: string;
  rating: string;
};

export type SupportForms = {
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

export const emptyFlight: FlightFormState = {
  numero: '',
  companhia: '',
  origem: '',
  destino: '',
  data: '',
  status: 'pendente',
  valor: '',
  moeda: 'BRL',
};

export const emptyStay: StayFormState = {
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

export const emptyTransport: TransportFormState = {
  tipo: '',
  operadora: '',
  origem: '',
  destino: '',
  data: '',
  status: 'pendente',
  valor: '',
  moeda: 'BRL',
};

export const emptyTask: TaskFormState = {
  titulo: '',
  categoria: '',
  prioridade: 'media',
};

export const emptyExpense: ExpenseFormState = {
  titulo: '',
  valor: '',
  moeda: 'BRL',
  categoria: '',
  data: '',
};

export const emptyRestaurant: RestaurantFormState = {
  nome: '',
  cidade: '',
  tipo: '',
  rating: '',
};

export const emptySupportForms: SupportForms = {
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
