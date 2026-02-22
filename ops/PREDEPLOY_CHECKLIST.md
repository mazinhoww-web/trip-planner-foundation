# Pre-Deploy Checklist (Vercel + Supabase)

## 1) Environment
- [ ] Vercel `Production` e `Preview` com:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_PUBLISHABLE_KEY`
- [ ] Supabase Edge Functions secrets com:
  - [ ] `OPENROUTER_API_KEY`
  - [ ] `OPENAI_API_KEY` (fallback opcional)
  - [ ] `OCR_SPACE_API_KEY` (opcional recomendado)
  - [ ] `APP_ORIGIN`
- [ ] Variáveis do projeto revisadas contra `.env.example`.

## 2) Database and SQL
- [ ] Migrations aplicadas em ordem cronológica (`supabase/migrations`).
- [ ] Migration de storage aplicada (`imports` bucket + policies).
- [ ] Migration de hardening aplicada (`FORCE ROW LEVEL SECURITY`).
- [ ] Tabelas críticas confirmadas: `viagens`, `voos`, `hospedagens`, `transportes`, `despesas`, `tarefas`, `restaurantes`, `documentos`, `bagagem`, `viajantes`, `preparativos`.

## 3) Auth Callback
- [ ] Supabase Auth URL Settings:
  - [ ] Site URL = domínio de produção Vercel
  - [ ] Redirect URL contém `<dominio>/auth/callback`
- [ ] Google OAuth Provider:
  - [ ] Enabled = true
  - [ ] Client ID configurado
  - [ ] Client Secret configurado
- [ ] Callback testado com login real em preview e produção.

## 4) Storage
- [ ] Bucket `imports` existe e está privado.
- [ ] Policies de `storage.objects` ativas e restritas por `auth.uid()` (pasta do usuário).
- [ ] Upload de arquivo de reserva testado fim a fim.

## 5) Edge Functions
- [ ] Deploy atualizado de:
  - [ ] `generate-tips`
  - [ ] `suggest-restaurants`
  - [ ] `ocr-document`
  - [ ] `extract-reservation`
- [ ] Funções retornam 401 sem sessão e 200/429/502 com sessão.
- [ ] Logs com `requestId` habilitados no Supabase.

## 6) Go/No-Go Gates
- [ ] Build produção concluído sem erro (`vite build`).
- [ ] `scripts/smoke-tests.sh` executado com `FAIL=0`.
- [ ] Checklist de segurança validado: usuário A não acessa dados do usuário B.
- [ ] Owner técnico aprovou publicação.
