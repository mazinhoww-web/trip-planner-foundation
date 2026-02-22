import { corsHeaders } from './cors.ts';

type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'BAD_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'MISCONFIGURED'
  | 'INTERNAL_ERROR';

export function successResponse<T>(data: T, status: number = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  requestId: string,
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  const payload = {
    error: {
      code,
      message,
      requestId,
      details: details ?? null,
    },
  };

  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
