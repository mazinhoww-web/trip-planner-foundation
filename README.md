# Trip Planner Foundation

Aplicativo de planejamento de viagens com importação inteligente (OCR + IA), colaboração por viagem (owner/editor/viewer), módulos financeiros e integrações monetizáveis por feature flags.

## Ambientes canônicos

- Lovable preview: [c895da6c-060a-4eb8-ad30-61ce940181d9](https://lovable.dev/projects/c895da6c-060a-4eb8-ad30-61ce940181d9)
- Supabase project ref: `ffiwqovhjrjrspqbayrx`

## Stack

- Frontend: React + TypeScript + Vite + Tailwind + shadcn-ui
- Backend: Supabase (Postgres + RLS + Edge Functions)
- IA/OCR: OpenRouter (Arcee/Gemma), Gemini fallback, OCR provider opcional

## Setup local

Pré-requisitos:
- Node.js 20+
- npm
- Supabase CLI (somente para deploy de migrations/functions)

```sh
git clone https://github.com/mazinhoww-web/trip-planner-foundation.git
cd trip-planner-foundation
npm i
npm run dev
```

## Variáveis de ambiente

Frontend (`.env`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Supabase Edge Functions (Secrets):
- `OPENROUTER_API_KEY`
- `GEMINI_API_KEY`
- `OCR_SPACE_API_KEY` (opcional)
- `WEBHOOK_TARGET_URL` (M4 opcional)
- `WEBHOOK_SECRET` (M4 opcional, assinatura HMAC)
- `ENTITLEMENTS_SELF_SERVICE` (opcional)
- `ENTITLEMENTS_ROLLOUT_PERCENT` (opcional)
- `ENTITLEMENTS_ROLLOUT_FEATURES` (opcional)

## Deploy operacional (S0 obrigatório)

Aplicar migrations:

```sh
supabase db push
```

Deploy de functions críticas:

```sh
supabase functions deploy feature-entitlements
supabase functions deploy trip-members
supabase functions deploy extract-reservation
supabase functions deploy ocr-document
supabase functions deploy generate-tips
supabase functions deploy suggest-restaurants
supabase functions deploy trip-ai-chat
supabase functions deploy public-trip-api
supabase functions deploy trip-webhook-dispatch
supabase functions deploy trip-export
```

Validação de schema mínimo:

```sql
select to_regclass('public.viagem_membros') as viagem_membros,
       to_regclass('public.viagem_convites') as viagem_convites;
```

## Smoke test

```sh
./scripts/smoke-tests.sh
```

Com JWT de teste opcional:

```sh
export TEST_USER_JWT="<jwt>"
export TEST_TRIP_ID="<viagem_id>"
./scripts/smoke-tests.sh
```

## Funcionalidades principais

- Importação em lote com confirmação final item a item
- Persistência canônica/híbrida de extração (`documentos.extracao_*`)
- Colaboração por papéis com convites por e-mail
- Export (JSON/PDF), API pública e webhooks com feature gates
- Branding LATAM/LATAM Pass no `/app`

## Operação e go-live

Artefatos operacionais:
- `/ops/PREDEPLOY_CHECKLIST.md`
- `/ops/DEPLOY_RUNBOOK.md`
- `/ops/SMOKE_TESTS.md`
- `/ops/ROLLBACK_AND_MONITORING.md`
- `/ops/GO_LIVE_STATUS.md`
- `/docs/operations/homologation-sprint-checklist.md`
