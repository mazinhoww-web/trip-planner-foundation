

# Plano completo de otimização mobile

## Problemas identificados (baseado nas screenshots e código)

1. **Header (DashboardShell)**: No mobile, logo + título + botões (ThemeToggle, Alertas, Sair) competem por espaço numa única linha. O trip selector empurra tudo para baixo sem organização.
2. **Sidebar lateral (aside 220px)**: Escondida no mobile (`hidden xl:block`), mas não há navegação alternativa — o `DashboardTabsNav` horizontal existe mas exige scroll e ocupa muito espaço vertical.
3. **TripStatsGrid**: 5 colunas (`lg:grid-cols-5`) colapsa para 2 no mobile, mas os cards são pequenos demais com textos cortados.
4. **OverviewTabPanel**: Layout `lg:grid-cols-3` empilha no mobile, mas os cards ficam muito longos sem priorização. O mapa ocupa 320px fixos.
5. **Flight/Stay cards**: Layout `sm:flex-row` funciona, mas os botões de ação (Ver rota, Google Flights, Edit, Delete) se empilham desorganizados.
6. **Dialogs de formulário**: `max-h-[90vh]` já existe, mas `w-[calc(100vw-1rem)]` precisa de padding interno adequado.
7. **TripHero**: Min-height 180px no mobile funciona, mas o texto pode ficar truncado em telas pequenas.
8. **TripTopActions**: Botões são full-width no mobile, o que é bom, mas o container tem padding excessivo.
9. **Body background gradients**: Não há viewport meta issues, mas o `App.css` tem `max-width: 1280px` e `padding: 2rem` no `#root` que pode causar problemas.
10. **Falta de bottom navigation mobile**: Não existe navegação fixa inferior para acesso rápido aos módulos.

## Etapas de implementação

### 1. Corrigir `#root` styling em `App.css`
- Remover `max-width`, `padding` e `text-align: center` do `#root` que conflita com o layout full-width do dashboard.

### 2. Header mobile responsivo (DashboardShell)
- Reorganizar header em 2 linhas no mobile: logo + hamburger na primeira, ações na segunda.
- Adicionar bottom sheet/drawer de navegação para mobile usando o componente Sheet.
- Mover o trip selector para dentro do drawer no mobile.
- Compactar botões: usar icon-only para ThemeToggle, Alertas e Sair em `< sm`.

### 3. Criar bottom navigation bar mobile
- Criar `MobileBottomNav` fixo na parte inferior com os 5 módulos mais usados (Dashboard, Voos, Hospedagens, Transportes, Tarefas).
- Botão "Mais" que abre o drawer com todos os módulos.
- Visível apenas em `< xl` (quando a sidebar lateral está escondida).

### 4. Otimizar TripStatsGrid para mobile
- Usar `grid-cols-2` com scroll horizontal para os 10 cards ou limitar a 4 cards visíveis com "ver mais".
- Reduzir padding interno dos stat cards no mobile.

### 5. Otimizar OverviewTabPanel para mobile
- Reordenar cards: Countdown e Resumo diário primeiro (mais relevantes no dia a dia).
- Reduzir altura do mapa para `200px` no mobile.
- Colapsar "Checklist inteligente" em accordion no mobile.

### 6. Otimizar cards de reservas (Flights, Stays, Transports)
- Empilhar ações em um dropdown menu no mobile em vez de mostrar todos os botões inline.
- Usar swipe-to-action pattern ou menu contextual nos cards de lista.

### 7. Melhorar formulários nos dialogs
- Usar `DialogContent` com `className="sm:max-w-2xl"` (já existe) mas adicionar padding bottom para o teclado virtual.
- Inputs em coluna única no mobile (já parcialmente implementado com `sm:grid-cols-2`).

### 8. Touch-friendly improvements gerais
- Aumentar target areas mínimos para 44px em todos os botões interativos.
- Adicionar `scroll-padding-bottom` para quando o bottom nav estiver visível.
- Safe area insets para dispositivos com notch/dynamic island.

### 9. Viewport e meta tags
- Adicionar `viewport-fit=cover` no meta viewport.
- CSS `env(safe-area-inset-*)` para padding seguro.

## Detalhes técnicos

```text
Arquivos a criar:
  src/components/dashboard/MobileBottomNav.tsx   (nav inferior fixa)
  src/components/dashboard/MobileNavDrawer.tsx   (drawer com todos os módulos)

Arquivos a editar:
  src/App.css                    (remover estilos #root conflitantes)
  index.html                     (viewport-fit=cover)
  src/index.css                  (safe-area, scroll-padding, touch targets)
  src/components/dashboard/DashboardShell.tsx    (header compacto + bottom nav)
  src/components/dashboard/OverviewTabPanel.tsx  (reorder cards, mapa menor)
  src/components/dashboard/TripStatsGrid.tsx     (scroll horizontal mobile)
  src/components/dashboard/FlightsTabPanel.tsx   (dropdown ações mobile)
  src/components/dashboard/StaysTabPanel.tsx     (dropdown ações mobile)
  src/components/dashboard/TransportsTabPanel.tsx (dropdown ações mobile)
  src/components/dashboard/DashboardTabsNav.tsx  (ocultar em mobile quando bottom nav ativo)
```

Estimativa: ~10 arquivos editados, 2 arquivos novos. Nenhuma mudança de banco de dados.

