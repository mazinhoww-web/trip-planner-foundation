

## Levantamento completo de melhorias e novas features

Apos analisar toda a base de codigo -- 3600+ linhas de Dashboard, servicos de IA, pipeline de importacao, insights de viagem, exportacao, entitlements, auth, e estrutura de banco -- segue a lista completa de oportunidades de melhoria e novas funcionalidades:

---

### UX e Interface

**1. Dark mode / tema claro-escuro**
O app usa `next-themes` mas nao tem toggle visivel. Adicionar switch no header/settings para alternar temas.

**2. Responsividade mobile dedicada**
O Dashboard tem 3600 linhas num unico arquivo sem layout mobile otimizado. Criar bottom navigation, cards colapsaveis e swipe entre abas para mobile.

**3. Onboarding / wizard de primeira viagem**
Nao ha guia para novos usuarios. Criar wizard passo-a-passo: "Criar viagem → Adicionar voo → Adicionar hospedagem → Gerar roteiro".

**4. Notificacoes in-app e push**
Sem sistema de notificacoes. Alertas de: voo em 24h, check-in amanha, tarefa pendente, convite recebido.

**5. Drag-and-drop no roteiro**
Os itens do roteiro sao estaticos. Permitir reordenar atividades do dia arrastando, atualizando `ordem` automaticamente.

**6. Timeline visual do roteiro**
Substituir lista simples por timeline vertical com horarios, icones por categoria e conectores visuais entre atividades.

**7. Skeleton loading states**
O app usa spinner generico. Adicionar skeletons especificos por secao (cards de voo, lista de tarefas, etc).

**8. Desmembrar Dashboard.tsx**
Arquivo monolitico de 3600 linhas. Extrair cada aba em componente proprio (`FlightsTab`, `StaysTab`, `ItineraryTab`, etc).

---

### Funcionalidades de viagem

**9. Countdown / contagem regressiva**
Mostrar "Faltam X dias para sua viagem" no hero do dashboard baseado em `data_inicio`.

**10. Checklist pre-viagem inteligente**
A IA ja gera tarefas, mas nao ha checklist contextual (passaporte valido? visto necessario? vacinas?). Gerar checklist baseada no destino.

**11. Compartilhamento publico do roteiro**
Existe `public-trip-api` mas sem pagina publica renderizada. Criar `/trip/:id/public` com roteiro visual somente-leitura.

**12. Clonagem de viagem**
Permitir duplicar uma viagem existente como template para nova viagem, copiando todos os dados.

**13. Notas / diario de viagem**
Nova tabela `notas` para registrar experiencias, fotos e memorias durante a viagem.

**14. Clima / previsao do tempo**
Integrar API de clima para mostrar previsao nos dias do roteiro, baseado na localizacao da hospedagem.

**15. Conversao de moedas em tempo real**
O app registra `moeda` nas despesas mas nao converte. Mostrar total unificado em moeda base do usuario.

---

### IA e Automacao

**16. Chat com IA sobre a viagem**
Permitir perguntas livres: "Preciso de visto para o Japao?", "Qual melhor epoca para ir?". Usar contexto da viagem.

**17. Sugestao automatica de atividades por dia**
Ao adicionar hospedagem nova, sugerir automaticamente atracoes e restaurantes proximos para os dias de estadia.

**18. Deteccao de conflitos de horario**
Analisar voos, transportes e atividades para alertar sobreposicoes (ex: atividade as 14h mas voo as 15h).

**19. Resumo diario por IA**
Gerar briefing matinal: "Hoje voce tem check-out as 11h, almoco reservado as 13h, voo as 18h".

**20. OCR de recibos para despesas**
Reaproveitar pipeline de OCR para extrair valor, data e descricao de fotos de recibos e criar despesas automaticamente.

---

### Colaboracao e Social

**21. Chat entre membros da viagem**
Canal de mensagens em tempo real entre membros da viagem usando Realtime.

**22. Votacao de atividades**
Membros podem votar em atividades propostas (restaurante A vs B, passeio X vs Y).

**23. Divisao de despesas (split)**
Calcular quanto cada viajante deve, com saldo de quem deve a quem (estilo Splitwise).

**24. Roles granulares (viewer/editor/admin)**
Ja existe `role` na tabela `viagem_membros` mas sem enforcement no frontend. Aplicar restricoes reais.

---

### Exportacao e Integracao

**25. Exportar para Google Calendar**
Gerar arquivo `.ics` com voos, check-ins e atividades do roteiro para importar no calendario.

**26. Exportar PDF completo e estilizado**
O PDF atual e basico (HTML + print). Gerar PDF real com logo, cores, mapas e layout profissional.

**27. Integrar com Google Flights / Booking**
Links diretos para buscar voos e hoteis com destino/datas pre-preenchidas.

**28. Webhook para automacoes externas**
Ja existe `trip-webhook-dispatch`. Expor configuracao no UI para o usuario cadastrar URLs de webhook.

---

### Performance e Qualidade

**29. Paginacao e busca em listas**
Todas as listas carregam tudo de uma vez. Adicionar paginacao, filtros e busca textual.

**30. Testes E2E automatizados**
Existem testes unitarios mas nenhum E2E. Adicionar Playwright/Cypress para fluxos criticos.

**31. PWA / instalacao como app**
Adicionar manifest.json e service worker para funcionar offline e ser instalavel no celular.

**32. Cache offline de dados da viagem**
Salvar dados localmente para consulta sem internet (modo aviao).

**33. Lazy loading de abas do dashboard**
Carregar dados apenas quando a aba e acessada, nao tudo no mount inicial.

---

### Monetizacao e Admin

**34. Painel de admin / metricas**
Dashboard interno com: usuarios ativos, viagens criadas, uso de IA, conversoes free→pro.

**35. Stripe checkout para planos**
O sistema de entitlements existe mas sem pagamento. Integrar Stripe para upgrade de plano.

**36. Limites visuais por plano**
Mostrar "Funcionalidade Pro" com badge e CTA de upgrade quando usuario free tenta acessar feature premium.

---

### Detalhes tecnicos

- Todas as features de banco usam tabelas existentes ou novas tabelas simples com RLS por `user_id`
- Features de IA usam Lovable AI (Gemini/GPT) sem necessidade de API key externa
- Realtime ja suportado pela infraestrutura atual
- O desmembramento do Dashboard e pre-requisito para varias features acima

