

## Plano: Adaptar OCR para limites do plano Free do OCR.space

### Contexto

O plano gratuito do OCR.space tem limites importantes:
- **1 MB** por arquivo
- **3 paginas** por PDF
- **25.000 requests/mes**

Atualmente, o edge function `ocr-document` envia o base64 inteiro (ate 6 MB) sem verificar esses limites, causando falhas silenciosas ou rejeicoes pela API.

### Mudancas

#### 1. Validacao de tamanho antes de enviar ao OCR.space (`ocr-document/index.ts`)

- Calcular tamanho real do arquivo a partir do base64 (`base64.length * 3/4`)
- Se > 1 MB, nao chamar OCR.space diretamente -- pular para fallback (native PDF ou vision)
- Adicionar warning informando que o arquivo excede o limite free

#### 2. Chunking de imagens grandes no client (`importPipeline.ts`)

- Antes de enviar ao edge function, verificar `file.size`
- Se imagem > 1 MB: redimensionar via canvas (reduzir resolucao ate caber em ~900 KB)
- Se PDF > 1 MB: manter envio normal (o edge function usara native PDF extraction ou vision como fallback)

#### 3. Fallback mais inteligente no edge function

- Quando arquivo excede 1 MB:
  - PDFs: tentar native text extraction primeiro (ja existe), se falhar usar Lovable AI (Gemini Flash) como fallback de visao no lugar do OpenRouter
  - Imagens: usar Lovable AI (Gemini Flash) como fallback primario em vez de Gemma via OpenRouter
- Isso elimina dependencia do OpenRouter e usa infraestrutura ja disponivel

#### 4. Logging de limites

- Logar quando arquivo foi rejeitado por tamanho com detalhes (tamanho original, limite)
- Incluir no response `warnings` quando fallback foi usado por causa de limite

### Detalhes tecnicos

**Edge function `ocr-document/index.ts`:**

```text
1. Calcular fileSizeBytes = base64.length * 3 / 4
2. Se fileSizeBytes > 1_000_000:
   - warnings.push("Arquivo excede 1 MB, OCR.space ignorado")
   - Pular runOcrSpace()
   - Ir direto para native PDF ou vision fallback
3. Substituir runOpenRouterVision por runLovableVision 
   usando LOVABLE_API_KEY + Gemini Flash
```

**Client `importPipeline.ts`:**

```text
1. Adicionar funcao resizeImageIfNeeded(file: File, maxBytes: number)
   - Se file.size <= maxBytes, retornar file original
   - Senao, usar canvas para redimensionar progressivamente
   - Retornar novo File com tamanho <= maxBytes
2. Chamar antes de toBase64() em runOcrDocument()
```

**Modelo de fallback:**
- Trocar `google/gemma-3-27b-it:free` via OpenRouter
- Por `google/gemini-2.5-flash` via Lovable AI gateway (`https://ai.gateway.lovable.dev/v1/chat/completions` + `LOVABLE_API_KEY`)

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/ocr-document/index.ts` | Validacao de tamanho, trocar vision para Lovable AI |
| `src/services/importPipeline.ts` | Resize de imagem no client antes de enviar |

### Riscos

- Resize de imagem pode reduzir qualidade do OCR para documentos com texto pequeno
- Mitigacao: reduzir resolucao gradualmente, manter aspect ratio

