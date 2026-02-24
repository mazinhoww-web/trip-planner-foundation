# Homologacao Sprint Checklist (Lovable + Supabase ugib)

## 1) Pre-condicoes
- Projeto alvo: `ugibxiaqrvrmxaniylaz`
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
supabase functions deploy trip-members --project-ref ugibxiaqrvrmxaniylaz
supabase functions deploy feature-entitlements --project-ref ugibxiaqrvrmxaniylaz
supabase functions deploy extract-reservation --project-ref ugibxiaqrvrmxaniylaz
supabase functions deploy ocr-document --project-ref ugibxiaqrvrmxaniylaz
supabase functions deploy generate-tips --project-ref ugibxiaqrvrmxaniylaz
supabase functions deploy suggest-restaurants --project-ref ugibxiaqrvrmxaniylaz
```

## 5) Smoke rapido
Executar:
```bash
SUPABASE_URL=https://ugibxiaqrvrmxaniylaz.supabase.co \
SUPABASE_ANON_KEY=<publishable_or_anon_key> \
VERCEL_APP_URL=<preview_url> \
bash scripts/smoke-tests.sh
```

Esperado:
- `trip-members`: 401 sem sessao (protegida)
- `feature-entitlements`: endpoint encontrado
- sem erro de recursao em `viagem_membros`.
