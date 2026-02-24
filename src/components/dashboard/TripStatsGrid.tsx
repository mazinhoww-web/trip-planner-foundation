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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key} className="border-primary/10 bg-white/95 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-1.5 sm:pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{card.label}</CardTitle>
            <card.icon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold sm:text-2xl">
              {isLoading ? '–' : (counts?.[card.key] ?? 0)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
