

## Plano: Localização do usuário como contexto principal + gaps inteligentes

### Problema

1. **Gaps falsos**: O sistema trata CADA trecho de voo como precisando de transporte terrestre. Para GRU>JFK>AMS>CDG, ele gera 3 gaps falsos:
   - "A definir → GRU" -- falso porque o usuario mora em SP, GRU e o aeroporto de casa
   - "A definir → AMS" -- falso porque AMS e apenas conexao (escala)
   - "21 Bis Rue de Paris → A definir" -- falso/confuso, deveria sugerir transporte publico CDG→hotel

2. **Nao detecta conexoes**: Se existe voo GRU→JFK e voo JFK→AMS, JFK e conexao -- nao precisa de transporte terrestre

3. **Nao conhece a cidade do usuario**: Sem saber que o usuario mora em Sao Paulo, nao pode suprimir o gap "casa → aeroporto"

4. **Dicas de transporte genericas**: O `como_chegar` nao diferencia cidades com bom transporte publico (Europa, NYC) de cidades onde faz sentido alugar carro (Miami, LA, Vegas)

### Solucao

#### 1. Adicionar `cidade_origem` na tabela `profiles`

Migration SQL para adicionar o campo:
```sql
ALTER TABLE public.profiles ADD COLUMN cidade_origem text;
```

Isso permite que o sistema saiba de onde o usuario parte. Sera preenchido no perfil do usuario.

#### 2. Detectar voos de conexao no `calculateTransportCoverageGaps`

**Arquivo: `src/services/tripInsights.ts`**

Adicionar funcao `identifyConnectionFlights` que analisa a cadeia de voos e marca quais sao conexao:
- Se voo A tem destino X e voo B tem origem X (ou match parcial), e a diferenca de tempo entre eles e menor que 24h, B e conexao
- Voos de conexao NAO geram gaps de transporte terrestre
- Apenas o aeroporto FINAL da cadeia (CDG no caso) gera gap ate a hospedagem

Logica:
```text
Voos ordenados por data: GRU→JFK, JFK→AMS, AMS→CDG
Conexoes detectadas: JFK (destino=origem seguinte), AMS (destino=origem seguinte)
Aeroporto final de chegada: CDG
Aeroporto de partida original: GRU
```

#### 3. Suprimir gaps da cidade de origem do usuario

**Arquivo: `src/services/tripInsights.ts`**

A funcao `calculateTransportCoverageGaps` passara a receber um parametro opcional `userHomeLocation: string | null`. Quando definido:
- Gaps onde `from` ou `to` match com `userHomeLocation` sao suprimidos (o usuario sabe como ir ao seu aeroporto local)
- O gap "hospedagem → aeroporto de partida" tambem e suprimido se o aeroporto de partida esta na cidade do usuario

#### 4. Gerar gap inteligente apenas para aeroporto final → hospedagem

Em vez de gerar gaps para cada trecho de voo, a logica sera:
- Identificar o aeroporto de CHEGADA final (ultimo destino da cadeia de voos)
- Verificar se existe transporte registrado desse aeroporto ate a primeira hospedagem
- Se nao existir, gerar gap com sugestao contextual (transporte publico vs carro)

#### 5. Melhorar `generate-tips` com contexto de transporte local

**Arquivo: `supabase/functions/generate-tips/index.ts`**

Adicionar ao input e ao prompt:
- `userHomeCity`: cidade de origem do usuario (para contextualizar "como chegar")
- Instrucao no prompt para diferenciar cidades:
  - Europa em geral, NYC, Tokyo, etc: priorizar transporte publico com linhas especificas
  - Miami, LA, Vegas, cidades do interior: sugerir locacao de veiculo ou Uber com estimativa de custo
  - Incluir link Google Maps do aeroporto ate o hotel: `https://www.google.com/maps/dir/CDG+Airport/21+Bis+Rue+de+Paris+Clichy`

#### 6. Expor campo `cidade_origem` no perfil

**Arquivo: `src/pages/Dashboard.tsx`** (ou componente de perfil)

Adicionar um campo simples para o usuario informar sua cidade de origem. Isso alimenta toda a logica de gaps e dicas.

### Detalhes tecnicos

**Deteccao de conexoes em `tripInsights.ts`:**

```typescript
function identifyFinalArrivalAirport(
  flights: Tables<'voos'>[],
  userHome: string | null,
): { arrivalAirport: string | null; departureAirport: string | null } {
  const active = flights
    .filter(f => isActiveStatus(f.status) && f.origem && f.destino)
    .sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

  if (active.length === 0) return { arrivalAirport: null, departureAirport: null };

  // Construir cadeia: detectar conexoes
  const connectionAirports = new Set<string>();
  for (let i = 0; i < active.length - 1; i++) {
    const current = active[i];
    const next = active[i + 1];
    if (locationsMatch(current.destino, next.origem)) {
      connectionAirports.add(normalizeTextForMatch(current.destino));
      connectionAirports.add(normalizeTextForMatch(next.origem));
    }
  }

  // Aeroporto de partida = origem do primeiro voo
  const departureAirport = active[0].origem;
  // Aeroporto de chegada final = destino do ultimo voo (que nao e conexao de volta)
  const arrivalAirport = active[active.length - 1].destino;

  return { arrivalAirport, departureAirport };
}
```

**Logica de gap revisada:**

Em vez de iterar todos os voos individualmente procurando gaps (linhas 207-252), a nova logica:

1. Identifica aeroporto final de chegada e de partida
2. Ignora aeroportos de conexao
3. Ignora aeroporto de partida se match com `userHomeLocation`
4. Gera gap apenas: aeroporto final → primeira hospedagem (se nao coberto)
5. Gera gap apenas: ultima hospedagem → aeroporto de partida de volta (se nao e casa do usuario)

**Passagem do `userHomeLocation`:**

```typescript
// Dashboard.tsx - ao calcular gaps
const transportCoverageGaps = useMemo(() => {
  return calculateTransportCoverageGaps(
    staysModule.data, transportsModule.data, flightsModule.data,
    profile?.cidade_origem ?? null  // novo parametro
  );
}, [flightsModule.data, staysModule.data, transportsModule.data, profile]);
```

**Prompt atualizado do `generate-tips`:**

Adicionar ao prompt regra de transporte contextual:
```text
REGRA DE TRANSPORTE:
- Em cidades europeias, Tokyo, NYC, Chicago, Toronto, Buenos Aires: SEMPRE priorize transporte publico. 
  Descreva linhas de metro/trem/onibus especificas do aeroporto ate o hotel.
- Em cidades como Miami, Los Angeles, Las Vegas, Orlando, cidades pequenas: sugira locacao de veiculo 
  ou Uber/taxi com estimativa de custo e tempo.
- SEMPRE inclua link Google Maps: https://www.google.com/maps/dir/AEROPORTO/ENDERECO+DO+HOTEL
- Se o usuario tem cidade de origem informada, contextualize: "Saindo de Sao Paulo (GRU), voce 
  chegara em CDG. De la..."
```

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| Migration SQL | Adicionar `cidade_origem` em `profiles` |
| `src/services/tripInsights.ts` | Detectar conexoes, aceitar `userHomeLocation`, suprimir gaps falsos |
| `src/pages/Dashboard.tsx` | Passar `cidade_origem` do perfil ao calcular gaps; campo de edicao no perfil |
| `supabase/functions/generate-tips/index.ts` | Aceitar `userHomeCity` no input, regras de transporte contextual no prompt |
| `src/services/ai.ts` | Adicionar `userHomeCity` ao `StayTipsInput` |

### Resultado esperado

Com o usuario morando em Sao Paulo e voos GRU>JFK>AMS>CDG + hospedagem em 21 Bis Rue de Paris, Clichy:

**Antes (3 gaps falsos):**
- "A definir → GRU" 
- "A definir → AMS"
- "21 Bis Rue de Paris → A definir"

**Depois (1 gap real e util):**
- "CDG (Paris) → 21 Bis Rue de Paris, Clichy: Considere RER B ate Gare du Nord + Metro linha 13 ate Mairie de Clichy (~1h, 11 EUR). Uber ~35-45 EUR, 40min."

