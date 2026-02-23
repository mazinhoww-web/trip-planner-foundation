
## Plano: Acelerar pipeline sem remover enriquecimento

### Problema
O pipeline esta lento porque:
- `extract-reservation`: `Promise.allSettled` espera AMBOS providers terminarem antes de escolher
- `ocr-document`: vision providers rodam em sequencia (um falha, espera, tenta o proximo)
- Client-side: upload e extracao de texto rodam sequencialmente
- Sem timeouts nas chamadas de AI

### Estrategia

Manter tudo que existe (incluindo `enriquecimento_ia`). Apenas mudar a estrategia de execucao e priorizar Gemini (mais rapido na media).

### Mudancas

#### 1. `supabase/functions/extract-reservation/index.ts`

**Race com Gemini prioritario:**
- Disparar Gemini primeiro (mais rapido) com timeout de 8s via `AbortController`
- Se Gemini retornar resultado valido com confianca >= 60, usar imediatamente sem esperar Arcee
- Caso contrario, disparar Arcee em paralelo (ja estara rodando) e comparar resultados
- Se ambos falharem, fallback para Lovable AI
- Implementacao: usar `Promise.allSettled` mas com wrapper de timeout, e logica de "early accept" onde Gemini pode ganhar sozinho se for bom o suficiente

Concretamente:
1. Disparar ambos com `AbortController` (timeout 8s cada)
2. Usar `Promise.race` entre:
   - Gemini com logica de "aceitar se confianca >= 60"
   - Promise.allSettled de ambos (para comparar se Gemini nao foi aceito rapido)
3. Se nenhum funcionar, chamar Lovable AI

#### 2. `supabase/functions/ocr-document/index.ts`

**Vision em paralelo com `Promise.any`:**
- Trocar o loop `for...of` sequencial por `Promise.any` nos 3 providers (Gemma, Gemini, Lovable AI)
- Cada um com timeout de 10s via `AbortController`
- O primeiro que retornar texto valido ganha
- Manter a ordem de prioridade no log mas nao na execucao

#### 3. `src/components/import/ImportReservationDialog.tsx`

**Upload + text extraction em paralelo:**
- Na funcao `processOneFile`, linhas 643-677: rodar `uploadImportFile` e `tryExtractNativeText` simultaneamente com `Promise.all`
- Mover a criacao do document metadata para depois do upload (ja e assim)
- Se nao tiver texto nativo, rodar OCR em paralelo com o registro de metadados

### Detalhes tecnicos

**extract-reservation - Race com early accept:**

```text
// Disparar ambos com timeout
const geminiPromise = withTimeout(callGemini(...), 8000)
const arceePromise = withTimeout(callArcee(...), 8000)

// Tentar Gemini first (mais rapido na media)
try {
  const gemini = await Promise.race([
    geminiPromise.then(r => ({ ...r, source: 'gemini' })),
    new Promise((_, reject) => setTimeout(() => reject('timeout_race'), 4000))
  ])
  // Se confianca >= 60, usar direto
  if (parsed.metadata.confianca >= 60) return gemini
} catch { /* continua */ }

// Se Gemini nao bastou, esperar ambos
const [arcee, gemini] = await Promise.allSettled([arceePromise, geminiPromise])
// Comparar e pegar melhor
```

**ocr-document - Promise.any:**

```text
// Antes (sequencial):
for (const { fn, name } of visionProviders) {
  const result = await fn()
  if (result.text) return result
}

// Depois (paralelo):
const visionMime = mimeType || (isImage ? 'image/png' : 'application/pdf')
const result = await Promise.any([
  withTimeout(runGemmaVision(fileBase64, visionMime), 10000).then(r => ({ ...r, method: 'gemma_vision' })),
  withTimeout(runGeminiVision(fileBase64, visionMime), 10000).then(r => ({ ...r, method: 'gemini_vision' })),
  withTimeout(runLovableVision(fileBase64, visionMime), 10000).then(r => ({ ...r, method: 'lovable_ai_vision' })),
].map(p => p.then(r => {
  if (!r.text) throw new Error('empty')
  return r
})))
```

**Client paralelo:**

```text
// Antes (linhas 643-662):
const upload = await uploadImportFile(file, user.id, currentTripId)
// ... metadata ...
const native = await tryExtractNativeText(file)

// Depois:
const [upload, native] = await Promise.all([
  uploadImportFile(file, user.id, currentTripId),
  tryExtractNativeText(file),
])
```

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/extract-reservation/index.ts` | Race strategy com Gemini prioritario + timeouts |
| `supabase/functions/ocr-document/index.ts` | Vision providers em paralelo com Promise.any + timeouts |
| `src/components/import/ImportReservationDialog.tsx` | Upload + text extraction em paralelo |

### O que NAO muda
- Prompt completo mantido (incluindo `enriquecimento_ia`)
- Schema JSON mantido integralmente
- max_tokens mantido em 1300
- Toda logica de normalizacao e fallback mantida
- Lovable AI continua como 3o fallback

### Impacto estimado
- Extracao: de ~15-25s para ~4-8s (Gemini responde em ~3-5s, aceito direto se bom)
- OCR vision: de ~10-30s (sequencial) para ~5-10s (paralelo, primeiro ganha)
- Upload + leitura: economia de ~1-2s (paralelo no client)
