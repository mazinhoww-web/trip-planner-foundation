import { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type StatCardConfig = {
  label: string;
  icon: LucideIcon;
  key: string;
};

type TripStatsGridProps = {
  cards: StatCardConfig[];
  counts: Record<string, number> | undefined;
  isLoading: boolean;
};

export function TripStatsGrid({ cards, counts, isLoading }: TripStatsGridProps) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 tp-scroll sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:pb-0 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key} className="min-w-[130px] shrink-0 border-primary/10 bg-white/95 transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:min-w-0 sm:shrink">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-1 sm:p-4 sm:pb-2">
            <CardTitle className="text-[11px] font-medium text-muted-foreground sm:text-sm">{card.label}</CardTitle>
            <card.icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
          </CardHeader>
          <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
            <div className="text-lg font-bold sm:text-2xl">
              {isLoading ? '–' : (counts?.[card.key] ?? 0)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
