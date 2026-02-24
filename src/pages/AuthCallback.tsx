import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { acceptTripInvite } from '@/services/tripMembers';
import { toast } from 'sonner';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const inviteToken = new URL(window.location.href).searchParams.get('invite_token');
    let inviteHandled = false;
    let redirected = false;
    let inviteTripId: string | null = null;

    const tryAcceptInvite = async () => {
      if (!inviteToken || inviteHandled) return;
      inviteHandled = true;

      const result = await acceptTripInvite({ inviteToken });
      if (result.error) {
        toast.error(result.error);
        return;
      }

      inviteTripId = result.data?.viagemId ?? null;

      toast.success('Convite aceito com sucesso. A viagem compartilhada já está disponível.');
    };

    const redirectToApp = async (userId?: string) => {
      if (redirected) return;
      redirected = true;

      if (inviteToken) {
        await tryAcceptInvite();
      }

      if (userId && inviteTripId) {
        window.localStorage.setItem(`tripplanner_current_trip_${userId}`, inviteTripId);
      }

      navigate('/app', { replace: true });
    };

    const { data } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const { data: sessionData } = await supabase.auth.getSession();
        await redirectToApp(sessionData.session?.user?.id);
      }
    });

    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (sessionData.session) {
        await redirectToApp(sessionData.session.user.id);
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Autenticando...</p>
      </div>
    </div>
  );
}
