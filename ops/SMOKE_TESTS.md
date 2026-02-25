# Smoke Tests de Go-Live

## Execução automática (preferencial)
Use o script versionado:

```bash
export VERCEL_APP_URL="https://<dominio-app>"
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon-key>"
# opcional para testes autenticados
export TEST_USER_JWT="<jwt>"

./scripts/smoke-tests.sh
```

## O que o script valida
1. Frontend acessível (`200/301/302`).
2. Supabase Auth health (`/auth/v1/health`).
3. Functions deployadas e protegidas (`401` sem sessão):
   - `generate-tips`, `suggest-restaurants`, `ocr-document`, `extract-reservation`,
   - `trip-members`, `feature-entitlements`, `public-trip-api`, `trip-webhook-dispatch`.
4. RLS básico sem vazamento para anônimo (`[]` ou bloqueio).
5. Fluxo autenticado opcional para IA/OCR/extração + monetização (M4).

## Critério de aprovação
- `FAIL = 0`.
- `WARN` analisado e aceito pelo responsável técnico.

## Execução manual complementar
- Login + callback funcionando.
- Criar/editar/remover em módulos principais.
- Importar arquivo com caminho feliz e falha controlada.
- Validar favoritos e módulos de apoio após refresh.
