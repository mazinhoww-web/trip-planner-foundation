import { Dispatch, SetStateAction, useState } from 'react';
import { toast } from 'sonner';
import { Tables, TablesInsert } from '@/integrations/supabase/types';
import { TripMembersState } from '@/hooks/useTripMembers';
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
import { generateItinerary, generateTripTasks } from '@/services/ai';
import {
  emptyExpense,
  emptyRestaurant,
  emptyTask,
  type ExpenseFormState,
  type RestaurantFormState,
  type TarefaPrioridade,
  type TaskFormState,
} from '@/pages/dashboardHelpers';

type TasksModule = ReturnType<typeof useTasks>;
type ExpensesModule = ReturnType<typeof useExpenses>;
type RestaurantsModule = ReturnType<typeof useRestaurants>;
type FlightsModule = ReturnType<typeof useFlights>;
type StaysModule = ReturnType<typeof useStays>;
type TransportsModule = ReturnType<typeof useTransports>;
type RoteiroModule = ReturnType<typeof useRoteiro>;
type DocumentsModule = ReturnType<typeof useDocuments>;
type LuggageModule = ReturnType<typeof useLuggage>;
type TravelersModule = ReturnType<typeof useTravelers>;
type PreparativosModule = ReturnType<typeof usePreparativos>;

type UseTripOperationsOptions = {
  ensureCanEdit: () => boolean;
  currentTripDestination?: string | null;
  currentTripStartDate?: string | null;
  currentTripEndDate?: string | null;
  userHomeCity?: string | null;
  tasksModule: TasksModule;
  expensesModule: ExpensesModule;
  restaurantsModule: RestaurantsModule;
  flightsModule: FlightsModule;
  staysModule: StaysModule;
  transportsModule: TransportsModule;
  roteiroModule: RoteiroModule;
  documentsModule: DocumentsModule;
  luggageModule: LuggageModule;
  travelersModule: TravelersModule;
  prepModule: PreparativosModule;
  tripMembers: TripMembersState;
  taskForm: TaskFormState;
  setTaskForm: Dispatch<SetStateAction<TaskFormState>>;
  expenseForm: ExpenseFormState;
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormState>>;
  setExpenseDialogOpen: Dispatch<SetStateAction<boolean>>;
  restaurantForm: RestaurantFormState;
  setRestaurantForm: Dispatch<SetStateAction<RestaurantFormState>>;
};

type UseTripOperationsResult = {
  isReconciling: boolean;
  generatingTasks: boolean;
  generatingItinerary: boolean;
  createTask: () => Promise<void>;
  toggleTask: (task: Tables<'tarefas'>) => Promise<void>;
  removeTask: (id: string) => Promise<void>;
  generateTasksWithAi: () => Promise<void>;
  generateRoteiroWithAi: () => Promise<void>;
  createRoteiroEntry: (entry: {
    dia: string;
    titulo: string;
    descricao?: string | null;
    localizacao?: string | null;
    link_maps?: string | null;
  }) => Promise<void>;
  reorderRoteiroItem: (current: Tables<'roteiro_dias'>, target: Tables<'roteiro_dias'>) => Promise<void>;
  removeRoteiroItem: (id: string) => Promise<void>;
  createExpense: () => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  reconcileFromServer: () => Promise<void>;
  createRestaurant: () => Promise<void>;
  toggleRestaurantFavorite: (restaurant: Tables<'restaurantes'>) => Promise<void>;
  removeRestaurant: (id: string) => Promise<void>;
};

export function useTripOperations({
  ensureCanEdit,
  currentTripDestination,
  currentTripStartDate,
  currentTripEndDate,
  userHomeCity,
  tasksModule,
  expensesModule,
  restaurantsModule,
  flightsModule,
  staysModule,
  transportsModule,
  roteiroModule,
  documentsModule,
  luggageModule,
  travelersModule,
  prepModule,
  tripMembers,
  taskForm,
  setTaskForm,
  expenseForm,
  setExpenseForm,
  setExpenseDialogOpen,
  restaurantForm,
  setRestaurantForm,
}: UseTripOperationsOptions): UseTripOperationsResult {
  const [isReconciling, setIsReconciling] = useState(false);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [generatingItinerary, setGeneratingItinerary] = useState(false);

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
        destination: currentTripDestination,
        startDate: currentTripStartDate,
        endDate: currentTripEndDate,
        userHomeCity,
        flights: flightsModule.data.map((flight) => ({ origem: flight.origem, destino: flight.destino })),
        stays: staysModule.data.map((stay) => ({ localizacao: stay.localizacao, check_in: stay.check_in })),
        existingTasks: tasksModule.data.map((task) => task.titulo),
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
        destination: currentTripDestination,
        startDate: currentTripStartDate,
        endDate: currentTripEndDate,
        userHomeCity,
        stays: staysModule.data.map((stay) => ({
          nome: stay.nome,
          localizacao: stay.localizacao,
          check_in: stay.check_in,
          check_out: stay.check_out,
          hora_check_in: '15:00',
          hora_check_out: '11:00',
          atracoes_proximas: stay.atracoes_proximas,
          restaurantes_proximos: stay.restaurantes_proximos,
          dica_viagem: stay.dica_viagem,
        })),
        flights: flightsModule.data.map((flight) => {
          const parsedDate = flight.data ? new Date(flight.data) : null;
          const hora = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(11, 16) : null;
          return {
            origem: flight.origem,
            destino: flight.destino,
            data: flight.data,
            hora_partida: hora,
            hora_chegada: hora,
          };
        }),
        transports: transportsModule.data.map((transport) => {
          const parsedDate = transport.data ? new Date(transport.data) : null;
          const hora = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(11, 16) : null;
          return { tipo: transport.tipo, origem: transport.origem, destino: transport.destino, data: transport.data, hora };
        }),
        restaurants: restaurantsModule.data
          .filter((restaurant) => restaurant.salvo)
          .map((restaurant) => ({ nome: restaurant.nome, cidade: restaurant.cidade, tipo: restaurant.tipo })),
      });
      if (result.data && result.data.length > 0) {
        const existingAi = roteiroModule.data.filter((item) => item.sugerido_por_ia);
        for (const item of existingAi) {
          try {
            await roteiroModule.remove(item.id);
          } catch {
            // Ignore cleanup failures.
          }
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
          } catch {
            // Ignore duplicated items.
          }
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

  const createRoteiroEntry = async (entry: {
    dia: string;
    titulo: string;
    descricao?: string | null;
    localizacao?: string | null;
    link_maps?: string | null;
  }) => {
    if (!ensureCanEdit()) return;
    if (!entry.dia || !entry.titulo.trim()) return;

    const sameDayItems = roteiroModule.data.filter((item) => item.dia === entry.dia);
    const highestOrder = sameDayItems.reduce((max, item) => Math.max(max, Number(item.ordem || 0)), 0);

    await roteiroModule.create({
      dia: entry.dia,
      ordem: highestOrder + 1,
      titulo: entry.titulo.trim(),
      descricao: entry.descricao?.trim() || null,
      localizacao: entry.localizacao?.trim() || null,
      link_maps: entry.link_maps?.trim() || null,
      categoria: 'Diário',
      horario_sugerido: null,
      sugerido_por_ia: false,
    });
  };

  const reorderRoteiroItem = async (current: Tables<'roteiro_dias'>, target: Tables<'roteiro_dias'>) => {
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

  return {
    isReconciling,
    generatingTasks,
    generatingItinerary,
    createTask,
    toggleTask,
    removeTask,
    generateTasksWithAi,
    generateRoteiroWithAi,
    createRoteiroEntry,
    reorderRoteiroItem,
    removeRoteiroItem,
    createExpense,
    removeExpense,
    reconcileFromServer,
    createRestaurant,
    toggleRestaurantFavorite,
    removeRestaurant,
  };
}
