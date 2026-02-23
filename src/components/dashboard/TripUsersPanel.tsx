import { useMemo, useState } from 'react';
import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TripMembersState } from '@/hooks/useTripMembers';

type TripUsersPanelProps = {
  tripMembers: TripMembersState;
  currentUserId?: string;
};

const ROLE_LABEL: Record<'owner' | 'editor' | 'viewer', string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

const ROLE_BADGE_CLASS: Record<'owner' | 'editor' | 'viewer', string> = {
  owner: 'bg-primary/15 text-primary border-primary/30',
  editor: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  viewer: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TripUsersPanel({ tripMembers, currentUserId }: TripUsersPanelProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');

  const pendingInvites = useMemo(
    () => tripMembers.invites.filter((invite) => invite.status === 'pending'),
    [tripMembers.invites],
  );

  const roleLabel = tripMembers.permission.role ? ROLE_LABEL[tripMembers.permission.role] : 'Sem acesso';

  const submitInvite = async () => {
    const normalized = inviteEmail.trim().toLowerCase();
    if (!normalized) return;

    await tripMembers.inviteMember({
      email: normalized,
      role: inviteRole,
    });

    setInviteEmail('');
    setInviteRole('viewer');
  };

  return (
    <Card className="border-primary/20 bg-white/95 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Usuários da viagem</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Convites e permissões de acesso em tempo real por papel.
            </p>
          </div>
          <Badge variant="outline" className={tripMembers.permission.role ? ROLE_BADGE_CLASS[tripMembers.permission.role] : ''}>
            {roleLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {tripMembers.membersError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
            {tripMembers.membersError}
          </div>
        )}
        {tripMembers.permission.isOwner && tripMembers.invitesError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700">
            {tripMembers.invitesError}
          </div>
        )}

        {tripMembers.isLoadingMembers ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Carregando usuários da viagem...
          </div>
        ) : (
          <>
            {tripMembers.permission.isOwner && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <p className="mb-3 text-sm font-medium">Convidar por e-mail</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="invite-email">E-mail</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      placeholder="pessoa@exemplo.com"
                      onChange={(event) => setInviteEmail(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="invite-role">Papel</Label>
                    <Select value={inviteRole} onValueChange={(value: 'editor' | 'viewer') => setInviteRole(value)}>
                      <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={submitInvite}
                      disabled={!inviteEmail.trim() || tripMembers.isInviting}
                      className="w-full sm:w-auto"
                    >
                      Enviar convite
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Membros</p>
              {tripMembers.members.length === 0 ? (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  Nenhum membro vinculado.
                </p>
              ) : (
                <div className="space-y-2">
                  {tripMembers.members.map((member) => {
                    const isOwnerRow = member.role === 'owner';
                    const isSelf = currentUserId ? member.user_id === currentUserId : false;
                    const displayName = member.nome || member.email || 'Usuário sem nome';

                    return (
                      <div key={member.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_170px_160px_auto] sm:items-center">
                        <div>
                          <p className="font-medium">{displayName}{isSelf ? ' (você)' : ''}</p>
                          <p className="text-xs text-muted-foreground">{member.email || 'E-mail não informado'}</p>
                        </div>

                        <div>
                          {tripMembers.permission.isOwner && !isOwnerRow ? (
                            <Select
                              value={member.role}
                              onValueChange={(value: 'editor' | 'viewer') => {
                                if (value !== member.role) {
                                  void tripMembers.updateMemberRole({ memberId: member.id, role: value });
                                }
                              }}
                              disabled={tripMembers.isUpdatingRole}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className={ROLE_BADGE_CLASS[member.role]}>
                              {ROLE_LABEL[member.role]}
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Entrou em {formatDateTime(member.joined_at)}
                        </div>

                        <div className="flex justify-end">
                          {tripMembers.permission.isOwner && !isOwnerRow ? (
                            <ConfirmActionButton
                              ariaLabel="Remover membro"
                              title="Remover membro"
                              description="Este usuário perderá acesso à viagem imediatamente."
                              confirmLabel="Remover"
                              size="sm"
                              disabled={tripMembers.isRemovingMember}
                              onConfirm={() => { void tripMembers.removeMember(member.id); }}
                            >
                              Remover
                            </ConfirmActionButton>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem ação</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {tripMembers.permission.isOwner ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">Convites pendentes</p>
                {tripMembers.isLoadingInvites ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Carregando convites...</p>
                ) : pendingInvites.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Nenhum convite pendente.</p>
                ) : (
                  <div className="space-y-2">
                    {pendingInvites.map((invite) => (
                      <div key={invite.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_120px_140px_auto] sm:items-center">
                        <div>
                          <p className="font-medium">{invite.email}</p>
                          <p className="text-xs text-muted-foreground">Expira em {formatDateTime(invite.expires_at)}</p>
                        </div>
                        <Badge variant="outline" className={ROLE_BADGE_CLASS[invite.role]}>
                          {ROLE_LABEL[invite.role]}
                        </Badge>
                        <Badge variant="secondary">Pendente</Badge>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => tripMembers.resendInvite(invite.id)}
                            disabled={tripMembers.isResendingInvite}
                          >
                            Reenviar
                          </Button>
                          <ConfirmActionButton
                            ariaLabel="Revogar convite"
                            title="Revogar convite"
                            description="Este convite não poderá mais ser aceito."
                            confirmLabel="Revogar"
                            size="sm"
                            disabled={tripMembers.isRevokingInvite}
                            onConfirm={() => { void tripMembers.revokeInvite(invite.id); }}
                          >
                            Revogar
                          </ConfirmActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                Apenas o owner pode convidar, remover usuários e gerenciar convites.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
