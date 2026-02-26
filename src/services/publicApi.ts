import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

type FunctionEnvelope<T> = {
  data?: T;
  error?: unknown;
};

export type PublicTripSnapshot = {
  exportedAt: string;
  trip: Record<string, unknown>;
  totals: Record<string, number>;
  modules: Record<string, unknown[]>;
};

export type PublicShareLink = {
  id: string;
  url: string;
  expiresAt: string;
  tokenHint: string;
  active: boolean;
};

export type PublicShareListItem = {
  id: string;
  token_hint: string;
  ativo: boolean;
  expira_em: string;
  created_at: string;
};

export async function fetchPublicTripSnapshot(viagemId: string) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'trip_snapshot', viagemId },
  });

  if (error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(data ?? error, 'Não foi possível gerar o snapshot da API pública.'),
    };
  }

  const parsed = data as FunctionEnvelope<PublicTripSnapshot>;
  if (parsed?.error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(parsed, 'Não foi possível gerar o snapshot da API pública.'),
    };
  }

  return {
    data: parsed?.data ?? null,
    error: null as string | null,
  };
}

export async function createPublicTripShareLink(viagemId: string, expiresInHours: number = 72) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'create_share_link', viagemId, expiresInHours },
  });

  if (error) {
    return {
      data: null as PublicShareLink | null,
      error: parseFunctionError(data ?? error, 'Não foi possível criar link público da viagem.'),
    };
  }

  const parsed = data as FunctionEnvelope<{ share: PublicShareLink }>;
  if (parsed?.error || !parsed?.data?.share) {
    return {
      data: null as PublicShareLink | null,
      error: parseFunctionError(parsed, 'Não foi possível criar link público da viagem.'),
    };
  }

  return {
    data: parsed.data.share,
    error: null as string | null,
  };
}

export async function listPublicTripShareLinks(viagemId: string) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'list_share_links', viagemId },
  });

  if (error) {
    return {
      data: [] as PublicShareListItem[],
      error: parseFunctionError(data ?? error, 'Não foi possível carregar links públicos da viagem.'),
    };
  }

  const parsed = data as FunctionEnvelope<{ shares: PublicShareListItem[] }>;
  if (parsed?.error) {
    return {
      data: [] as PublicShareListItem[],
      error: parseFunctionError(parsed, 'Não foi possível carregar links públicos da viagem.'),
    };
  }

  return {
    data: parsed?.data?.shares ?? [],
    error: null as string | null,
  };
}

export async function revokePublicTripShareLink(viagemId: string, shareId: string) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'revoke_share_link', viagemId, shareId },
  });

  if (error) {
    return {
      error: parseFunctionError(data ?? error, 'Não foi possível revogar o link público.'),
    };
  }

  const parsed = data as FunctionEnvelope<{ ok: boolean }>;
  if (parsed?.error) {
    return {
      error: parseFunctionError(parsed, 'Não foi possível revogar o link público.'),
    };
  }

  return {
    error: null as string | null,
  };
}

export async function fetchSharedTripSnapshot(shareToken: string) {
  const { data, error } = await supabase.functions.invoke('public-trip-api', {
    body: { action: 'share_snapshot', shareToken },
  });

  if (error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(data ?? error, 'Não foi possível abrir o compartilhamento da viagem.'),
    };
  }

  const parsed = data as FunctionEnvelope<PublicTripSnapshot>;
  if (parsed?.error) {
    return {
      data: null as PublicTripSnapshot | null,
      error: parseFunctionError(parsed, 'Não foi possível abrir o compartilhamento da viagem.'),
    };
  }

  return {
    data: parsed?.data ?? null,
    error: null as string | null,
  };
}
