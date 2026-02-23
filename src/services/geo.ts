export type GeoPoint = {
  lat: number;
  lon: number;
  label: string;
};

type GeocodeApiEntry = {
  lat: string;
  lon: string;
  display_name?: string;
};

const GEO_PREFIX = 'tripplanner_geo_v1:';
const geocodeCache = new Map<string, GeoPoint | null>();
const geocodePending = new Map<string, Promise<GeoPoint | null>>();
const routeCache = new Map<string, [number, number][]>();
const routePending = new Map<string, Promise<[number, number][]>>();

function normalizeLocation(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function localStorageKey(query: string) {
  return `${GEO_PREFIX}${normalizeLocation(query)}`;
}

function getCachedFromStorage(query: string): GeoPoint | null | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = localStorage.getItem(localStorageKey(query));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as GeoPoint;
    if (!parsed || Number.isNaN(parsed.lat) || Number.isNaN(parsed.lon)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function setCachedInStorage(query: string, point: GeoPoint) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(localStorageKey(query), JSON.stringify(point));
  } catch {
    // localStorage pode falhar em navegadores privados; cache em memória já cobre.
  }
}

export function normalizeTextForMatch(value: string | null | undefined) {
  if (!value) return '';
  return normalizeLocation(value);
}

function extractIataCode(value: string): string | null {
  const match = value.match(/\(([A-Z]{3})\)/i);
  return match ? match[1].toUpperCase() : null;
}

export function locationsMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeTextForMatch(a);
  const right = normalizeTextForMatch(b);
  if (!left || !right) return false;
  if (left.includes(right) || right.includes(left)) return true;

  // IATA code comparison (e.g. "CDG (Paris)" vs "Paris, Aeroport Charles de Gaulle (CDG)")
  const iataA = extractIataCode(a ?? '');
  const iataB = extractIataCode(b ?? '');
  if (iataA && iataB && iataA === iataB) return true;

  return false;
}

export async function geocodeLocation(query: string): Promise<GeoPoint | null> {
  const normalized = normalizeLocation(query);
  if (!normalized || normalized.length < 3) return null;

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized) ?? null;
  }

  if (geocodePending.has(normalized)) {
    return geocodePending.get(normalized) ?? Promise.resolve(null);
  }

  const fromStorage = getCachedFromStorage(query);
  if (fromStorage !== undefined) {
    geocodeCache.set(normalized, fromStorage);
    return fromStorage;
  }

  const promise = (async () => {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '0');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept-Language': 'pt-BR,pt,en',
        },
      });

      if (!response.ok) {
        geocodeCache.set(normalized, null);
        return null;
      }

      const data = (await response.json()) as GeocodeApiEntry[];
      const first = data?.[0];
      if (!first) {
        geocodeCache.set(normalized, null);
        return null;
      }

      const point: GeoPoint = {
        lat: Number(first.lat),
        lon: Number(first.lon),
        label: first.display_name || query,
      };

      if (Number.isNaN(point.lat) || Number.isNaN(point.lon)) {
        geocodeCache.set(normalized, null);
        return null;
      }

      geocodeCache.set(normalized, point);
      setCachedInStorage(query, point);
      return point;
    } catch {
      geocodeCache.set(normalized, null);
      return null;
    } finally {
      geocodePending.delete(normalized);
    }
  })();

  geocodePending.set(normalized, promise);
  return promise;
}

function routeKey(origin: GeoPoint, destination: GeoPoint) {
  return `${origin.lon.toFixed(5)},${origin.lat.toFixed(5)}|${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`;
}

export async function fetchRoutePolyline(origin: GeoPoint, destination: GeoPoint): Promise<[number, number][]> {
  const key = routeKey(origin, destination);

  if (routeCache.has(key)) {
    return routeCache.get(key) ?? [];
  }

  if (routePending.has(key)) {
    return routePending.get(key) ?? Promise.resolve([]);
  }

  const fallback: [number, number][] = [
    [origin.lat, origin.lon],
    [destination.lat, destination.lon],
  ];

  const promise = (async () => {
    try {
      const url = new URL(
        `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}`,
      );
      url.searchParams.set('overview', 'full');
      url.searchParams.set('geometries', 'geojson');

      const response = await fetch(url.toString());
      if (!response.ok) {
        routeCache.set(key, fallback);
        return fallback;
      }

      const json = await response.json() as {
        routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
      };
      const coords = json?.routes?.[0]?.geometry?.coordinates ?? [];

      if (!coords.length) {
        routeCache.set(key, fallback);
        return fallback;
      }

      const polyline: [number, number][] = coords
        .map(([lon, lat]) => [lat, lon] as [number, number])
        .filter(([lat, lon]) => !Number.isNaN(lat) && !Number.isNaN(lon));

      const normalized = polyline.length > 1 ? polyline : fallback;
      routeCache.set(key, normalized);
      return normalized;
    } catch {
      routeCache.set(key, fallback);
      return fallback;
    } finally {
      routePending.delete(key);
    }
  })();

  routePending.set(key, promise);
  return promise;
}
