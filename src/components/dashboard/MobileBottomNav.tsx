import { DASHBOARD_TABS } from '@/pages/dashboardHelpers';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_TABS = DASHBOARD_TABS.slice(0, 4); // Dashboard, Voos, Hospedagens, Transportes

type MobileBottomNavProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenMore: () => void;
};

export function MobileBottomNav({ activeTab, onTabChange, onOpenMore }: MobileBottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-lg xl:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        {QUICK_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] transition-colors',
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
              <span className="leading-none">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className="leading-none">Mais</span>
        </button>
      </div>
    </nav>
  );
}
