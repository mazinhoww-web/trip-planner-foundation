import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Plus } from 'lucide-react';

type GapSummary = {
  key: string;
  text: string;
};

export type TransportGapSummary = {
  key: string;
  text: string;
  from: string;
  to: string;
  mapsUrl: string;
};

type TripCoverageAlertProps = {
  stayGapLines: GapSummary[];
  transportGapLines: TransportGapSummary[];
  onAddTransport?: (from: string, to: string) => void;
};

export function TripCoverageAlert({ stayGapLines, transportGapLines, onAddTransport }: TripCoverageAlertProps) {
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
          <div className="space-y-3">
            {transportGapLines.map((gap) => (
              <div key={gap.key} className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3">
                <p className="text-sm text-amber-900/90 mb-2">{gap.text}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 border-amber-500/40 bg-white/60 text-amber-900 hover:bg-amber-100/60 text-xs"
                    asChild
                  >
                    <a href={gap.mapsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      Ver rota no Google Maps
                    </a>
                  </Button>
                  {onAddTransport && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 border-sky-500/40 bg-white/60 text-sky-800 hover:bg-sky-100/60 text-xs"
                      onClick={() => onAddTransport(gap.from, gap.to)}
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar transporte
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
