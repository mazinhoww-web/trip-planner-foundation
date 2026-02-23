

## Plano: Hierarquia de AI com Arcee + Gemini em paralelo e Lovable AI como 3o fallback

### Resumo

Reestruturar todas as 4 edge functions para usar:
1. **Arcee (OpenRouter)** + **Gemini API direto** em paralelo (para texto)
2. **Gemma (OpenRouter)** para visao/imagens
3. **Lovable AI** como 3o fallback

O resultado com melhor confianca entre Arcee e Gemini sera usado.

### Secrets a configurar

| Secret | Valor |
|---|---|
| `OPENROUTER_API_KEY` | Chave OpenRouter fornecida |
| `GEMINI_API_KEY` | Chave Gemini API fornecida |

### Mudancas por edge function

#### 1. `extract-reservation/index.ts` (principal)

- Executar Arcee (OpenRouter) e Gemini API **em paralelo** via `Promise.allSettled`
- Ambos recebem o mesmo prompt e texto
- Comparar `metadata.confianca` dos dois resultados
- Usar o que tiver maior confianca
- Se ambos falharem, cair para Lovable AI (atual)
- Gemini API: `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`

#### 2. `ocr-document/index.ts`

- Camada de visao: trocar Lovable AI vision por **Gemma via OpenRouter** (`google/gemma-3-27b-it:free`) como primario
- Fallback de visao: Gemini API direto (com imagem base64)
- 3o fallback: Lovable AI vision (ja implementado)

#### 3. `generate-tips/index.ts`

- Primario: Arcee via OpenRouter (ja existe)
- Fallback 1: Gemini API direto
- Fallback 2: Lovable AI

#### 4. `suggest-restaurants/index.ts`

- Primario: Arcee via OpenRouter (ja existe)
- Fallback 1: Gemini API direto
- Fallback 2: Lovable AI

### Detalhes tecnicos

**Chamada Gemini API direta (texto):**

```text
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
Header: X-goog-api-key: ${GEMINI_API_KEY}
Body: { contents: [{ parts: [{ text: "..." }] }] }
```

**Chamada OpenRouter Arcee (texto):**

```text
POST https://openrouter.ai/api/v1/chat/completions
Header: Authorization: Bearer ${OPENROUTER_API_KEY}
Model: arcee-ai/trinity-large-preview:free
```

**Chamada OpenRouter Gemma (visao/imagem):**

```text
POST https://openrouter.ai/api/v1/chat/completions
Header: Authorization: Bearer ${OPENROUTER_API_KEY}
Model: google/gemma-3-27b-it:free
Messages: [{ role: "user", content: [{ type: "text", ... }, { type: "image_url", ... }] }]
```

**Logica paralela no extract-reservation:**

```text
1. Promise.allSettled([callArcee(text), callGemini(text)])
2. Filtrar resultados com sucesso
3. Parsear JSON de cada resultado
4. Comparar metadata.confianca
5. Usar o com maior confianca
6. Se nenhum funcionar -> chamar Lovable AI como fallback
```

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/extract-reservation/index.ts` | Paralelo Arcee+Gemini, Lovable AI como 3o fallback |
| `supabase/functions/ocr-document/index.ts` | Gemma vision primario, Gemini fallback, Lovable AI 3o |
| `supabase/functions/generate-tips/index.ts` | Manter Arcee, adicionar Gemini fallback, Lovable AI 3o |
| `supabase/functions/suggest-restaurants/index.ts` | Manter Arcee, adicionar Gemini fallback, Lovable AI 3o |

