#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

pass_count=0
warn_count=0
fail_count=0

pass() {
  echo -e "${GREEN}PASS${NC} $1"
  pass_count=$((pass_count + 1))
}

warn() {
  echo -e "${YELLOW}WARN${NC} $1"
  warn_count=$((warn_count + 1))
}

fail() {
  echo -e "${RED}FAIL${NC} $1"
  fail_count=$((fail_count + 1))
}

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    fail "Variável obrigatória ausente: $key"
  fi
}

http_code() {
  local method="$1"
  local url="$2"
  local headers_file="$3"
  local body_file="$4"
  shift 4

  curl -sS -X "$method" "$url" "$@" -D "$headers_file" -o "$body_file" -w "%{http_code}"
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

require_env "VERCEL_APP_URL"
require_env "SUPABASE_URL"
require_env "SUPABASE_ANON_KEY"

if [ "$fail_count" -gt 0 ]; then
  echo "Falha de pré-condição."
  exit 1
fi

echo "== Smoke Test: Produção/Preview =="
echo "VERCEL_APP_URL=$VERCEL_APP_URL"
echo "SUPABASE_URL=$SUPABASE_URL"

# 1) App web
code="$(http_code GET "$VERCEL_APP_URL" "$tmp_dir/app.h" "$tmp_dir/app.b")"
if [[ "$code" =~ ^(200|301|302)$ ]]; then
  pass "Frontend acessível ($code)"
else
  fail "Frontend indisponível ($code)"
fi

# 2) Supabase Auth health (alguns projetos exigem apikey)
code="$(http_code GET "$SUPABASE_URL/auth/v1/health" "$tmp_dir/auth.h" "$tmp_dir/auth.b")"
if [ "$code" = "200" ]; then
  pass "Supabase Auth health OK (sem apikey)"
else
  code_with_key="$(http_code GET "$SUPABASE_URL/auth/v1/health" "$tmp_dir/auth-key.h" "$tmp_dir/auth-key.b" \
    -H "apikey: $SUPABASE_ANON_KEY")"
  if [ "$code_with_key" = "200" ]; then
    pass "Supabase Auth health OK (com apikey)"
  else
    fail "Supabase Auth health falhou (sem chave=$code, com chave=$code_with_key)"
  fi
fi

# 3) Functions deploy + proteção (espera 401 sem Authorization)
for fn in generate-tips suggest-restaurants ocr-document extract-reservation; do
  code="$(http_code POST "$SUPABASE_URL/functions/v1/$fn" "$tmp_dir/$fn.h" "$tmp_dir/$fn.b" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    --data '{}')"

  if [ "$code" = "404" ]; then
    fail "Function $fn não encontrada (não deployada)"
  elif [ "$code" = "401" ]; then
    pass "Function $fn deployada e protegida (401 sem sessão)"
  elif [ "$code" = "429" ]; then
    pass "Function $fn deployada com rate-limit ativo (429)"
  else
    warn "Function $fn retornou status inesperado sem sessão: $code"
  fi
done

# 4) RLS básico: sem sessão não pode vazar dados
for table in voos hospedagens transportes despesas tarefas restaurantes; do
  code="$(http_code GET "$SUPABASE_URL/rest/v1/$table?select=id&limit=1" "$tmp_dir/$table.h" "$tmp_dir/$table.b" \
    -H "apikey: $SUPABASE_ANON_KEY")"
  body="$(cat "$tmp_dir/$table.b")"

  if [ "$code" = "200" ]; then
    if [ "$body" = "[]" ]; then
      pass "RLS anônimo OK em $table (sem vazamento)"
    else
      fail "Possível vazamento em $table para anônimo: $body"
    fi
  elif [[ "$code" =~ ^(401|403)$ ]]; then
    pass "RLS anônimo bloqueado em $table ($code)"
  else
    warn "Status inesperado em $table para anônimo: $code"
  fi
done

# 5) Smoke autenticado opcional
if [ -n "${TEST_USER_JWT:-}" ]; then
  echo "Executando smoke autenticado com TEST_USER_JWT..."

  code="$(http_code POST "$SUPABASE_URL/functions/v1/generate-tips" "$tmp_dir/auth-gen.h" "$tmp_dir/auth-gen.b" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $TEST_USER_JWT" \
    -H "Content-Type: application/json" \
    --data '{"hotelName":"Hotel Teste","location":"São Paulo"}')"
  if [[ "$code" =~ ^(200|429|502)$ ]]; then
    pass "generate-tips autenticado respondeu ($code)"
  else
    fail "generate-tips autenticado falhou ($code)"
  fi

  code="$(http_code POST "$SUPABASE_URL/functions/v1/extract-reservation" "$tmp_dir/auth-ext.h" "$tmp_dir/auth-ext.b" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $TEST_USER_JWT" \
    -H "Content-Type: application/json" \
    --data '{"fileName":"smoke.txt","text":"Voo G3 1234 origem GRU destino REC data 2026-03-10 10:00"}')"
  if [[ "$code" =~ ^(200|429|502)$ ]]; then
    pass "extract-reservation autenticado respondeu ($code)"
  else
    fail "extract-reservation autenticado falhou ($code)"
  fi
else
  warn "TEST_USER_JWT ausente: smoke autenticado foi pulado"
fi

echo
echo "Resumo smoke tests"
echo "- PASS: $pass_count"
echo "- WARN: $warn_count"
echo "- FAIL: $fail_count"

if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
