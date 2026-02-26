

## Corrigir erros de build em ImportReservationDialog.tsx

### Problema

Duas chamadas a `trackProductEvent` nas linhas 1192-1201 e 1207-1215 passam `status` como propriedade direta do objeto, mas `ProductEventInput` so aceita `eventName`, `featureKey`, `viagemId` e `metadata`. O campo `status` nao existe no tipo.

### Correcao

Mover `status` para dentro de `metadata` nas duas chamadas:

**Linha 1192-1201** (webhook failed):
```typescript
await trackProductEvent({
  eventName: 'webhook_dispatched',
  featureKey: 'ff_webhooks_enabled',
  viagemId: currentTripId,
  metadata: {
    status: 'failed',
    source: 'import.confirmed',
    error: webhook.error,
  },
});
```

**Linha 1207-1215** (webhook success):
```typescript
await trackProductEvent({
  eventName: 'webhook_dispatched',
  featureKey: 'ff_webhooks_enabled',
  viagemId: currentTripId,
  metadata: {
    status: 'success',
    source: 'import.confirmed',
  },
});
```

### Arquivo afetado

- `src/components/import/ImportReservationDialog.tsx` -- 2 edits pontuais

