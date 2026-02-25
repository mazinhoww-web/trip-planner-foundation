import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type TripCollaborationBannerProps = {
  onManageUsers: () => void;
};

export function TripCollaborationBanner({ onManageUsers }: TripCollaborationBannerProps) {
  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Colaboração da viagem</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Convide usuários e ajuste papéis owner/editor/viewer no painel de apoio.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onManageUsers}
          className="w-full border-primary/30 text-primary hover:bg-primary/10 sm:w-auto"
        >
          Gerenciar usuários da viagem
        </Button>
      </CardContent>
    </Card>
  );
}

type TripViewerNoticeProps = {
  visible: boolean;
};

export function TripViewerNotice({ visible }: TripViewerNoticeProps) {
  if (!visible) return null;
  return (
    <Card className="mt-4 border-slate-300/60 bg-slate-100/60">
      <CardContent className="p-3 text-sm text-slate-700">
        Você está com papel <strong>viewer</strong> nesta viagem. É possível visualizar os dados, mas edições ficam bloqueadas.
      </CardContent>
    </Card>
  );
}
