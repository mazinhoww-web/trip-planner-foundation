import { describe, expect, it } from 'vitest';
import { buildEntitlements, resolveSeatLimit } from '@/services/entitlements';

describe('feature gates', () => {
  it('enables M3 and M4 features in team tier', () => {
    const team = buildEntitlements('team');
    expect(team.ff_export_pdf).toBe(true);
    expect(team.ff_export_json_full).toBe(true);
    expect(team.ff_public_api_access).toBe(true);
    expect(team.ff_webhooks_enabled).toBe(true);
  });

  it('keeps M3 disabled by default in free tier', () => {
    const free = buildEntitlements('free');
    expect(free.ff_export_pdf).toBe(false);
    expect(free.ff_export_json_full).toBe(false);
  });

  it('applies seat limit only when enforcement is enabled', () => {
    const freeNoLimit = resolveSeatLimit('free', { ff_collab_seat_limit_enforced: false });
    expect(Number.isFinite(freeNoLimit.hardLimit)).toBe(false);

    const teamLimited = resolveSeatLimit('team', { ff_collab_seat_limit_enforced: true });
    expect(teamLimited.hardLimit).toBe(20);
  });
});
