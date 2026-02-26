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
import { OnboardingWizard } from '@/components/dashboard/OnboardingWizard';
import { TripCollaborationBanner, TripViewerNotice } from '@/components/dashboard/TripCollaborationPanels';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import type { DashboardNotification } from '@/components/dashboard/DashboardShell';
import { DashboardTabsNav } from '@/components/dashboard/DashboardTabsNav';
import { DashboardTabPanelFallback } from '@/components/dashboard/DashboardTabPanelFallback';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Tables } from '@/integrations/supabase/types';
import { Compass, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { useTripExportActions } from '@/hooks/useTripExportActions';
import { useReservationActions } from '@/hooks/useReservationActions';
import { useSupportResources } from '@/hooks/useSupportResources';
import { useTripOperations } from '@/hooks/useTripOperations';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { useDestinationWeather } from '@/hooks/useDestinationWeather';
import {
  buildMapsUrl,
  buildTransportInsights,
  DASHBOARD_TABS,
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
  prioridadeBadge,
  splitInsightList,
  statCards,
  statusBadge,
  stayHighlight,
  transportReservationCode,
  tripCoverImage,
  type ExpenseFormState,
  type FlightFormState,
  type ReservaStatus,
  type RestaurantFormState,
  type StayFormState,
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

const TRIP_CLONE_TABLES = [
  'voos',
  'hospedagens',
  'transportes',
  'tarefas',
  'despesas',
  'restaurantes',
  'documentos',
  'bagagem',
  'viajantes',
  'preparativos',
  'roteiro_dias',
] as const;

function sanitizeCloneRow(row: Record<string, unknown>, viagemId: string, userId: string) {
  const draft: Record<string, unknown> = { ...row, viagem_id: viagemId };
  delete draft.id;
  delete draft.created_at;
  delete draft.updated_at;
  if ('user_id' in draft) {
    draft.user_id = userId;
  }
  return draft;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { currentTrip, currentTripId, trips, loading: tripLoading, selectTrip, refreshTrips } = useTrip();
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
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [isCloningTrip, setIsCloningTrip] = useState(false);

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
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null);
  const fallbackCanEdit = !!currentTrip && currentTrip.user_id === user?.id;
  const canEditTrip = tripMembers.permission.role ? tripMembers.permission.canEdit : fallbackCanEdit;
  const aiImportGate = useFeatureGate('ff_ai_import_enabled');
  const collabGate = useFeatureGate('ff_collab_enabled');
  const exportPdfGate = useFeatureGate('ff_export_pdf');
  const exportJsonGate = useFeatureGate('ff_export_json_full');
  const publicApiGate = useFeatureGate('ff_public_api_access');
  const webhookGate = useFeatureGate('ff_webhooks_enabled');
  const { isExportingData, exportJson, exportPdf, exportIcs } = useTripExportActions(currentTripId);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user?.id || !currentTripId) return;
    const storageKey = `tp_onboarding_seen:${user.id}`;
    const seen = window.localStorage.getItem(storageKey);
    if (seen) return;
    setOnboardingOpen(true);
  }, [user?.id, currentTripId]);

  const completeOnboarding = () => {
    if (typeof window === 'undefined' || !user?.id) return;
    window.localStorage.setItem(`tp_onboarding_seen:${user.id}`, new Date().toISOString());
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const handleCloneTrip = async () => {
    if (!currentTrip || !user?.id) return;
    if (!ensureCanEdit()) return;

    setIsCloningTrip(true);
    try {
      const tripName = `${currentTrip.nome} (cópia)`;
      const { data: clonedTrip, error: cloneTripError } = await supabase
        .from('viagens')
        .insert({
          user_id: user.id,
          nome: tripName,
          destino: currentTrip.destino,
          data_inicio: currentTrip.data_inicio,
          data_fim: currentTrip.data_fim,
          status: 'planejada',
        })
        .select('*')
        .single();

      if (cloneTripError || !clonedTrip?.id) {
        throw cloneTripError ?? new Error('Não foi possível criar a viagem clonada.');
      }

      const cloneResults = await Promise.all(
        TRIP_CLONE_TABLES.map(async (table) => {
          const { data: sourceRows, error: sourceError } = await supabase
            .from(table)
            .select('*')
            .eq('viagem_id', currentTrip.id);
          if (sourceError) {
            return { table, copied: 0, error: sourceError };
          }

          const rows = (sourceRows ?? []) as Array<Record<string, unknown>>;
          if (rows.length === 0) {
            return { table, copied: 0, error: null };
          }

          const payload = rows.map((row) => sanitizeCloneRow(row, clonedTrip.id, user.id));
          const { error: insertError } = await supabase
            .from(table)
            .insert(payload as never);

          return { table, copied: insertError ? 0 : payload.length, error: insertError };
        }),
      );

      const failures = cloneResults.filter((result) => result.error);
      await refreshTrips();
      selectTrip(clonedTrip.id);

      if (failures.length > 0) {
        toast.warning(`Viagem clonada com ${failures.length} módulo(s) pendentes para revisão.`);
      } else {
        toast.success('Viagem clonada com sucesso.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível clonar a viagem agora.';
      toast.error(message);
    } finally {
      setIsCloningTrip(false);
    }
  };

  const ensureCanEdit = () => {
    if (canEditTrip) return true;
    toast.error('Você está com papel de visualização nesta viagem.');
    return false;
  };
  const [userHomeCity, setUserHomeCity] = useState<string | null>(null);
  const [dismissedGapKeys, setDismissedGapKeys] = useState<Set<string>>(new Set());

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

  const handleDismissGap = (key: string) => {
    setDismissedGapKeys((prev) => new Set(prev).add(key));
  };

  const {
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
    tripCountdown,
    smartChecklistItems,
    flightStats,
    stayStats,
    transportStats,
  } = useDashboardMetrics({
    currentTrip,
    flights: flightsModule.data,
    stays: staysModule.data,
    transports: transportsModule.data,
    tasks: tasksModule.data,
    expenses: expensesModule.data,
    restaurants: restaurantsModule.data,
    documents: documentsModule.data,
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
  });
  const destinationWeatherQuery = useDestinationWeather(currentTrip?.destino ?? null, currentTrip?.data_inicio ?? null);

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

  const pendingTasksTotal = useMemo(
    () => tasksModule.data.filter((task) => !task.concluida).length,
    [tasksModule.data],
  );

  const dashboardNotifications = useMemo<DashboardNotification[]>(() => {
    const notifications: DashboardNotification[] = [];

    if (stayGapLines.length > 0) {
      notifications.push({
        id: 'stay-gaps',
        title: 'Hospedagens pendentes',
        description: `${stayGapLines.length} período(s) sem cobertura.`,
        severity: 'high',
        tabKey: 'hospedagens',
      });
    }

    if (transportGapLines.length > 0) {
      notifications.push({
        id: 'transport-gaps',
        title: 'Transporte incompleto',
        description: `${transportGapLines.length} trecho(s) sem deslocamento confirmado.`,
        severity: 'high',
        tabKey: 'transportes',
      });
    }

    if (pendingTasksTotal > 0) {
      notifications.push({
        id: 'tasks-pending',
        title: 'Tarefas pendentes',
        description: `${pendingTasksTotal} tarefa(s) aberta(s) para concluir.`,
        severity: 'medium',
        tabKey: 'tarefas',
      });
    }

    if (daysUntilTrip != null && daysUntilTrip <= 7) {
      notifications.push({
        id: 'trip-near',
        title: 'Viagem próxima',
        description: `Partida em ${daysUntilTrip} dia(s). Revise comprovantes e horários.`,
        severity: 'medium',
        tabKey: 'visao',
      });
    }

    return notifications.slice(0, 5);
  }, [daysUntilTrip, pendingTasksTotal, stayGapLines.length, transportGapLines.length]);

  useEffect(() => {
    if (flightDialogOpen) setFlightDetailOpen(false);
  }, [flightDialogOpen]);

  useEffect(() => {
    if (stayDialogOpen) setStayDetailOpen(false);
  }, [stayDialogOpen]);

  useEffect(() => {
    if (transportDialogOpen) setTransportDetailOpen(false);
  }, [transportDialogOpen]);

  const {
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
  } = useReservationActions({
    ensureCanEdit,
    currentTripDestination: currentTrip?.destino ?? null,
    userHomeCity: inferredHomeCity,
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
  });

  const {
    isReconciling,
    generatingTasks,
    generatingItinerary,
    createTask,
    toggleTask,
    removeTask,
    generateTasksWithAi,
    generateRoteiroWithAi,
    reorderRoteiroItem,
    removeRoteiroItem,
    createExpense,
    removeExpense,
    reconcileFromServer,
    createRestaurant,
    toggleRestaurantFavorite,
    removeRestaurant,
  } = useTripOperations({
    ensureCanEdit,
    currentTripDestination: currentTrip?.destino ?? null,
    currentTripStartDate: currentTrip?.data_inicio ?? null,
    currentTripEndDate: currentTrip?.data_fim ?? null,
    userHomeCity: inferredHomeCity,
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
  });

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
    <DashboardShell
      userEmail={user?.email}
      trips={trips}
      currentTripId={currentTripId}
      onSelectTrip={selectTrip}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onLogout={handleLogout}
      notifications={dashboardNotifications}
      onNotificationSelect={setActiveTab}
    >
      {currentTrip ? (
        <>
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
              <Button
                variant="outline"
                className="w-full border-primary/25 text-primary hover:bg-primary/5 sm:w-auto"
                onClick={() => setOnboardingOpen(true)}
              >
                <Compass className="mr-2 h-4 w-4" />
                Tour rápido
              </Button>
              <Button
                variant="outline"
                className="w-full border-primary/25 text-primary hover:bg-primary/5 sm:w-auto"
                onClick={() => void handleCloneTrip()}
                disabled={!canEditTrip || isCloningTrip}
              >
                <Copy className="mr-2 h-4 w-4" />
                {isCloningTrip ? 'Clonando...' : 'Clonar viagem'}
              </Button>
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
              <DashboardTabsNav tabs={DASHBOARD_TABS} />

              <TabsContent value="visao" className="space-y-4">
                <Suspense fallback={<DashboardTabPanelFallback label="dashboard" />}>
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
                    weatherSummary={destinationWeatherQuery.data ?? null}
                    weatherLoading={destinationWeatherQuery.isLoading}
                    weatherError={destinationWeatherQuery.error instanceof Error ? destinationWeatherQuery.error.message : null}
                    smartChecklistItems={smartChecklistItems}
                    onOpenTab={setActiveTab}
                    tripCountdown={tripCountdown}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="voos" className="space-y-4">
                <Suspense fallback={<DashboardTabPanelFallback label="voos" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="hospedagens" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="transportes" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="tarefas" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="roteiro" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="despesas" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="orçamento" />}>
                  <BudgetTabPanel
                    canExportPdf={exportPdfGate.enabled}
                    canExportJson={exportJsonGate.enabled}
                    canExportIcs={exportJsonGate.enabled}
                    isExportingData={isExportingData}
                    planTier={collabGate.planTier}
                    onExportJson={exportJson}
                    onExportPdf={exportPdf}
                    onExportIcs={exportIcs}
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
                <Suspense fallback={<DashboardTabPanelFallback label="gastronomia" />}>
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
                <Suspense fallback={<DashboardTabPanelFallback label="apoio" />}>
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
            <OnboardingWizard
              open={onboardingOpen}
              onOpenChange={(next) => {
                if (!next) completeOnboarding();
                setOnboardingOpen(next);
              }}
              onNavigateTab={setActiveTab}
              onComplete={completeOnboarding}
            />
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-muted-foreground">Nenhuma viagem encontrada.</p>
        </div>
      )}
    </DashboardShell>
  );
}
