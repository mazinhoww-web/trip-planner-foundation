import { DASHBOARD_TABS } from '@/pages/dashboardHelpers';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type MobileNavDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function MobileNavDrawer({ open, onOpenChange, activeTab, onTabChange }: MobileNavDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl pb-8"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
      >
        <SheetHeader>
          <SheetTitle className="font-display">Módulos da viagem</SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {DASHBOARD_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  onTabChange(tab.key);
                  onOpenChange(false);
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <tab.icon className="h-5 w-5" />
                <span className="font-medium leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
