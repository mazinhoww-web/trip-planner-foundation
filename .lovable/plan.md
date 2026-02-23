

## Plano: Enriquecer dicas de hospedagem com dados reais e contextuais

### Problema atual

1. O prompt do `generate-tips` e generico demais: "Gere dicas para estadia no hotel informado" sem contexto de voos, ruas, bairros
2. O fallback em `src/services/ai.ts` retorna frases template como "Pesquise no mapa por pontos culturais" -- completamente inuteis
3. Os dados enviados ao backend sao insuficientes: so passam `hotelName`, `location`, `checkIn`, `checkOut`, `tripDestination` -- faltam dados de voos (aeroporto de chegada), endereco detalhado, meio de transporte
4. O campo `dica_ia` nao tem instrucao clara no prompt -- a IA nao sabe o que colocar ali
5. Restaurantes no fallback sao inventados ("Sabores do Centro (paris)") -- nomes falsos

### Correcoes

#### 1. Expandir input do `generate-tips` com dados de contexto da viagem

**Arquivo: `src/services/ai.ts`** e **`src/pages/Dashboard.tsx`** e **`src/components/import/ImportReservationDialog.tsx`**

Adicionar campos ao `StayTipsInput`:
- `flightOrigin`: aeroporto/cidade de onde o usuario esta vindo (buscar do modulo de voos)
- `flightDestination`: aeroporto de chegada na cidade do hotel
- `address`: endereco completo se disponivel (rua, bairro)
- `transportMode`: se tem voo cadastrado = "aviao", se tem transporte terrestre = "carro/onibus"

No Dashboard, ao chamar `enrichStay`, buscar tambem os voos da viagem para extrair aeroporto de chegada e origem.

#### 2. Reescrever o prompt do `generate-tips` (backend)

**Arquivo: `supabase/functions/generate-tips/index.ts`**

Novo prompt muito mais especifico:

```text
Voce e um assistente de viagem especializado. Com base nos dados da hospedagem e do contexto da viagem, gere informacoes REAIS e UTEIS.

Dados disponiveis:
- Nome do hotel/hospedagem
- Endereco/localizacao (cidade, bairro, rua)
- Datas de check-in e check-out
- Destino da viagem
- Aeroporto/cidade de origem do viajante (se disponivel)
- Aeroporto/cidade de chegada (se disponivel)
- Meio de transporte (aviao, carro, etc)

Entregue:

1) dica_viagem: Dica pratica e especifica sobre a estadia. Ex: "O bairro Marais em Paris tem ruas estreitas -- prefira mala de mao rigida. Supermercado Monoprix a 200m na Rue de Rivoli." Nao repita dados obvios como "confirme check-in".

2) como_chegar: Rota ESPECIFICA do aeroporto/estacao ate o hotel. Se o usuario vem de aviao, descreva o trajeto desde o aeroporto de chegada (ex: "Do aeroporto CDG, pegue o RER B ate Chatelet-Les Halles, depois linha 1 do metro ate Hotel de Ville. Alternativa: taxi/Uber ~50 EUR, 45min."). Se vem de carro, sugira rota e inclua um link Google Maps no formato: https://www.google.com/maps/dir/ORIGEM/DESTINO. Se nao souber o aeroporto, liste as 2-3 opcoes principais de chegada na cidade.

3) atracoes_proximas: Liste 3-4 atracoes REAIS com nomes verdadeiros proximo ao hotel. Use nomes de pontos turisticos, museus, parques, etc que existem de verdade na regiao. Inclua distancia aproximada. Ex: "Musee du Louvre (800m), Place des Vosges (400m), Centre Pompidou (600m)".

4) restaurantes_proximos: Liste 3-4 restaurantes ou tipos de culinaria da REGIAO REAL do hotel. Pode usar nomes de ruas/bairros conhecidos. Ex: "Rue des Rosiers (falafel, 300m), Le Marais cafes na Rue Vieille du Temple, Breizh Cafe (crepes bretones, 500m)".

5) dica_ia: Uma informacao UNICA e util que nao se encaixa nas categorias acima. Pode ser: clima esperado nas datas, evento local acontecendo, dica de seguranca do bairro, costume local, melhor horario para visitar algo, app de transporte local recomendado, etc. Ex: "Em dezembro Paris tem mercados de Natal nos Champs-Elysees. Baixe o app Citymapper para navegacao."

Regras:
- Portugues do Brasil
- Use nomes REAIS de lugares, ruas, estacoes de metro/trem
- Se nao tiver certeza do nome exato, use a regiao/bairro
- NUNCA invente nomes de restaurantes -- prefira descrever o tipo de culinaria do bairro
- Inclua distancias aproximadas quando possivel
- Se tiver dados de voo, use o aeroporto REAL de chegada na resposta
- Responda APENAS JSON valido no formato especificado
```

Aumentar `max_tokens` de 450 para 700 para permitir respostas mais detalhadas.

#### 3. Melhorar o fallback local em `src/services/ai.ts`

**Arquivo: `src/services/ai.ts`**

O fallback nao deve inventar dados -- deve ser honesto que nao conseguiu gerar e sugerir acoes ao usuario:

```typescript
function fallbackStayTips(input: StayTipsInput): StayTipsOutput {
  const loc = trimOrNull(input.location) ?? trimOrNull(input.tripDestination) ?? 'sua hospedagem';
  return {
    dica_viagem: `Verifique horarios de check-in/check-out diretamente com ${loc}. Salve o endereco no Google Maps offline antes de viajar.`,
    como_chegar: input.flightOrigin 
      ? `Pesquise rotas de ${input.flightOrigin} ate ${loc} no Google Maps ou Rome2Rio para opcoes de transporte.`
      : `Pesquise rotas ate ${loc} no Google Maps ou Rome2Rio para opcoes de transporte com precos.`,
    atracoes_proximas: `Busque "atracoes perto de ${loc}" no Google Maps para ver pontos turisticos com avaliacoes reais.`,
    restaurantes_proximos: `Busque "restaurantes perto de ${loc}" no Google Maps para ver opcoes com avaliacoes e precos.`,
    dica_ia: 'Dicas automaticas indisponiveis no momento. Tente novamente em alguns minutos para obter sugestoes personalizadas.',
  };
}
```

#### 4. Passar dados de voo ao chamar `enrichStay`

**Arquivo: `src/pages/Dashboard.tsx`**

Na funcao `enrichStay`, buscar os voos da viagem atual e encontrar o voo mais proximo ao check-in da hospedagem para extrair aeroporto de origem e destino:

```typescript
const enrichStay = async (stay) => {
  // Buscar voos da viagem para contexto
  const flights = flightsModule.items ?? [];
  const relevantFlight = flights.find(f => f.destino && stay.localizacao?.toLowerCase().includes(f.destino.toLowerCase()));
  
  const result = await generateStayTips({
    hotelName: stay.nome,
    location: stay.localizacao,
    checkIn: stay.check_in,
    checkOut: stay.check_out,
    tripDestination: currentTrip?.destino,
    flightOrigin: relevantFlight?.origem ?? null,
    flightDestination: relevantFlight?.destino ?? null,
  });
  // ...
};
```

#### 5. Corrigir build errors existentes

**Arquivo: `supabase/functions/trip-members/index.ts`**

A funcao `requireSupabaseEnv` retorna um union type sem discriminar corretamente. Adicionar type guard com `as const` para que o TS entenda que quando `ok: true`, os campos existem:

```typescript
function requireSupabaseEnv(): 
  | { ok: false; message: string; supabaseUrl?: undefined; supabaseAnonKey?: undefined; supabaseServiceRole?: undefined }
  | { ok: true; message?: undefined; supabaseUrl: string; supabaseAnonKey: string; supabaseServiceRole: string } {
  // ... mesmo corpo
}
```

**Arquivo: `src/components/dashboard/TripUsersPanel.tsx`**

O `onConfirm` retorna `Promise<MutationPayload>` mas espera `void | Promise<void>`. Adicionar `.then(() => {})` ou ajustar para ignorar retorno.

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/generate-tips/index.ts` | Novo prompt detalhado, novos campos de input, max_tokens 700 |
| `src/services/ai.ts` | Expandir `StayTipsInput` com `flightOrigin`/`flightDestination`, melhorar fallback |
| `src/pages/Dashboard.tsx` | Passar dados de voo ao chamar `enrichStay` |
| `src/components/import/ImportReservationDialog.tsx` | Passar dados de voo ao chamar `generateStayTips` no import |
| `supabase/functions/trip-members/index.ts` | Fix TS: tipar retorno de `requireSupabaseEnv` como discriminated union |
| `src/components/dashboard/TripUsersPanel.tsx` | Fix TS: ajustar tipo de retorno dos callbacks `onConfirm` |

### O que NAO muda
- Schema do banco de dados (campos da tabela `hospedagens` continuam iguais)
- Hierarquia de providers (Arcee -> Gemini -> Lovable AI)
- Logica de race/paralelo do `extract-reservation`
- Estrutura do JSON de resposta (mesmos 5 campos)

