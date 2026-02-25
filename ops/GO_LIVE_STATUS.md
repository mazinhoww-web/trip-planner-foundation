# Go-Live Status (Objetivo)

## Gate de Publicação
- Frontend build: ✅
- Frontend endpoint acessível: ✅
- Supabase Auth health: ✅
- RLS anônimo sem vazamento: ✅
- Functions críticas deployadas: ❌ (404 no ambiente alvo atual)
- Smoke autenticado: ⚠️ pendente (requer `TEST_USER_JWT`)

## Status atual
**NO-GO** enquanto as functions críticas não estiverem deployadas em Supabase:
- `trip-members`
- `feature-entitlements`
- `generate-tips`
- `suggest-restaurants`
- `ocr-document`
- `extract-reservation`
- `public-trip-api`
- `trip-webhook-dispatch`

## Ação para virar GO
1. Deploy das functions (runbook).
2. Reexecutar `scripts/smoke-tests.sh`.
3. Exigir `FAIL=0` para promoção.

## Escopo funcional confirmado (MVP)
- Auth + callback + app protegido.
- CRUD módulos centrais e orçamento real.
- Importação com revisão assistida e fallback.
- Gastronomia + módulos de apoio persistentes.
- Hardening de erros, RLS, rate-limit e acessibilidade essencial.

## Fase 2 (não bloqueante do go-live)
- Rate-limit distribuído (store central).
- Observabilidade avançada com dashboards externos.
- E2E automatizado completo em CI.
