# Feature Rollout Playbook (Sprint 7)

## Objetivo
Ativar e desativar recursos monetizaveis por coorte sem novo deploy.

## Secrets usados nas Edge Functions
- `ENTITLEMENTS_SELF_SERVICE` (`true|false`)
- `ENTITLEMENTS_ROLLOUT_PERCENT` (0-100)
- `ENTITLEMENTS_ROLLOUT_FEATURES` (lista separada por virgula)

Exemplo:

```bash
ENTITLEMENTS_ROLLOUT_PERCENT=10
ENTITLEMENTS_ROLLOUT_FEATURES=ff_export_pdf,ff_ai_priority_inference
```

## Fluxo de rollout recomendado
1. Confirmar migration de entitlements aplicada.
2. Validar `feature-entitlements` com `action=get_context`.
3. Ativar coorte pequena (5-10%).
4. Monitorar por 24h:
   - erros 4xx/5xx nas functions de IA
   - `usageSummary.totalEvents`
   - distribuicao por cluster (M1-M4)
5. Expandir para 25%, 50%, 100%.

## Rollback imediato (sem deploy)
1. Ajustar secret:
   - `ENTITLEMENTS_ROLLOUT_PERCENT=0`
   - limpar `ENTITLEMENTS_ROLLOUT_FEATURES`
2. Re-deploy das Edge Functions para aplicar novo env.
3. Validar `get_context` e confirmar `rolloutCohort=false`.

## Rollback por feature
1. Manter coorte ativa.
2. Remover a feature da lista `ENTITLEMENTS_ROLLOUT_FEATURES`.
3. Re-deploy e validar no painel "Central de configuracoes".

## Diagnostico rapido
- `trip-members`: erro de assentos ou papel editor -> revisar flags M1.
- `extract-reservation`/`ocr-document`/`generate-tips`/`suggest-restaurants`: bloqueios -> revisar flags M2.
- painel de configuracoes sem metricas -> validar `feature_usage_events` e `usage_summary`.
