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
for fn in generate-tips suggest-restaurants ocr-document extract-reservation trip-members; do
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
    if [ "$code" = "200" ]; then
      if grep -q "\"provider_meta\"" "$tmp_dir/auth-gen.b"; then
        pass "generate-tips autenticado respondeu com provider_meta (200)"
      else
        warn "generate-tips autenticado respondeu 200 sem provider_meta"
      fi
    else
      pass "generate-tips autenticado respondeu ($code)"
    fi
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

  code="$(http_code POST "$SUPABASE_URL/functions/v1/suggest-restaurants" "$tmp_dir/auth-rest.h" "$tmp_dir/auth-rest.b" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $TEST_USER_JWT" \
    -H "Content-Type: application/json" \
    --data '{"city":"São Paulo"}')"
  if [[ "$code" =~ ^(200|429|502)$ ]]; then
    if [ "$code" = "200" ]; then
      if grep -q "\"provider_meta\"" "$tmp_dir/auth-rest.b"; then
        pass "suggest-restaurants autenticado respondeu com provider_meta (200)"
      else
        warn "suggest-restaurants autenticado respondeu 200 sem provider_meta"
      fi
    else
      pass "suggest-restaurants autenticado respondeu ($code)"
    fi
  else
    fail "suggest-restaurants autenticado falhou ($code)"
  fi

  # Classificação por tipo (voo/hospedagem/restaurante)
  run_extract_type_check() {
    local sample_name="$1"
    local sample_text="$2"
    local expected_type="$3"
    local expected_field_1="$4"
    local expected_field_2="$5"
    local expected_field_3="$6"
    local body="$tmp_dir/ext-${expected_type}.b"

    code="$(http_code POST "$SUPABASE_URL/functions/v1/extract-reservation" "$tmp_dir/ext-${expected_type}.h" "$body" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: Bearer $TEST_USER_JWT" \
      -H "Content-Type: application/json" \
      --data "{\"fileName\":\"$sample_name\",\"text\":\"$sample_text\"}")"

    if [ "$code" = "200" ]; then
      if grep -q "\"provider_meta\"" "$body"; then
        pass "extract-reservation retornou provider_meta no cenário $expected_type"
      else
        warn "extract-reservation 200 sem provider_meta no cenário $expected_type"
      fi
      if grep -q "\"type\":\"$expected_type\"" "$body"; then
        local fields_found=0
        grep -q "$expected_field_1" "$body" && fields_found=$((fields_found + 1))
        grep -q "$expected_field_2" "$body" && fields_found=$((fields_found + 1))
        grep -q "$expected_field_3" "$body" && fields_found=$((fields_found + 1))
        if [ "$fields_found" -ge 2 ]; then
          pass "extract-reservation classifica $expected_type e retorna campos úteis ($fields_found/3)"
        else
          warn "extract-reservation classifica $expected_type mas com poucos campos úteis ($fields_found/3)"
        fi
      else
        warn "extract-reservation respondeu 200 mas sem type=$expected_type"
      fi
    elif [[ "$code" =~ ^(429|502)$ ]]; then
      warn "extract-reservation indisponível para validação de type=$expected_type ($code)"
    else
      fail "extract-reservation falhou no cenário $expected_type ($code)"
    fi
  }

  run_extract_type_check \
    "latam-comprovante.pdf" \
    "LATAM LA3303 origem GRU destino FLN data 2026-04-02 valor R$ 1200" \
    "voo" \
    "\"origem\":\"GRU\"" \
    "\"destino\":\"FLN\"" \
    "\"numero\":\"LA3303\""
  run_extract_type_check \
    "airbnb-recibo.pdf" \
    "Airbnb recibo check-in 2026-04-03 checkout 2026-04-05 Grindelwald valor CHF 1226.80" \
    "hospedagem" \
    "\"check_in\":\"2026-04-03\"" \
    "\"check_out\":\"2026-04-05\"" \
    "\"moeda\":\"CHF\""
  run_extract_type_check \
    "reserva-restaurante.pdf" \
    "Reserva de restaurante para 2 pessoas no Weisses Rössli em Zurich" \
    "restaurante" \
    "\"nome\":" \
    "\"cidade\":" \
    "\"tipo\":"

  code="$(http_code POST "$SUPABASE_URL/functions/v1/extract-reservation" "$tmp_dir/ext-outscope.h" "$tmp_dir/ext-outscope.b" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $TEST_USER_JWT" \
    -H "Content-Type: application/json" \
    --data '{"fileName":"fatura-energia.pdf","text":"Conta de energia residencial vencimento 10/02/2026 consumo mensal"}')"
  if [ "$code" = "200" ]; then
    if grep -q "\"scope\":\"outside_scope\"" "$tmp_dir/ext-outscope.b"; then
      pass "extract-reservation marca fora de escopo corretamente"
    else
      warn "extract-reservation não marcou outside_scope no cenário não-viagem"
    fi
  elif [[ "$code" =~ ^(429|502)$ ]]; then
    warn "extract-reservation indisponível para validação de outside_scope ($code)"
  else
    fail "extract-reservation falhou no cenário outside_scope ($code)"
  fi

  # CRUD mínimo autenticado (opcional com TEST_TRIP_ID)
  if [ -n "${TEST_TRIP_ID:-}" ] && [ -n "${TEST_USER_ID:-}" ]; then
    echo "Executando CRUD básico com TEST_TRIP_ID..."

    code="$(http_code POST "$SUPABASE_URL/functions/v1/trip-members" "$tmp_dir/auth-trip-members.h" "$tmp_dir/auth-trip-members.b" \
      -H "apikey: $SUPABASE_ANON_KEY" \
      -H "Authorization: Bearer $TEST_USER_JWT" \
      -H "Content-Type: application/json" \
      --data "{\"action\":\"list_members\",\"viagemId\":\"$TEST_TRIP_ID\"}")"

    if [ "$code" = "200" ]; then
      if grep -q "\"permission\"" "$tmp_dir/auth-trip-members.b"; then
        pass "trip-members list_members autenticado respondeu com contexto de permissão"
      else
        warn "trip-members list_members respondeu 200 sem permission no payload"
      fi
    else
      fail "trip-members list_members autenticado falhou ($code)"
    fi

    create_and_delete_row() {
      local table="$1"
      local payload="$2"
      local create_body="$tmp_dir/create-${table}.b"
      local created_id=""

      code="$(http_code POST "$SUPABASE_URL/rest/v1/$table" "$tmp_dir/create-${table}.h" "$create_body" \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $TEST_USER_JWT" \
        -H "Content-Type: application/json" \
        -H "Prefer: return=representation" \
        --data "$payload")"

      if [ "$code" != "201" ] && [ "$code" != "200" ]; then
        fail "CRUD create em $table falhou ($code)"
        return
      fi

      created_id="$(sed -n 's/.*\"id\":\"\\([^\"]*\\)\".*/\\1/p' "$create_body" | head -n 1)"
      if [ -z "$created_id" ]; then
        fail "CRUD create em $table sem id retornado"
        return
      fi
      pass "CRUD create em $table OK"

      code="$(http_code DELETE "$SUPABASE_URL/rest/v1/$table?id=eq.$created_id" "$tmp_dir/delete-${table}.h" "$tmp_dir/delete-${table}.b" \
        -H "apikey: $SUPABASE_ANON_KEY" \
        -H "Authorization: Bearer $TEST_USER_JWT")"

      if [ "$code" = "204" ] || [ "$code" = "200" ]; then
        pass "CRUD delete em $table OK"
      else
        fail "CRUD delete em $table falhou ($code)"
      fi
    }

    create_and_delete_row "voos" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"numero\":\"SMOKE123\",\"companhia\":\"Smoke\",\"origem\":\"GRU\",\"destino\":\"REC\",\"status\":\"pendente\",\"user_id\":\"$TEST_USER_ID\"}"
    create_and_delete_row "hospedagens" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"nome\":\"Smoke Hotel\",\"localizacao\":\"São Paulo\",\"status\":\"pendente\",\"user_id\":\"$TEST_USER_ID\"}"
    create_and_delete_row "transportes" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"tipo\":\"Trem\",\"origem\":\"Zurich\",\"destino\":\"Lucerna\",\"status\":\"pendente\",\"user_id\":\"$TEST_USER_ID\"}"
    create_and_delete_row "despesas" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"titulo\":\"Smoke expense\",\"valor\":10,\"moeda\":\"BRL\",\"categoria\":\"teste\",\"user_id\":\"$TEST_USER_ID\"}"
    create_and_delete_row "tarefas" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"titulo\":\"Smoke task\",\"prioridade\":\"media\",\"concluida\":false,\"user_id\":\"$TEST_USER_ID\"}"
    create_and_delete_row "restaurantes" "{\"viagem_id\":\"$TEST_TRIP_ID\",\"nome\":\"Smoke restaurant\",\"salvo\":true,\"user_id\":\"$TEST_USER_ID\"}"
  elif [ -n "${TEST_TRIP_ID:-}" ] && [ -z "${TEST_USER_ID:-}" ]; then
    warn "TEST_USER_ID ausente: CRUD autenticado foi pulado"
  else
    warn "TEST_TRIP_ID ausente: CRUD autenticado foi pulado"
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
