# Rollback e Operação (D+0 até D+7)

## 1) Critérios de rollback imediato (P0/P1)
Executar rollback se ocorrer qualquer item abaixo:
- P0 Segurança: vazamento entre usuários (quebra de RLS).
- P0 Auth: login/callback indisponível > 5 minutos.
- P1 Importação: taxa de falha (OCR+IA+save) > 30% por 15 minutos.
- P1 Backend: erro 5xx em functions > 10% por 15 minutos.
- P1 Custo: aumento anômalo de chamadas IA/OCR acima do limite esperado diário.

## 2) Procedimento de rollback
1. Frontend:
   - Reverter para deployment anterior estável no Vercel.
2. Functions:
   - Redeploy da versão anterior das funções críticas (`generate-tips`, `suggest-restaurants`, `ocr-document`, `extract-reservation`).
3. Banco:
   - Se regressão for de policy/migration, aplicar SQL corretivo imediatamente.
4. Comunicação:
   - Abrir incidente interno com `requestId` e janela de impacto.

## 3) Monitoramento inicial (primeiros 7 dias)
## Métricas mínimas por dia
- Auth:
  - falhas de login/callback
  - tempo médio de autenticação
- API/Functions:
  - volume por função
  - taxa de 5xx/4xx
  - `RATE_LIMITED` por usuário
- IA/OCR:
  - sucesso vs fallback
  - latência média
  - custo estimado/token usage
- Persistência:
  - falhas de create/update/delete por módulo
- UX:
  - erros críticos reportados por usuários (desktop/mobile)

## Rotina operacional D+0..D+7
- D+0: monitoramento contínuo (hora a hora nas primeiras 6h).
- D+1 a D+3: revisão 2x por dia.
- D+4 a D+7: revisão diária + fechamento de pendências.

## 4) Limites de custo recomendados
- `generate-tips`: 20 chamadas/usuário/hora.
- `suggest-restaurants`: 18 chamadas/usuário/hora.
- `extract-reservation`: 20 chamadas/usuário/hora.
- `ocr-document`: 10 chamadas/usuário/hora.

Quando exceder padrões esperados:
1. manter rate-limit ativo;
2. priorizar fallback assistido;
3. ajustar limites após análise de uso real.
