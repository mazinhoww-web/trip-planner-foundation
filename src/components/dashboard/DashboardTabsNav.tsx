import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LucideIcon } from 'lucide-react';

type DashboardTabItem = {
  key: string;
  label: string;
  icon: LucideIcon;
};

type DashboardTabsNavProps = {
  tabs: DashboardTabItem[];
};

export function DashboardTabsNav({ tabs }: DashboardTabsNavProps) {
  return (
    <div className="overflow-x-auto pb-1 tp-scroll">
      <TabsList
        className="inline-flex h-auto w-max min-w-full snap-x snap-mandatory items-center gap-2 rounded-2xl border border-primary/15 bg-white/90 p-2 shadow-sm dark:bg-card/80"
        aria-label="Navegação entre módulos da viagem"
      >
        {tabs.map((tab) => (
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
  );
}
