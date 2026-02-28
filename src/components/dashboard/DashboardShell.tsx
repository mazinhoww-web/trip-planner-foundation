import { ReactNode, useState } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { MobileBottomNav } from '@/components/dashboard/MobileBottomNav';
import { MobileNavDrawer } from '@/components/dashboard/MobileNavDrawer';
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
import { Bell, LogOut, Menu } from 'lucide-react';

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
  const highPriorityCount = notifications.filter((n) => n.severity === 'high').length;
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-slate-50/70 to-slate-100/70 dark:via-slate-900/65 dark:to-slate-950/75">
      {/* ── HEADER ── */}
      <header className="sticky top-0 z-20 border-b border-primary/15 bg-white/92 backdrop-blur-lg dark:bg-slate-950/85"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-[1220px] items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6 sm:py-4">
          {/* Left: logo + title */}
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandLogo className="shrink-0" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold font-display leading-none sm:text-xl">Trip Planner</h1>
              <p className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block sm:text-xs">
                Experiência co-brand LATAM Airlines + LATAM Pass
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Trip selector — hidden on very small, shown sm+ */}
            {trips.length > 1 && (
              <Select value={currentTripId ?? ''} onValueChange={onSelectTrip}>
                <SelectTrigger className="hidden h-9 w-[160px] sm:flex sm:w-[200px]">
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

            {/* Notifications — icon-only on mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="relative h-9 w-9">
                  <Bell className="h-4 w-4" />
                  {notifications.length > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                      {notifications.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[300px] sm:w-[320px]">
                <DropdownMenuLabel className="flex items-center justify-between">
                  Notificações
                  {highPriorityCount > 0 && (
                    <span className="text-[11px] font-medium text-rose-600">{highPriorityCount} crítica(s)</span>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <DropdownMenuItem disabled>Nenhum alerta no momento.</DropdownMenuItem>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onSelect={() => onNotificationSelect?.(n.tabKey)}
                      className="cursor-pointer flex-col items-start gap-0.5 py-2"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-medium">{n.title}</span>
                        <span className={`text-[10px] font-semibold uppercase ${n.severity === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>
                          {n.severity === 'high' ? 'Alta' : 'Média'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{n.description}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Email — only lg+ */}
            <span className="hidden text-sm text-muted-foreground lg:block">{userEmail}</span>

            {/* Logout — icon-only on mobile, with text on sm+ */}
            <Button variant="outline" size="icon" className="h-9 w-9 sm:hidden" onClick={onLogout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="hidden h-9 px-3 sm:inline-flex" onClick={onLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>

            {/* Hamburger — xl: hidden (sidebar visible) */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 xl:hidden"
              onClick={() => setMoreOpen(true)}
              aria-label="Menu de módulos"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Mobile trip selector row — only when multiple trips & on small screens */}
        {trips.length > 1 && (
          <div className="border-t border-border/40 px-3 py-1.5 sm:hidden">
            <Select value={currentTripId ?? ''} onValueChange={onSelectTrip}>
              <SelectTrigger className="h-8 w-full text-xs">
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
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main className="mx-auto max-w-[1220px] px-3 py-4 pb-20 sm:px-6 sm:py-8 xl:pb-8">
        <div className="grid gap-6 xl:grid-cols-[220px_1fr]">
          {/* Desktop sidebar */}
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

      {/* ── MOBILE NAV ── */}
      <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} onOpenMore={() => setMoreOpen(true)} />
      <MobileNavDrawer open={moreOpen} onOpenChange={setMoreOpen} activeTab={activeTab} onTabChange={onTabChange} />
    </div>
  );
}
