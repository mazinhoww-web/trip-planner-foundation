import { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DASHBOARD_TABS } from '@/pages/dashboardHelpers';
import { Bell, LogOut } from 'lucide-react';

export type DashboardNotification = {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium';
  tabKey: string;
};

interface DashboardShellProps {
  userEmail?: string | null;
  trips: Array<{ id: string; nome: string }>;
  currentTripId?: string | null;
  onSelectTrip: (tripId: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void | Promise<void>;
  notifications?: DashboardNotification[];
  onNotificationSelect?: (tab: string) => void;
  children: ReactNode;
}

export function DashboardShell({
  userEmail,
  trips,
  currentTripId,
  onSelectTrip,
  activeTab,
  onTabChange,
  onLogout,
  notifications = [],
  onNotificationSelect,
  children,
}: DashboardShellProps) {
  const highPriorityCount = notifications.filter((notification) => notification.severity === 'high').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-50/70 to-slate-100/70 dark:via-slate-900/65 dark:to-slate-950/75">
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-white/92 backdrop-blur-lg dark:bg-slate-950/85">
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
              <Select value={currentTripId ?? ''} onValueChange={onSelectTrip}>
                <SelectTrigger className="h-9 w-[160px] sm:w-[200px]">
                  <SelectValue placeholder="Selecionar viagem" />
                </SelectTrigger>
                <SelectContent>
                  {trips.map((trip) => (
                    <SelectItem key={trip.id} value={trip.id}>
                      {trip.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 px-3">
                  <Bell className="mr-2 h-4 w-4" />
                  Alertas
                  {notifications.length > 0 ? (
                    <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] leading-none text-primary-foreground">
                      {notifications.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[320px]">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notificações da viagem
                  {highPriorityCount > 0 ? (
                    <span className="text-[11px] font-medium text-rose-600">{highPriorityCount} crítica(s)</span>
                  ) : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem disabled>Nenhum alerta no momento.</DropdownMenuItem>
                ) : (
                  notifications.map((notification) => (
                    <DropdownMenuItem
                      key={notification.id}
                      onSelect={() => onNotificationSelect?.(notification.tabKey)}
                      className="cursor-pointer flex-col items-start gap-0.5 py-2"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{notification.title}</span>
                        <span
                          className={`text-[10px] font-semibold uppercase ${
                            notification.severity === 'high' ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        >
                          {notification.severity === 'high' ? 'Alta' : 'Média'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{notification.description}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="hidden text-sm text-muted-foreground lg:block">{userEmail}</span>
            <Button variant="outline" size="sm" className="h-9 px-3" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1220px] px-4 py-8 sm:px-6">
        <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
          <aside className="hidden xl:block">
            <div className="tp-surface sticky top-[96px] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Módulos</p>
              <div className="mt-3 space-y-1">
                {DASHBOARD_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => onTabChange(tab.key)}
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

          <section>{children}</section>
        </div>
      </main>
    </div>
  );
}
