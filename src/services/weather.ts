type GeocodingResponse = {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }>;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
};

export type WeatherSummary = {
  locationLabel: string;
  currentTempC: number | null;
  currentCondition: string;
  currentWindKmh: number | null;
  tripDate: string | null;
  tripTempMinC: number | null;
  tripTempMaxC: number | null;
  tripCondition: string | null;
  source: 'open-meteo';
};

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Céu limpo',
  1: 'Poucas nuvens',
  2: 'Parcialmente nublado',
  3: 'Nublado',
  45: 'Neblina',
  48: 'Neblina com geada',
  51: 'Garoa fraca',
  53: 'Garoa moderada',
  55: 'Garoa intensa',
  61: 'Chuva fraca',
  63: 'Chuva moderada',
  65: 'Chuva forte',
  66: 'Chuva congelante fraca',
  67: 'Chuva congelante forte',
  71: 'Neve fraca',
  73: 'Neve moderada',
  75: 'Neve forte',
  77: 'Granizo',
  80: 'Pancadas fracas',
  81: 'Pancadas moderadas',
  82: 'Pancadas fortes',
  85: 'Neve fraca',
  86: 'Neve forte',
  95: 'Trovoadas',
  96: 'Trovoadas com granizo',
  99: 'Trovoadas severas',
};

function labelFromWeatherCode(code: number | null | undefined) {
  if (typeof code !== 'number') return 'Condição indisponível';
  return WEATHER_CODE_LABELS[code] ?? 'Condição indisponível';
}

function normalizeIsoDate(value: string | null | undefined) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export async function fetchDestinationWeather(destination: string, tripStartDate?: string | null): Promise<WeatherSummary | null> {
  const target = destination.trim();
  if (!target) return null;

  const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  geocodeUrl.searchParams.set('name', target);
  geocodeUrl.searchParams.set('count', '1');
  geocodeUrl.searchParams.set('language', 'pt');
  geocodeUrl.searchParams.set('format', 'json');

  const geocodeResponse = await fetch(geocodeUrl.toString());
  if (!geocodeResponse.ok) return null;

  const geocode = (await geocodeResponse.json()) as GeocodingResponse;
  const first = geocode.results?.[0];
  if (!first || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') {
    return null;
  }

  const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
  forecastUrl.searchParams.set('latitude', String(first.latitude));
  forecastUrl.searchParams.set('longitude', String(first.longitude));
  forecastUrl.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
  forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  forecastUrl.searchParams.set('timezone', 'auto');
  forecastUrl.searchParams.set('forecast_days', '16');

  const forecastResponse = await fetch(forecastUrl.toString());
  if (!forecastResponse.ok) return null;

  const forecast = (await forecastResponse.json()) as ForecastResponse;
  const normalizedDate = normalizeIsoDate(tripStartDate ?? null);
  const dayIndex = normalizedDate
    ? forecast.daily?.time?.findIndex((day) => day === normalizedDate) ?? -1
    : -1;

  const tripIndex = dayIndex >= 0 ? dayIndex : 0;
  const tripDate = forecast.daily?.time?.[tripIndex] ?? null;
  const tripCode = forecast.daily?.weather_code?.[tripIndex];
  const tripMin = forecast.daily?.temperature_2m_min?.[tripIndex];
  const tripMax = forecast.daily?.temperature_2m_max?.[tripIndex];

  const locationLabel = [first.name, first.admin1, first.country].filter(Boolean).join(', ');

  return {
    locationLabel: locationLabel || target,
    currentTempC: typeof forecast.current?.temperature_2m === 'number' ? forecast.current.temperature_2m : null,
    currentCondition: labelFromWeatherCode(forecast.current?.weather_code),
    currentWindKmh: typeof forecast.current?.wind_speed_10m === 'number' ? forecast.current.wind_speed_10m : null,
    tripDate,
    tripTempMinC: typeof tripMin === 'number' ? tripMin : null,
    tripTempMaxC: typeof tripMax === 'number' ? tripMax : null,
    tripCondition: typeof tripCode === 'number' ? labelFromWeatherCode(tripCode) : null,
    source: 'open-meteo',
  };
}
