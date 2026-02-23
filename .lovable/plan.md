

## Importar roteiro completo com extracao multi-item

### Problema atual

O pipeline de importacao atual (`extract-reservation`) processa **um documento = uma reserva**. Quando o usuario sobe um roteiro completo (ex: PDF com voos, hoteis, restaurantes e atracoes), o sistema tenta classificar como um unico tipo e perde a maioria dos dados.

### Solucao proposta

Criar um novo fluxo "Importar Roteiro" que usa a IA para extrair **multiplos itens** de um unico documento e inseri-los nas tabelas corretas automaticamente.

### Arquitetura

```text
Documento do usuario
        |
    OCR (existente)
        |
  nova edge function "extract-itinerary"
        |
  retorna array de items:
  [
    { tipo: "voo", dados: {...} },
    { tipo: "hospedagem", dados: {...} },
    { tipo: "transporte", dados: {...} },
    { tipo: "restaurante", dados: {...} },
    { tipo: "atividade", dados: {...} }  // novo: vira roteiro_dias
  ]
        |
  tela de revisao multi-item
        |
  salvamento em lote nas tabelas corretas
```

### Mudancas planejadas

#### 1. Nova edge function `supabase/functions/extract-itinerary/index.ts`

- Recebe texto OCR (mesmo fluxo atual) mas com prompt diferente
- Prompt instrui a IA a retornar um **array JSON** com todos os items encontrados
- Cada item tem: `tipo` (voo, hospedagem, transporte, restaurante, atividade), `dados` com campos especificos por tipo, e `confianca`
- Usa a mesma estrategia de race (Gemini + Arcee + fallback Lovable AI)
- `max_tokens` maior (6000) para acomodar documentos ricos
- Schema de resposta:
  ```text
  {
    "items": [
      {
        "tipo": "voo|hospedagem|transporte|restaurante|atividade",
        "confianca": 0-100,
        "dados": {
          // campos especificos por tipo
        }
      }
    ],
    "resumo_viagem": {
      "destino": "string|null",
      "data_inicio": "YYYY-MM-DD|null",
      "data_fim": "YYYY-MM-DD|null"
    }
  }
  ```

#### 2. Servico frontend `src/services/importPipeline.ts`

Adicionar nova funcao `extractItineraryStructured(text, fileName)` que chama a edge function `extract-itinerary` e retorna o array tipado de items.

Novo tipo `ExtractedItineraryItem`:
- `tipo`: voo | hospedagem | transporte | restaurante | atividade
- `dados`: campos normalizados por tipo (mesmos campos das tabelas)
- `confianca`: numero 0-1

#### 3. Componente `src/components/import/ImportItineraryDialog.tsx` (novo)

Dialog dedicado para importacao de roteiros completos:

1. **Upload**: mesma logica de upload do ImportReservationDialog
2. **OCR + Extracao**: usa OCR existente + nova `extractItineraryStructured`
3. **Revisao multi-item**: lista todos os items extraidos em cards agrupados por tipo
   - Cada item tem checkbox para incluir/excluir
   - Campos editaveis inline (resumido, nao formulario completo)
   - Badge de confianca por item
4. **Salvamento em lote**: ao confirmar, salva cada item na tabela correspondente:
   - `voo` -> tabela `voos`
   - `hospedagem` -> tabela `hospedagens` (com geracao de dicas)
   - `transporte` -> tabela `transportes`
   - `restaurante` -> tabela `restaurantes`
   - `atividade` -> tabela `roteiro_dias`
5. **Resumo final**: mostra contagem de items salvos por tipo

#### 4. Dashboard `src/pages/Dashboard.tsx`

Adicionar botao "Importar roteiro" ao lado do botao de importacao existente, abrindo o novo `ImportItineraryDialog`.

#### 5. Config `supabase/config.toml`

Adicionar entrada para a nova edge function:
```text
[functions.extract-itinerary]
verify_jwt = false
```

### Detalhes da edge function

O prompt do `extract-itinerary` sera especializado:

- Instrui a IA a varrer o documento inteiro e extrair TODOS os items de viagem
- Para cada voo: origem, destino, data, hora, companhia, numero, valor
- Para cada hospedagem: nome, localizacao, check_in, check_out, valor
- Para cada transporte: tipo, origem, destino, data, operadora
- Para cada restaurante: nome, cidade, tipo
- Para cada atividade/atracao: titulo, descricao, dia, horario, localizacao, categoria
- Normaliza datas para ISO, valores com 2 casas decimais
- Retorna `resumo_viagem` com destino e datas gerais inferidas

### Fluxo do usuario

1. Clica "Importar roteiro" no dashboard
2. Sobe arquivo (PDF, imagem, texto)
3. Sistema faz OCR + extracao multi-item
4. Ve lista de todos os items detectados com checkboxes
5. Edita/remove items conforme necessario
6. Clica "Salvar tudo"
7. Todos os items sao inseridos nas tabelas corretas
8. Dashboard atualiza com todos os novos dados

### Arquivos afetados

- `supabase/functions/extract-itinerary/index.ts` -- nova edge function
- `src/services/importPipeline.ts` -- novo tipo e funcao de chamada
- `src/components/import/ImportItineraryDialog.tsx` -- novo componente
- `src/components/import/import-types.ts` -- novos tipos para itinerario multi-item
- `src/pages/Dashboard.tsx` -- botao de entrada
- `supabase/config.toml` -- registro da nova funcao

### Sem mudancas de banco de dados

Todas as tabelas necessarias ja existem (voos, hospedagens, transportes, restaurantes, roteiro_dias).
