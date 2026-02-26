import { describe, expect, it } from 'vitest';
import { normalizeTripMembersError } from '@/hooks/useTripMembers';

describe('useTripMembers helpers', () => {
  it('maps missing schema errors to actionable setup reason', () => {
    const result = normalizeTripMembersError('ERROR: relation "viagem_membros" does not exist');
    expect(result.setupReason).toBe('missing_schema');
    expect(result.message).toContain('migrations pendentes');
  });

  it('maps missing function errors to actionable setup reason', () => {
    const result = normalizeTripMembersError('Function trip-members not active');
    expect(result.setupReason).toBe('missing_function');
    expect(result.message).toContain('não está publicada');
  });

  it('preserves regular messages when no setup issue is detected', () => {
    const result = normalizeTripMembersError('Falha de rede temporária');
    expect(result.setupReason).toBeNull();
    expect(result.message).toBe('Falha de rede temporária');
  });
});
