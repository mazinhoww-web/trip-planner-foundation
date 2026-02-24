import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { PlanTier } from '@/services/entitlements';
import { getFeatureUsageSummary, setFeaturePlanTier } from '@/services/featureEntitlements';

type UserSettingsPanelProps = {
  userId?: string;
  userEmail?: string | null;
  profile: Tables<'profiles'> | null;
  onProfileRefresh?: () => Promise<unknown> | void;
};

type LocalPreferences = {
  language: 'pt-BR' | 'en-US';
  dateFormat: 'dd/mm/yyyy' | 'mm/dd/yyyy';
  currency: 'BRL' | 'USD' | 'EUR';
  aiNotifications: boolean;
};

const DEFAULT_PREFS: LocalPreferences = {
  language: 'pt-BR',
  dateFormat: 'dd/mm/yyyy',
  currency: 'BRL',
  aiNotifications: true,
};

function prefsKey(userId?: string) {
  return userId ? `tp_user_prefs:${userId}` : 'tp_user_prefs:anonymous';
}

function loadPrefs(userId?: string): LocalPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(prefsKey(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<LocalPreferences>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(userId: string | undefined, prefs: LocalPreferences) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
}

export function UserSettingsPanel({ userId, userEmail, profile, onProfileRefresh }: UserSettingsPanelProps) {
  const collabGate = useFeatureGate('ff_collab_enabled');
  const [nome, setNome] = useState(profile?.nome ?? '');
  const [cidadeOrigem, setCidadeOrigem] = useState(profile?.cidade_origem ?? '');
  const [preferences, setPreferences] = useState<LocalPreferences>(() => loadPrefs(userId));
  const [planTier, setPlanTier] = useState<PlanTier>('free');
  const [isSaving, setIsSaving] = useState(false);
  const [usageWindowDays, setUsageWindowDays] = useState<7 | 30>(7);

  const usageSummaryQuery = useQuery({
    queryKey: ['feature-usage-summary', userId ?? null, usageWindowDays],
    queryFn: async () => {
      const result = await getFeatureUsageSummary(usageWindowDays);
      if (result.error) {
        throw new Error(result.error);
      }
      return result.data;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  useEffect(() => {
    setNome(profile?.nome ?? '');
    setCidadeOrigem(profile?.cidade_origem ?? '');
  }, [profile?.nome, profile?.cidade_origem]);

  useEffect(() => {
    setPreferences(loadPrefs(userId));
  }, [userId]);

  useEffect(() => {
    setPlanTier(collabGate.planTier);
  }, [collabGate.planTier]);

  const hasProfileChanges = useMemo(() => {
    return nome !== (profile?.nome ?? '') || cidadeOrigem !== (profile?.cidade_origem ?? '');
  }, [cidadeOrigem, nome, profile?.cidade_origem, profile?.nome]);

  const hasPreferenceChanges = useMemo(() => {
    const current = loadPrefs(userId);
    return JSON.stringify(current) !== JSON.stringify(preferences);
  }, [preferences, userId]);

  const hasPlanChanges = useMemo(() => {
    return planTier !== collabGate.planTier;
  }, [planTier, collabGate.planTier]);

  const monetizableFlags = useMemo(() => {
    const entries: Array<{ key: string; label: string; enabled: boolean; cluster: 'M1' | 'M2' | 'M3' | 'M4' }> = [
      { key: 'ff_collab_enabled', label: 'Colaboração base', enabled: collabGate.entitlements.ff_collab_enabled, cluster: 'M1' },
      { key: 'ff_collab_seat_limit_enforced', label: 'Seat limit por plano', enabled: collabGate.entitlements.ff_collab_seat_limit_enforced, cluster: 'M1' },
      { key: 'ff_ai_batch_high_volume', label: 'Lote IA de alto volume', enabled: collabGate.entitlements.ff_ai_batch_high_volume, cluster: 'M2' },
      { key: 'ff_ai_priority_inference', label: 'Prioridade de inferência', enabled: collabGate.entitlements.ff_ai_priority_inference, cluster: 'M2' },
      { key: 'ff_export_pdf', label: 'Exportação PDF', enabled: collabGate.entitlements.ff_export_pdf, cluster: 'M3' },
      { key: 'ff_public_api_access', label: 'API pública', enabled: collabGate.entitlements.ff_public_api_access, cluster: 'M4' },
    ];
    return entries;
  }, [collabGate.entitlements]);

  const usageClusters = useMemo(() => {
    const summary = usageSummaryQuery.data;
    if (!summary) {
      return [
        { clusterKey: 'M1', count: 0 },
        { clusterKey: 'M2', count: 0 },
        { clusterKey: 'M3', count: 0 },
        { clusterKey: 'M4', count: 0 },
      ];
    }

    const byCluster = new Map(summary.byCluster.map((item) => [item.clusterKey, item.count]));
    return ['M1', 'M2', 'M3', 'M4'].map((clusterKey) => ({
      clusterKey,
      count: byCluster.get(clusterKey) ?? 0,
    }));
  }, [usageSummaryQuery.data]);

  const saveSettings = async () => {
    if (!userId) {
      toast.error('Usuário não autenticado.');
      return;
    }

    setIsSaving(true);
    try {
      if (hasProfileChanges) {
        const { error } = await supabase
          .from('profiles')
          .update({
            nome: nome.trim() || null,
            cidade_origem: cidadeOrigem.trim() || null,
            email: userEmail ?? profile?.email ?? null,
          })
          .eq('user_id', userId);

        if (error) throw error;
      }

      if (hasPreferenceChanges) {
        savePrefs(userId, preferences);
      }

      if (hasPlanChanges && collabGate.selfServiceEnabled) {
        const planResult = await setFeaturePlanTier(planTier);
        if (planResult.error) {
          throw new Error(planResult.error);
        }
      }

      if (onProfileRefresh) {
        await onProfileRefresh();
      }

      toast.success('Configurações salvas com sucesso.');
    } catch (error) {
      console.error('[settings][save_failed]', error);
      toast.error('Não foi possível salvar as configurações agora.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-border/60 bg-white/95">
      <CardHeader>
        <CardTitle className="text-base">Central de configurações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-nome">Nome</Label>
            <Input
              id="settings-nome"
              value={nome}
              placeholder="Seu nome"
              onChange={(event) => setNome(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-email">E-mail</Label>
            <Input id="settings-email" value={userEmail ?? profile?.email ?? ''} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-cidade">Cidade de origem</Label>
            <Input
              id="settings-cidade"
              value={cidadeOrigem}
              placeholder="Ex: São Paulo"
              onChange={(event) => setCidadeOrigem(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-moeda">Moeda padrão</Label>
            <Select
              value={preferences.currency}
              onValueChange={(value: 'BRL' | 'USD' | 'EUR') => setPreferences((prev) => ({ ...prev, currency: value }))}
            >
              <SelectTrigger id="settings-moeda"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BRL">BRL</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-language">Idioma</Label>
            <Select
              value={preferences.language}
              onValueChange={(value: 'pt-BR' | 'en-US') => setPreferences((prev) => ({ ...prev, language: value }))}
            >
              <SelectTrigger id="settings-language"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                <SelectItem value="en-US">English (US)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-date-format">Formato de data</Label>
            <Select
              value={preferences.dateFormat}
              onValueChange={(value: 'dd/mm/yyyy' | 'mm/dd/yyyy') => setPreferences((prev) => ({ ...prev, dateFormat: value }))}
            >
              <SelectTrigger id="settings-date-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dd/mm/yyyy">dd/mm/yyyy</SelectItem>
                <SelectItem value="mm/dd/yyyy">mm/dd/yyyy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-plan">Plano</Label>
            <Select
              value={planTier}
              onValueChange={(value: PlanTier) => setPlanTier(value)}
              disabled={!collabGate.selfServiceEnabled || collabGate.isLoading}
            >
              <SelectTrigger id="settings-plan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {collabGate.selfServiceEnabled
                ? 'Plano aplicado em tempo real para testes de recursos.'
                : 'Mudança de plano desativada neste ambiente (somente leitura).'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Rollout progressivo</p>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  collabGate.rolloutCohort
                    ? 'bg-emerald-500/15 text-emerald-700'
                    : 'bg-slate-500/15 text-slate-700'
                }`}
              >
                {collabGate.rolloutCohort ? 'Em coorte piloto' : 'Fora da coorte'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Percentual configurado: {collabGate.rolloutPercent}%.
              {' '}
              Features piloto: {collabGate.rolloutFeatures.length > 0 ? collabGate.rolloutFeatures.join(', ') : 'nenhuma'}.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Uso por cluster</p>
              <Select
                value={String(usageWindowDays)}
                onValueChange={(value: '7' | '30') => setUsageWindowDays(value === '30' ? 30 : 7)}
              >
                <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {usageSummaryQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando métricas de uso...</p>
            ) : usageSummaryQuery.error instanceof Error ? (
              <p className="text-xs text-rose-600">{usageSummaryQuery.error.message}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {usageClusters.map((cluster) => (
                  <div key={cluster.clusterKey} className="rounded-md border border-border/50 bg-white/80 p-2">
                    <p className="text-[11px] text-muted-foreground">{cluster.clusterKey}</p>
                    <p className="text-sm font-semibold">{cluster.count}</p>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Eventos no período: {usageSummaryQuery.data?.totalEvents ?? 0}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
          <div>
            <p className="text-sm font-medium">Notificações de IA</p>
            <p className="text-xs text-muted-foreground">Exibe alertas de reprocessamento e confirmação de importação.</p>
          </div>
          <Switch
            checked={preferences.aiNotifications}
            onCheckedChange={(checked) => setPreferences((prev) => ({ ...prev, aiNotifications: checked }))}
            aria-label="Ativar notificações de IA"
          />
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
          <p className="text-sm font-medium">Feature clusters (monetização ready)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {monetizableFlags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between rounded-md border border-border/50 bg-white/80 px-2.5 py-2">
                <div>
                  <p className="text-xs font-medium">{flag.label}</p>
                  <p className="text-[11px] text-muted-foreground">{flag.cluster}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    flag.enabled
                      ? 'bg-emerald-500/15 text-emerald-700'
                      : 'bg-slate-500/15 text-slate-700'
                  }`}
                >
                  {flag.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={saveSettings}
            disabled={isSaving || (!hasProfileChanges && !hasPreferenceChanges && !hasPlanChanges)}
          >
            {isSaving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
