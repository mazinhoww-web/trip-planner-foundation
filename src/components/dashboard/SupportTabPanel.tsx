import { TripMembersState } from '@/hooks/useTripMembers';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent } from '@/components/ui/card';
import { PublicApiPanel } from '@/components/dashboard/PublicApiPanel';
import { SupportResourcesGrid, SupportResourcesGridProps } from '@/components/dashboard/SupportResourcesGrid';
import { TripUsersPanel } from '@/components/dashboard/TripUsersPanel';
import { UserSettingsPanel } from '@/components/dashboard/UserSettingsPanel';
import { WebhookDispatchPanel } from '@/components/dashboard/WebhookDispatchPanel';

type SupportTabPanelProps = {
  supportError: string | null;
  supportIsLoading: boolean;
  userId?: string;
  userEmail?: string | null;
  profile: Tables<'profiles'> | null;
  onProfileRefresh: () => Promise<unknown> | void;
  collabEnabled: boolean;
  tripMembers: TripMembersState;
  currentTripId: string | null;
  publicApiEnabled: boolean;
  webhookEnabled: boolean;
  supportResourcesProps: SupportResourcesGridProps;
};

export function SupportTabPanel({
  supportError,
  supportIsLoading,
  userId,
  userEmail,
  profile,
  onProfileRefresh,
  collabEnabled,
  tripMembers,
  currentTripId,
  publicApiEnabled,
  webhookEnabled,
  supportResourcesProps,
}: SupportTabPanelProps) {
  if (supportError) {
    return (
      <Card className="border-rose-500/40 bg-rose-500/5">
        <CardContent className="p-4 text-sm text-rose-700">
          Erro ao carregar módulos de apoio: {supportError}
        </CardContent>
      </Card>
    );
  }

  if (supportIsLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-8 text-center text-muted-foreground">Carregando módulos de apoio...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <UserSettingsPanel
        userId={userId}
        userEmail={userEmail}
        profile={profile}
        onProfileRefresh={onProfileRefresh}
      />

      {collabEnabled ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-semibold text-primary">Gestão de acesso da viagem</p>
            <p className="text-xs text-muted-foreground">
              Convide pessoas, ajuste papéis e acompanhe convites pendentes em tempo real.
            </p>
          </div>
          <TripUsersPanel tripMembers={tripMembers} currentUserId={userId} currentTripId={currentTripId} />
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Colaboração entre usuários indisponível no plano atual.
          </CardContent>
        </Card>
      )}

      <PublicApiPanel enabled={publicApiEnabled} currentTripId={currentTripId} />
      <WebhookDispatchPanel enabled={webhookEnabled} currentTripId={currentTripId} />
      <SupportResourcesGrid {...supportResourcesProps} />
    </div>
  );
}
