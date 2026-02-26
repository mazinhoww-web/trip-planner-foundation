# Go-Live Status (Objetivo)

## Gate de Publicação
- Frontend build: ✅
- Frontend endpoint acessível: ✅
- Supabase Auth health: ✅
- RLS anônimo sem vazamento: ✅
- Functions críticas deployadas: ✅ (projeto `ffiwqovhjrjrspqbayrx`)
- Smoke autenticado: ⚠️ pendente (requer `TEST_USER_JWT`)

## Status atual
**GO condicional**: liberar publicação após smoke autenticado com `FAIL=0`.

Functions críticas já deployadas em Supabase:
- `trip-members`
- `feature-entitlements`
- `generate-tips`
- `suggest-restaurants`
- `ocr-document`
- `extract-reservation`
- `public-trip-api`
- `trip-webhook-dispatch`
- `trip-export`

## Ação para manter GO
1. Reexecutar `scripts/smoke-tests.sh`.
2. Exigir `FAIL=0` para promoção.

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
