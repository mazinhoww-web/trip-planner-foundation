import { describe, expect, it } from 'vitest';
import { normalizeTripMembersError } from '@/services/tripMembers';

describe('trip members error normalization', () => {
  it('normalizes missing table errors', () => {
    const message = 'relation "viagem_membros" does not exist';
    expect(normalizeTripMembersError(message)).toContain('Colaboração ainda não ativada');
  });

  it('normalizes missing edge function errors', () => {
    const message = 'Function not found: trip-members';
    expect(normalizeTripMembersError(message)).toContain('edge function trip-members');
  });

  it('returns untouched unknown errors', () => {
    const message = 'Erro desconhecido';
    expect(normalizeTripMembersError(message)).toBe(message);
  });
});
