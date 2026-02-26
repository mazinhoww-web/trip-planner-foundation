import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type DashboardTabPanelFallbackProps = {
  label: string;
};

export function DashboardTabPanelFallback({ label }: DashboardTabPanelFallbackProps) {
  return (
    <Card className="border-border/50">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <Skeleton className="h-40 w-full" />
        <p className="text-xs text-muted-foreground">Carregando {label}...</p>
      </CardContent>
    </Card>
  );
}
