import { createClient } from 'npm:@supabase/supabase-js@2';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type BucketState = {
  count: number;
  startedAt: number;
};

const inMemoryBuckets = new Map<string, BucketState>();

export async function requireAuthenticatedUser(req: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    return { userId: null, error: 'Configuração Supabase ausente.' };
  }

  const authorization = req.headers.get('Authorization');
  if (!authorization) {
    return { userId: null, error: 'Sessão ausente.' };
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authorization },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.id) {
    return { userId: null, error: 'Sessão inválida.' };
  }

  return { userId: data.user.id, error: null };
}

export function consumeRateLimit(
  userId: string,
  operation: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const key = `${userId}:${operation}`;
  const current = inMemoryBuckets.get(key);

  if (!current || now - current.startedAt >= windowMs) {
    inMemoryBuckets.set(key, { count: 1, startedAt: now });
    return {
      allowed: true,
      remaining: Math.max(0, limit - 1),
      resetAt: now + windowMs,
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.startedAt + windowMs,
    };
  }

  current.count += 1;
  inMemoryBuckets.set(key, current);
  return {
    allowed: true,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.startedAt + windowMs,
  };
}
