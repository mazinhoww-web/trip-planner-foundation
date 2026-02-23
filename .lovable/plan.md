
## Plano: Corrigir mapa de viagem, gaps duplicados e sugestoes de transporte

### Problemas identificados

**1. Gaps duplicados e falsos (screenshot)**

O banco tem 2 voos para CDG com nomes diferentes:
- Voo 1: "GRU (Sao Paulo)" -> "CDG (Paris)"
- Voo 2: "Amsterdam, Schiphol Airport (AMS)" -> "Paris, Aeroport Charles de Gaulle (CDG)"

A funcao `locationsMatch` faz substring match, mas "CDG (Paris)" NAO e substring de "Paris, Aeroport Charles de Gaulle (CDG)" e vice-versa. Resultado: o sistema trata como 2 aeroportos diferentes e gera 2 gaps identicos para o mesmo trecho (CDG -> hotel).

Alem disso, `cidade_origem` e NULL no perfil de todos os usuarios, entao o gap "hotel -> GRU (Sao Paulo)" nao e suprimido porque `userHomeCity` e null.

**2. Mapa mostra rota errada**

O mapa ja usa `greatCircleLine` para voos (correto), mas como o voo 1 vai direto GRU->CDG (a importacao colapsou as conexoes), o mapa so mostra uma linha reta SP->Paris. As escalas JFK e AMS nao aparecem porque nao existem como voos separados no banco.

**3. Faltam sugestoes de transporte nos gaps**

Os gaps dizem apenas "sem cobertura registrada" sem sugerir como resolver (metro, uber, aluguel de carro).

### Solucao

#### 1. Melhorar `locationsMatch` com deteccao de codigo IATA

**Arquivo: `src/services/geo.ts`**

Adicionar funcao que extrai codigos IATA (3 letras maiusculas entre parenteses) e compara:

```typescript
function extractIataCode(value: string): string | null {
  // Matches patterns like "(CDG)", "(GRU)", "(AMS)"
  const match = value.match(/\(([A-Z]{3})\)/i);
  return match ? match[1].toUpperCase() : null;
}

export function locationsMatch(a, b) {
  // Existing substring logic...
  if (left.includes(right) || right.includes(left)) return true;
  
  // IATA code comparison
  const iataA = extractIataCode(a);
  const iataB = extractIataCode(b);
  if (iataA && iataB && iataA === iataB) return true;
  
  return false;
}
```

Isso resolve: "CDG (Paris)" e "Paris, Aeroport Charles de Gaulle (CDG)" ambos tem IATA "CDG" -> match!

#### 2. Auto-detectar cidade de origem quando `cidade_origem` e null

**Arquivo: `src/pages/Dashboard.tsx`**

Se `cidade_origem` e null no perfil, inferir a partir da origem do primeiro voo:

```typescript
const inferredHomeCity = useMemo(() => {
  if (userHomeCity) return userHomeCity;
  // Infer from first flight origin
  const firstFlight = flightsModule.data
    .filter(f => f.status !== 'cancelado' && f.origem)
    .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''))[0];
  return firstFlight?.origem ?? null;
}, [userHomeCity, flightsModule.data]);
```

Usar `inferredHomeCity` em vez de `userHomeCity` no calculo de gaps. Assim, se o primeiro voo sai de "GRU (Sao Paulo)", o sistema sabe que GRU e a casa do usuario e suprime gaps de/para GRU.

#### 3. Adicionar sugestoes contextuais nas mensagens de gap

**Arquivo: `src/services/tripInsights.ts`**

Enriquecer o campo `reason` dos gaps de transporte com sugestoes baseadas na cidade:

```typescript
function getTransportSuggestion(from: string, to: string): string {
  const normalized = normalizeTextForMatch(to) + ' ' + normalizeTextForMatch(from);
  
  const publicTransitCities = ['paris', 'london', 'roma', 'barcelona', 'berlin', 
    'amsterdam', 'tokyo', 'new york', 'nyc', 'chicago', 'toronto'];
  const carCities = ['miami', 'los angeles', 'las vegas', 'orlando', 'houston'];
  
  const isPublicTransit = publicTransitCities.some(c => normalized.includes(c));
  const isCar = carCities.some(c => normalized.includes(c));
  
  if (isPublicTransit) return 'Considere transporte publico (metro/trem). Veja rotas em Google Maps ou Citymapper.';
  if (isCar) return 'Considere alugar um veiculo ou usar Uber/taxi. Transporte publico limitado nesta regiao.';
  return 'Verifique opcoes de transporte no Google Maps.';
}
```

E adicionar ao `reason`:
```
"Sem transporte registrado do aeroporto ate a hospedagem. Considere transporte publico (metro/trem)..."
```

#### 4. Adicionar link de sugestao nos gaps exibidos

**Arquivo: `src/pages/Dashboard.tsx`**

Nas `transportGapLines`, incluir link Google Maps com rota:

```typescript
const transportGapLines = useMemo(() => {
  return transportCoverageGaps.slice(0, 5).map((gap) => ({
    key: `transport-gap-${gap.from}-${gap.to}`,
    text: `Transporte: ${gap.from} → ${gap.to} — ${gap.reason}`,
  }));
}, [transportCoverageGaps]);
```

#### 5. Corrigir deduplicacao no `buildFlightChains`

**Arquivo: `src/services/tripInsights.ts`**

Com o `locationsMatch` corrigido (IATA matching), os voos GRU->CDG e AMS->CDG serao reconhecidos como tendo o mesmo destino CDG. Mas ainda ha o problema de que ambos geram gap CDG->hotel. O `pushUniqueGap` ja deveria deduplicar, mas precisa usar `locationsMatch` em vez de comparacao exata.

A funcao `pushUniqueGap` ja usa `locationsMatch` (linha 157-160), entao com o fix do IATA code, a deduplicacao funcionara automaticamente.

### Arquivos modificados

| Arquivo | Alteracao |
|---|---|
| `src/services/geo.ts` | Adicionar `extractIataCode`, melhorar `locationsMatch` com comparacao IATA |
| `src/services/tripInsights.ts` | Adicionar `getTransportSuggestion`, enriquecer `reason` dos gaps |
| `src/pages/Dashboard.tsx` | Inferir `userHomeCity` do primeiro voo quando perfil nao tem `cidade_origem`; melhorar display dos gaps |
| `src/components/dashboard/TripCoverageAlert.tsx` | Opcional: links clicaveis para Google Maps nas sugestoes de gap |

### Resultado esperado

**Antes (3 gaps falsos/duplicados):**
- "CDG (Paris) -> 21 Bis Rue de Paris..." 
- "Paris, Aeroport Charles de Gaulle (CDG) -> 21 Bis Rue de Paris..." (duplicata)
- "21 Bis Rue de Paris -> GRU (Sao Paulo)" (deveria ser suprimido)

**Depois (1 gap real com sugestao):**
- "CDG -> 21 Bis Rue de Paris, Clichy: Sem transporte registrado. Considere transporte publico (metro/trem). Veja rotas em Google Maps ou Citymapper."

O gap hotel->GRU e suprimido porque GRU e inferido como aeroporto de casa (origem do primeiro voo).

### Nota sobre o mapa

O mapa mostra o que esta no banco: se so existem 2 voos (GRU->CDG e AMS->CDG), so pode desenhar 2 arcos. Os trechos JFK e AMS intermediarios nao aparecem porque a importacao colapsou a passagem em 2 registros. Isso e uma limitacao da importacao, nao do mapa. O mapa em si esta correto: usa `greatCircleLine` para voos (linhas retas/arcos) e OSRM apenas para transportes terrestres.
