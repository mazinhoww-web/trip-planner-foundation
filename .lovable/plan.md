

## Plano: Rotas aereas no mapa + Tarefas inteligentes + Roteiro diario

### 1. Mapa: Linhas retas para voos (em vez de rotas terrestres)

**Problema**: O mapa usa `fetchRoutePolyline` (OSRM driving route) para TODOS os segmentos, incluindo voos. Um voo GRU>CDG aparece como uma rota terrestre impossivel.

**Solucao**: No `TripOpenMap.tsx`, para segmentos do tipo `voo`, usar linha reta (great circle) entre os 2 pontos em vez de chamar OSRM.

**Arquivo: `src/components/map/TripOpenMap.tsx`**
- Na secao de voos (linhas 245-276), substituir `fetchRoutePolyline` por uma funcao `greatCircleLine(origin, destination, numPoints)` que gera pontos intermediarios ao longo de um arco
- A funcao calcula pontos interpolados entre lat/lon de origem e destino (10-20 pontos) para criar uma curva suave
- Manter o estilo tracejado (`dashArray: '8 6'`) e cor amarela para diferenciar de rotas terrestres
- Para segmentos de `roteiro` entre hospedagens, tambem usar linha reta (pois sao apenas indicativos de deslocamento entre cidades, nao necessariamente por estrada)

```text
function greatCircleLine(from: {lat:number,lon:number}, to: {lat:number,lon:number}, steps=20): [number,number][] {
  // Interpolacao linear (suficiente para visualizacao no mapa)
  const points: [number,number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push([
      from.lat + (to.lat - from.lat) * t,
      from.lon + (to.lon - from.lon) * t,
    ]);
  }
  return points;
}
```

- Remover chamadas `fetchRoutePolyline` para voos
- Manter `fetchRoutePolyline` apenas para transportes terrestres (trem, onibus, carro)

---

### 2. Geracao automatica de tarefas com IA

**Problema**: As tarefas sao 100% manuais. O usuario precisa pensar em tudo: visto, passaporte, roupas, seguro, etc.

**Solucao**: Criar edge function `generate-tasks` que analisa o contexto da viagem e gera uma lista categorizada de tarefas.

**Nova edge function: `supabase/functions/generate-tasks/index.ts`**

Input:
```json
{
  "destination": "Paris, Franca",
  "startDate": "2026-01-15",
  "endDate": "2026-01-25",
  "userNationality": "brasileira",
  "userHomeCity": "Sao Paulo",
  "flights": [{"origem":"GRU","destino":"CDG"}],
  "stays": [{"localizacao":"Paris","check_in":"2026-01-15"}],
  "existingTasks": ["Comprar seguro viagem"]
}
```

Prompt da IA (usando Lovable AI / Gemini):
- Analisa destino + datas + nacionalidade
- Gera tarefas em categorias: Documentos/Legal, Bagagem/Roupas, Transporte, Seguro, Saude, Financeiro, Tecnologia, Outros
- Para Paris em janeiro: roupas de frio, adaptador de tomada europeu, seguro viagem Schengen obrigatorio
- Para EUA: visto B1/B2, ESTA, seguro viagem
- NAO duplica tarefas que ja existem
- Retorna array de `{titulo, categoria, prioridade}`

**Arquivo: `src/services/ai.ts`**
- Adicionar funcao `generateTripTasks(input)` que chama a edge function

**Arquivo: `src/pages/Dashboard.tsx`**
- Na tab "Tarefas", adicionar botao "Gerar tarefas com IA"
- Ao clicar, envia contexto da viagem (destino, datas, nacionalidade do perfil, voos cadastrados, tarefas existentes)
- Recebe lista e insere no banco via `tasksModule.create` em batch
- Toast de sucesso: "X tarefas geradas por IA"

**Migration SQL**: Nenhuma (usa a tabela `tarefas` existente com campos `titulo`, `categoria`, `prioridade`)

---

### 3. Roteiro diario com IA (MVP)

**Problema**: Nao existe secao de roteiro. O usuario ve dicas soltas por hospedagem mas nao tem uma visao dia-a-dia.

**Solucao**: Criar uma nova tab "Roteiro" no dashboard com itinerario dia-a-dia gerado por IA.

**Nova tabela: `roteiro_dias`**
```sql
CREATE TABLE public.roteiro_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id uuid NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  dia date NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  titulo text NOT NULL,
  descricao text,
  horario_sugerido text,
  categoria text, -- 'atracoes', 'restaurante', 'transporte', 'livre'
  localizacao text,
  link_maps text,
  sugerido_por_ia boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.roteiro_dias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own roteiro" ON public.roteiro_dias
  FOR ALL USING (user_id = auth.uid());
```

**Nova edge function: `supabase/functions/generate-itinerary/index.ts`**

Input: destino, datas, hospedagens (com dicas ja geradas), voos, atracoes ja conhecidas
Output: Array de atividades por dia com horarios sugeridos, nomes reais de atracoes, links Google Maps

Prompt:
- Usa as dicas ja geradas (`atracoes_proximas`, `restaurantes_proximos`) como base
- Adiciona atracoes "imperdíveis" que podem estar mais longe (Torre Eiffel, Cristo Redentor, etc)
- Organiza por dia com horarios logicos (manha, tarde, noite)
- Considera tempo de deslocamento entre pontos

**Nova tab no Dashboard: "Roteiro"**
- Lista dias da viagem como cards expansiveis
- Cada dia mostra atividades ordenadas por horario
- Botao "Gerar roteiro com IA" para criar/recria
- Drag and drop basico entre dias (reordenar atividades)
- Botao para adicionar atividade manual
- Sugestoes da IA aparecem como cards com opcao de aceitar/rejeitar

**Arquivo: `src/hooks/useTripModules.ts`**
- Adicionar `useRoteiro = () => useModuleData('roteiro_dias')`

**Arquivo: `src/pages/Dashboard.tsx`**
- Nova tab `{ key: 'roteiro', label: 'Roteiro', icon: CalendarDays }`
- Componente de roteiro com visualizacao dia-a-dia

---

### Arquivos modificados/criados

| Arquivo | Tipo | Alteracao |
|---|---|---|
| `src/components/map/TripOpenMap.tsx` | Modificar | Linha reta para voos, manter OSRM so para transportes terrestres |
| `supabase/functions/generate-tasks/index.ts` | Criar | Edge function para gerar tarefas contextuais |
| `src/services/ai.ts` | Modificar | Adicionar `generateTripTasks()` |
| `src/pages/Dashboard.tsx` | Modificar | Botao "Gerar tarefas IA" + nova tab Roteiro |
| `supabase/functions/generate-itinerary/index.ts` | Criar | Edge function para gerar roteiro dia-a-dia |
| Migration SQL | Criar | Tabela `roteiro_dias` com RLS |
| `src/hooks/useTripModules.ts` | Modificar | Adicionar `useRoteiro` |
| `supabase/config.toml` | Verificar | Garantir que as novas functions estao listadas |

### Sequencia de implementacao

1. Mapa: corrigir linhas de voo (rapido, sem backend)
2. Edge function `generate-tasks` + integracao no Dashboard
3. Migration `roteiro_dias` + edge function `generate-itinerary` + tab Roteiro

### Nota sobre drag and drop

Para o MVP do roteiro, usar reordenacao simples com botoes (mover cima/baixo) em vez de biblioteca de drag-and-drop complexa. Isso mantem o bundle leve e pode evoluir depois para `@dnd-kit` se necessario.

