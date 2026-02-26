import { ReactNode } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ThemeToggle } from '@/components/dashboard/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DASHBOARD_TABS } from '@/pages/dashboardHelpers';
import { LogOut } from 'lucide-react';

interface DashboardShellProps {
  userEmail?: string | null;
  trips: Array<{ id: string; nome: string }>;
  currentTripId?: string | null;
  onSelectTrip: (tripId: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void | Promise<void>;
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
  children,
}: DashboardShellProps) {
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
