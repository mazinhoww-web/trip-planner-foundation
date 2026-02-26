# Homologacao Sprint Checklist (Lovable + Supabase ffiw)

## 1) Pre-condicoes
- Projeto alvo: `ffiwqovhjrjrspqbayrx`
- Necessario token Supabase com permissao de **owner/admin** no projeto (tokens sem esse escopo nao aplicam migration/deploy).

## 2) Aplicar migrations
Ordem recomendada:
1. `supabase/migrations/20260223110000_trip_members_collaboration.sql`
2. `supabase/migrations/20260224093000_fix_trip_role_recursion.sql`

## 3) Verificacoes SQL
```sql
select to_regclass('public.viagem_membros') as membros_tbl,
       to_regclass('public.viagem_convites') as convites_tbl;

select proname
from pg_proc
where proname in ('trip_role','can_view_trip','can_edit_trip','is_trip_owner');
```

## 4) Deploy das edge functions
```bash
supabase functions deploy trip-members --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy feature-entitlements --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy extract-reservation --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy ocr-document --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy generate-tips --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy suggest-restaurants --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy public-trip-api --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy trip-webhook-dispatch --project-ref ffiwqovhjrjrspqbayrx
supabase functions deploy trip-export --project-ref ffiwqovhjrjrspqbayrx
```

## 5) Smoke rapido
Executar:
```bash
SUPABASE_URL=https://ffiwqovhjrjrspqbayrx.supabase.co \
SUPABASE_ANON_KEY=<publishable_or_anon_key> \
VERCEL_APP_URL=<preview_url> \
bash scripts/smoke-tests.sh
```

Esperado:
- `trip-members`: 401 sem sessao (protegida)
- `feature-entitlements`: endpoint encontrado
- `public-trip-api`: 401 sem sessão e 200/403 com sessão (conforme plano/role)
- `trip-webhook-dispatch`: 401 sem sessão e 200/403 com sessão (conforme plano)
- `trip-export`: 401 sem sessão e 200/403 com sessão (conforme plano)
- sem erro de recursao em `viagem_membros`.
