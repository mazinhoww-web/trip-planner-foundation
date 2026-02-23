

## Roteiro inteligente com contexto completo da viagem

### Problema atual

O roteiro gerado pela IA ignora dados cruciais:
- **Datas dos voos**: nao sabe que o viajante chega as 14h e nao pode ter atividade as 09h no primeiro dia
- **Datas das hospedagens**: nao diferencia dias em cidades diferentes (ex: 3 dias em Paris, 2 em Roma)
- **Transportes**: nao inclui deslocamentos entre cidades como atividades
- **Restaurantes salvos**: nao prioriza restaurantes que o usuario ja salvou
- **Dicas das hospedagens**: apesar de enviadas, o prompt nao da peso suficiente a elas

### Mudancas planejadas

#### 1. Edge function `generate-itinerary/index.ts` -- prompt e dados enriquecidos

**Ampliar o input aceito** para incluir:
- `transports` (tipo, origem, destino, data/hora)
- `restaurants` (nome, cidade, tipo)
- Horario de chegada/partida nos `flights` (campo `data` ja existe mas o prompt nao o usa)

**Reescrever o SYSTEM_PROMPT** para:
- Instruir que no dia de chegada de um voo, as atividades so comecam DEPOIS do horario de chegada + 1h (deslocamento)
- Instruir que no dia de partida, as atividades terminam ANTES do horario do voo - 3h (ida ao aeroporto)
- Quando houver troca de cidade (check-out de uma hospedagem + check-in de outra), incluir atividade de "Deslocamento" com categoria "transporte"
- Usar restaurantes ja salvos pelo usuario como sugestoes prioritarias de almoco/jantar
- Distribuir atracoes da hospedagem nos dias corretos (ex: atracoes perto do hotel de Paris nos dias em Paris)
- Aumentar `max_tokens` de 4000 para 6000 para viagens mais longas

**Refinar o payload enviado a IA** para incluir nome da hospedagem (campo `nome`) e dados dos transportes/restaurantes.

#### 2. Frontend `src/pages/Dashboard.tsx` -- enviar dados completos

No `onClick` do botao "Gerar roteiro com IA", adicionar ao payload:
- `transports`: dados dos transportes cadastrados (tipo, origem, destino, data)
- `restaurants`: restaurantes salvos (nome, cidade, tipo)
- `stays`: adicionar campo `nome` (ja disponivel mas nao enviado)
- `flights`: ja envia `data` mas confirmar que inclui horario

#### 3. Servico `src/services/ai.ts` -- ampliar tipos

Atualizar `GenerateItineraryInput` para aceitar os novos campos:
- `transports?: Array<{ tipo, origem, destino, data }>`
- `restaurants?: Array<{ nome, cidade, tipo }>`
- Adicionar `nome` no array de stays

### Exemplo de resultado esperado

Viagem SP -> Paris (15-20 jan) -> Roma (20-23 jan) -> SP:

| Dia | Atividade |
|-----|-----------|
| 15/01 | Chegada CDG 14h. Check-in hotel. Jantar leve perto do hotel |
| 16/01 | Torre Eiffel (manha). Almoco em restaurante salvo. Museu d'Orsay (tarde) |
| 17/01 | Montmartre (manha). Almoco bistro. Champs-Elysees (tarde) |
| 20/01 | Check-out Paris. Deslocamento Paris->Roma. Check-in Roma. Jantar Trastevere |
| 23/01 | Ultimo passeio. Ida ao aeroporto FCO. Voo de volta |

### Detalhes tecnicos

**Arquivos afetados:**
- `supabase/functions/generate-itinerary/index.ts` -- prompt + input ampliados
- `src/services/ai.ts` -- tipos atualizados
- `src/pages/Dashboard.tsx` -- payload enriquecido

**Sem mudancas de banco de dados** -- os campos do `roteiro_dias` ja suportam tudo necessario.
