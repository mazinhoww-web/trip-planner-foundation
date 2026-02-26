# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/c895da6c-060a-4eb8-ad30-61ce940181d9

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/c895da6c-060a-4eb8-ad30-61ce940181d9) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository.
git clone https://github.com/mazinhoww-web/trip-planner-foundation.git

# Step 2: Navigate to the project directory.
cd trip-planner-foundation

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## AI Enrichment setup (Prompt 07)

This project now uses Supabase Edge Functions for AI enrichment:

- `generate-tips`
- `suggest-restaurants`
- `ocr-document`
- `extract-reservation`

Set required environment variables:

- Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Supabase Functions (server-side): `OPENROUTER_API_KEY` (provider principal)
- Fallback paralelo obrigatório: `GEMINI_API_KEY`
- OCR opcional: `OCR_SPACE_API_KEY`
- Webhook opcional (M4): `WEBHOOK_TARGET_URL`
- Assinatura opcional de webhook (M4): `WEBHOOK_SECRET`

Deploy functions:

```sh
supabase functions deploy feature-entitlements
supabase functions deploy trip-members
supabase functions deploy generate-tips
supabase functions deploy suggest-restaurants
supabase functions deploy ocr-document
supabase functions deploy extract-reservation
supabase functions deploy public-trip-api
supabase functions deploy trip-webhook-dispatch
supabase functions deploy trip-export
```

> Active Supabase project ref linked in this workspace: `ffiwqovhjrjrspqbayrx`.

## Google Auth setup

- Frontend already supports `Entrar com Google` (OAuth redirect to `/auth/callback`).
- Enable provider in Supabase Dashboard:
  - `Authentication` -> `Providers` -> `Google` -> `Enable`
  - configure `Client ID` and `Client Secret` from Google Cloud
  - ensure app callback includes `/auth/callback`

## Go-live operations (Prompt 10)

Operational deliverables are versioned under `/ops`:

- `ops/PREDEPLOY_CHECKLIST.md`
- `ops/DEPLOY_RUNBOOK.md`
- `ops/SMOKE_TESTS.md`
- `ops/ROLLBACK_AND_MONITORING.md`
- `ops/PHASE2_BACKLOG.md`
- `ops/GO_LIVE_STATUS.md`

Automated smoke tests:

```sh
./scripts/smoke-tests.sh
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/c895da6c-060a-4eb8-ad30-61ce940181d9) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
