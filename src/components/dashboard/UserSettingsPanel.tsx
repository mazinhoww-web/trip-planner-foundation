import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { toast } from 'sonner';

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
  const [nome, setNome] = useState(profile?.nome ?? '');
  const [cidadeOrigem, setCidadeOrigem] = useState(profile?.cidade_origem ?? '');
  const [preferences, setPreferences] = useState<LocalPreferences>(() => loadPrefs(userId));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setNome(profile?.nome ?? '');
    setCidadeOrigem(profile?.cidade_origem ?? '');
  }, [profile?.nome, profile?.cidade_origem]);

  useEffect(() => {
    setPreferences(loadPrefs(userId));
  }, [userId]);

  const hasProfileChanges = useMemo(() => {
    return nome !== (profile?.nome ?? '') || cidadeOrigem !== (profile?.cidade_origem ?? '');
  }, [cidadeOrigem, nome, profile?.cidade_origem, profile?.nome]);

  const hasPreferenceChanges = useMemo(() => {
    const current = loadPrefs(userId);
    return JSON.stringify(current) !== JSON.stringify(preferences);
  }, [preferences, userId]);

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

        <div className="flex justify-end">
          <Button onClick={saveSettings} disabled={isSaving || (!hasProfileChanges && !hasPreferenceChanges)}>
            {isSaving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
