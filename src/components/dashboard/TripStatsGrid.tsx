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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.key} className="border-border/60 bg-white/90 transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '–' : (counts?.[card.key] ?? 0)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
