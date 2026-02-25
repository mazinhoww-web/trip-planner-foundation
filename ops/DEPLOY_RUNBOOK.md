# Deploy Runbook (Produção)

## Pré-requisitos
- Acesso ao projeto Vercel.
- Acesso ao projeto Supabase (`project_ref` correto).
- Token CLI para `vercel` e `supabase`.

## 1) Congelar versão
1. Garantir branch de release aprovada.
2. Criar tag de release: `vYYYY.MM.DD-rc1`.

## 2) Aplicar banco e storage (Supabase)
1. Linkar projeto:
```bash
supabase link --project-ref <SUPABASE_PROJECT_REF>
```
2. Aplicar migrations:
```bash
supabase db push
```
3. Confirmar bucket/policies e RLS no dashboard SQL.

## 3) Configurar secrets de functions
```bash
supabase secrets set OPENROUTER_API_KEY=<VALUE>
supabase secrets set GEMINI_API_KEY=<VALUE> # fallback paralelo obrigatório
supabase secrets set OCR_SPACE_API_KEY=<VALUE>
supabase secrets set WEBHOOK_TARGET_URL=<VALUE> # opcional para M4
supabase secrets set APP_ORIGIN=https://<dominio-app>
```

## 4) Publicar Edge Functions
```bash
supabase functions deploy generate-tips
supabase functions deploy suggest-restaurants
supabase functions deploy ocr-document
supabase functions deploy extract-reservation
supabase functions deploy feature-entitlements
supabase functions deploy trip-members
supabase functions deploy public-trip-api
supabase functions deploy trip-webhook-dispatch
```

## 5) Configurar env no Vercel
Definir em `Preview` e `Production`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 6) Publicar frontend
```bash
vercel --prod
```

## 7) Validar callback de autenticação
1. Em Supabase Auth, confirmar `Site URL` e `Redirect URLs`:
   - `https://<dominio>/auth/callback`
2. Em Supabase Auth > Providers > Google:
   - Habilitar provider
   - Informar `Client ID` e `Client Secret` do Google Cloud
   - Incluir no Google Console o callback Supabase exibido no painel (ex.: `https://<project-ref>.supabase.co/auth/v1/callback`)
2. Executar login e validar redirecionamento para `/app`.

## 8) Executar smoke tests de go-live
```bash
export VERCEL_APP_URL="https://<dominio-app>"
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
export TEST_USER_JWT="<jwt-opcional>"

./scripts/smoke-tests.sh
```

## 9) Critério para liberar tráfego
- `FAIL=0` no smoke.
- Auth callback OK.
- Importação (upload + OCR/IA + revisão) validada em produção.
- Monitoramento inicial ativo.
