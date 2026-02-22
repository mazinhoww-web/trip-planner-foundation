import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

type GapSummary = {
  key: string;
  text: string;
};

type TripCoverageAlertProps = {
  stayGapLines: GapSummary[];
  transportGapLines: GapSummary[];
};

export function TripCoverageAlert({ stayGapLines, transportGapLines }: TripCoverageAlertProps) {
  if (stayGapLines.length === 0 && transportGapLines.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-500/40 bg-amber-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <p className="text-sm font-medium text-amber-900">
            Gaps detectados no planejamento da viagem
          </p>
        </div>

        {stayGapLines.length > 0 && (
          <div className="space-y-1 text-sm text-amber-900/90">
            {stayGapLines.map((gap) => (
              <p key={gap.key}>{gap.text}</p>
            ))}
          </div>
        )}

        {transportGapLines.length > 0 && (
          <div className="space-y-1 text-sm text-amber-900/90">
            {transportGapLines.map((gap) => (
              <p key={gap.key}>{gap.text}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
