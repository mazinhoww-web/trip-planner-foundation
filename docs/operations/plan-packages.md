# Planos comerciais (Free / Pro / Team)

## Objetivo
Padronizar a matriz de recursos monetizaveis por plano para ativacao gradual via feature flags.

## Free
- Colaboracao base: `ff_collab_enabled` = ON
- Editor role: `ff_collab_editor_role` = ON
- Seat enforcement: `ff_collab_seat_limit_enforced` = OFF (limite efetivo aberto)
- IA import base: `ff_ai_import_enabled` = ON
- Recursos premium: OFF

## Pro
- Tudo de Free
- `ff_ai_batch_high_volume` = ON
- `ff_ai_reprocess_unlimited` = ON
- `ff_export_pdf` = ON
- `ff_export_json_full` = ON
- `ff_budget_advanced_insights` = ON

## Team
- Tudo de Pro
- `ff_collab_seat_limit_enforced` = ON
- `ff_collab_audit_log` = ON
- `ff_ai_priority_inference` = ON
- `ff_public_api_access` = ON
- `ff_webhooks_enabled` = ON

## Clusters monetizaveis
- M1: colaboracao
- M2: IA premium
- M3: exportacao e insights
- M4: API e ecossistema

## Regras de rollout
1. Ativar coorte via `ENTITLEMENTS_ROLLOUT_PERCENT`.
2. Ativar features em piloto via `ENTITLEMENTS_ROLLOUT_FEATURES`.
3. Monitorar no painel de configuracoes:
   - eventos por cluster
   - taxa de sucesso IA
   - upgrades/downgrades
