import { describe, expect, it, vi } from 'vitest';
import { fetchDestinationWeather } from '@/services/weather';

describe('weather service', () => {
  it('returns normalized weather summary for destination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ name: 'Zurique', admin1: 'Zurique', country: 'Suíça', latitude: 47.37, longitude: 8.54 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 10.4, weather_code: 3, wind_speed_10m: 14.6 },
          daily: {
            time: ['2026-04-01'],
            weather_code: [63],
            temperature_2m_max: [14.5],
            temperature_2m_min: [6.1],
          },
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const summary = await fetchDestinationWeather('Zurique', '2026-04-01');

    expect(summary).not.toBeNull();
    expect(summary?.locationLabel).toContain('Zurique');
    expect(summary?.currentCondition).toBe('Nublado');
    expect(summary?.tripCondition).toBe('Chuva moderada');
    expect(summary?.tripTempMinC).toBe(6.1);
    expect(summary?.tripTempMaxC).toBe(14.5);

    vi.unstubAllGlobals();
  });

  it('returns null when geocoding has no result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }));

    const summary = await fetchDestinationWeather('destino-inexistente');
    expect(summary).toBeNull();

    vi.unstubAllGlobals();
  });
});
