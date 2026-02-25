

## Corrigir erros de build que causam tela branca

### Diagnostico

A tela branca ao clicar em login e causada por **erros de compilacao** que impedem o app de carregar. Sao 2 problemas distintos:

### Erro 1: `trip-members/index.ts` -- tipo union nao tratado

A funcao `requireSupabaseEnv()` retorna um objeto com `ok: boolean`, mas quando `ok` e `true` os campos `supabaseUrl`, `supabaseAnonKey`, `supabaseServiceRole` sao `string`. Quando `ok` e `false`, so tem `message`. O TypeScript nao consegue inferir que apos o `if (!config.ok)` os campos existem como `string`.

**Correcao**: Usar discriminated union explicita com type narrowing, ou fazer cast com `!` apos a checagem de `config.ok`.

Na linha 318, `config.message` pode ser `undefined` (quando `ok: true`). Nas linhas 338-339, `config.supabaseUrl` etc podem ser `undefined` (quando `ok: false`).

**Solucao**: Tipar o retorno como discriminated union:
```text
type EnvResult =
  | { ok: false; message: string }
  | { ok: true; supabaseUrl: string; supabaseAnonKey: string; supabaseServiceRole: string }
```

### Erro 2: `Dashboard.tsx` linhas 3102 e 3135 -- `Viagem` incompativel com `Tables<'viagens'>`

O `currentTrip` vem do hook `useTrip` com tipo `Viagem` (que tem apenas `id, nome, user_id, destino, data_inicio, data_fim, status`). Porem, `buildTripSnapshot` espera `Tables<'viagens'>` que inclui tambem `created_at` e `updated_at`.

**Solucao**: Adicionar `created_at` e `updated_at` a interface `Viagem` em `src/hooks/useTrip.tsx` (esses campos ja vem do banco, so nao estao no tipo).

### Arquivos afetados

- `supabase/functions/trip-members/index.ts` -- tipar retorno de `requireSupabaseEnv` como discriminated union
- `src/hooks/useTrip.tsx` -- adicionar `created_at` e `updated_at` a interface `Viagem`

### Resultado esperado

Com os erros de build corrigidos, o app volta a compilar e a tela de login carrega normalmente.

