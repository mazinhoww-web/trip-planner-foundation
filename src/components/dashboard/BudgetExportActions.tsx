import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Lock } from 'lucide-react';

type BudgetExportActionsProps = {
  canExportPdf: boolean;
  canExportJson: boolean;
  isExporting: boolean;
  planTier: string;
  onExportPdf: () => Promise<void> | void;
  onExportJson: () => Promise<void> | void;
};

export function BudgetExportActions({
  canExportPdf,
  canExportJson,
  isExporting,
  planTier,
  onExportPdf,
  onExportJson,
}: BudgetExportActionsProps) {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Exportação e compartilhamento</CardTitle>
          <Badge variant="outline" className="capitalize">Plano {planTier}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Exporte os dados consolidados da viagem para análise externa e compartilhamento.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant={canExportJson ? 'outline' : 'secondary'}
            disabled={!canExportJson || isExporting}
            onClick={() => void onExportJson()}
            className="w-full justify-start"
          >
            {canExportJson ? <Download className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
            Exportar JSON completo
          </Button>
          <Button
            type="button"
            variant={canExportPdf ? 'outline' : 'secondary'}
            disabled={!canExportPdf || isExporting}
            onClick={() => void onExportPdf()}
            className="w-full justify-start"
          >
            {canExportPdf ? <FileText className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
            Exportar PDF (impressão)
          </Button>
        </div>
        {(!canExportJson || !canExportPdf) && (
          <p className="text-xs text-amber-700">
            Recursos de exportação avançada disponíveis nos planos Pro/Team.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
