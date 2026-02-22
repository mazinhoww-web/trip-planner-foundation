import { useEffect, useMemo, useRef, useState } from 'react';
import { Tables } from '@/integrations/supabase/types';
import { fetchRoutePolyline, geocodeLocation } from '@/services/geo';

declare global {
  interface Window {
    L?: any;
  }
}

type MarkerKind = 'hospedagem' | 'origem' | 'destino' | 'voo_origem' | 'voo_destino';

type MarkerEntry = {
  kind: MarkerKind;
  label: string;
  lat: number;
  lon: number;
  order?: number;
};

type SegmentEntry = {
  type: 'roteiro' | 'transporte' | 'voo';
  label: string;
  polyline: [number, number][];
};

type OpenMapData = {
  markers: MarkerEntry[];
  segments: SegmentEntry[];
};

type TripOpenMapProps = {
  stays: Tables<'hospedagens'>[];
  transports: Tables<'transportes'>[];
  flights?: Tables<'voos'>[];
  className?: string;
  height?: number;
};

const LEAFLET_CSS_ID = 'tripplanner-leaflet-css';
const LEAFLET_JS_ID = 'tripplanner-leaflet-js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return null;
  if (window.L) return window.L;

  if (!document.getElementById(LEAFLET_CSS_ID)) {
    const link = document.createElement('link');
    link.id = LEAFLET_CSS_ID;
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    document.head.appendChild(link);
  }

  if (document.getElementById(LEAFLET_JS_ID)) {
    return new Promise((resolve, reject) => {
      const poll = () => {
        if (window.L) {
          resolve(window.L);
          return;
        }
        setTimeout(poll, 50);
      };
      setTimeout(poll, 50);
      setTimeout(() => reject(new Error('Leaflet timeout')), 5000);
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = LEAFLET_JS_ID;
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Falha ao carregar Leaflet.'));
    document.body.appendChild(script);
  });
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return '9999-12-31';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '9999-12-31';
  return parsed.toISOString().slice(0, 10);
}

export function TripOpenMap({ stays, transports, flights = [], className, height = 320 }: TripOpenMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<OpenMapData>({ markers: [], segments: [] });

  const hasLocations = useMemo(() => {
    const stayHasLocation = stays.some((stay) => !!stay.localizacao?.trim());
    const transportHasLocation = transports.some((transport) => !!transport.origem?.trim() || !!transport.destino?.trim());
    const flightHasLocation = flights.some((flight) => !!flight.origem?.trim() || !!flight.destino?.trim());
    return stayHasLocation || transportHasLocation || flightHasLocation;
  }, [stays, transports, flights]);

  useEffect(() => {
    let canceled = false;

    async function buildData() {
      if (!hasLocations) {
        setMapData({ markers: [], segments: [] });
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      const locationPool = new Map<string, { lat: number; lon: number; label: string }>();
      const labels = new Set<string>();

      stays.forEach((stay) => {
        if (stay.localizacao?.trim()) labels.add(stay.localizacao.trim());
      });
      transports.forEach((transport) => {
        if (transport.origem?.trim()) labels.add(transport.origem.trim());
        if (transport.destino?.trim()) labels.add(transport.destino.trim());
      });
      flights.forEach((flight) => {
        if (flight.origem?.trim()) labels.add(flight.origem.trim());
        if (flight.destino?.trim()) labels.add(flight.destino.trim());
      });

      const locationList = Array.from(labels);

      for (let i = 0; i < locationList.length; i += 1) {
        const label = locationList[i];
        const point = await geocodeLocation(label);
        if (point) {
          locationPool.set(label, point);
        }
        // Respeita o uso público do Nominatim (evita burst).
        if (i < locationList.length - 1) {
          await sleep(350);
        }
      }

      const markers: MarkerEntry[] = [];
      const segments: SegmentEntry[] = [];
      let stayOrder = 0;

      const orderedStays = [...stays]
        .filter((stay) => !!stay.localizacao)
        .sort((a, b) => normalizeDate(a.check_in).localeCompare(normalizeDate(b.check_in)));

      for (const stay of orderedStays) {
        const location = stay.localizacao?.trim();
        if (!location) continue;
        const point = locationPool.get(location);
        if (!point) continue;
        stayOrder += 1;

        markers.push({
          kind: 'hospedagem',
          label: stay.nome ? `${stay.nome} (${location})` : location,
          lat: point.lat,
          lon: point.lon,
          order: stayOrder,
        });
      }

      for (let i = 0; i < orderedStays.length - 1; i += 1) {
        const current = orderedStays[i].localizacao?.trim();
        const next = orderedStays[i + 1].localizacao?.trim();
        if (!current || !next || current === next) continue;

        const origin = locationPool.get(current);
        const destination = locationPool.get(next);
        if (!origin || !destination) continue;

        const polyline = await fetchRoutePolyline(origin, destination);
        if (polyline.length < 2) continue;

        segments.push({
          type: 'roteiro',
          label: `${current} → ${next}`,
          polyline,
        });
      }

      const activeTransports = [...transports]
        .filter((transport) => transport.status !== 'cancelado' && transport.origem && transport.destino)
        .sort((a, b) => {
          const left = a.data ? new Date(a.data).getTime() : Number.MAX_SAFE_INTEGER;
          const right = b.data ? new Date(b.data).getTime() : Number.MAX_SAFE_INTEGER;
          return left - right;
        });

      for (const transport of activeTransports.slice(0, 6)) {
        const fromLabel = transport.origem?.trim();
        const toLabel = transport.destino?.trim();
        if (!fromLabel || !toLabel) continue;

        const origin = locationPool.get(fromLabel);
        const destination = locationPool.get(toLabel);
        if (!origin || !destination) continue;

        markers.push({
          kind: 'origem',
          label: `Origem: ${fromLabel}`,
          lat: origin.lat,
          lon: origin.lon,
        });

        markers.push({
          kind: 'destino',
          label: `Destino: ${toLabel}`,
          lat: destination.lat,
          lon: destination.lon,
        });

        const polyline = await fetchRoutePolyline(origin, destination);
        if (polyline.length < 2) continue;

        segments.push({
          type: 'transporte',
          label: `${transport.tipo || 'Transporte'} · ${fromLabel} → ${toLabel}`,
          polyline,
        });
      }

      const activeFlights = [...flights]
        .filter((flight) => flight.status !== 'cancelado' && flight.origem && flight.destino)
        .sort((a, b) => {
          const left = a.data ? new Date(a.data).getTime() : Number.MAX_SAFE_INTEGER;
          const right = b.data ? new Date(b.data).getTime() : Number.MAX_SAFE_INTEGER;
          return left - right;
        });

      for (const flight of activeFlights.slice(0, 5)) {
        const fromLabel = flight.origem?.trim();
        const toLabel = flight.destino?.trim();
        if (!fromLabel || !toLabel) continue;

        const origin = locationPool.get(fromLabel);
        const destination = locationPool.get(toLabel);
        if (!origin || !destination) continue;

        markers.push({
          kind: 'voo_origem',
          label: `Voo origem: ${fromLabel}`,
          lat: origin.lat,
          lon: origin.lon,
        });

        markers.push({
          kind: 'voo_destino',
          label: `Voo destino: ${toLabel}`,
          lat: destination.lat,
          lon: destination.lon,
        });

        const polyline = await fetchRoutePolyline(origin, destination);
        if (polyline.length < 2) continue;

        segments.push({
          type: 'voo',
          label: `${flight.numero || flight.companhia || 'Voo'} · ${fromLabel} → ${toLabel}`,
          polyline,
        });
      }

      if (canceled) return;

      setMapData({ markers, segments });
      if (markers.length === 0) {
        setError('Não foi possível geocodificar os locais cadastrados para exibir no mapa.');
      }
      setIsLoading(false);
    }

    void buildData();

    return () => {
      canceled = true;
    };
  }, [hasLocations, stays, transports, flights]);

  useEffect(() => {
    let disposed = false;

    async function mountMap() {
      if (!containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      if (mapData.markers.length === 0 && mapData.segments.length === 0) return;

      const L = await loadLeaflet();
      if (!L || !containerRef.current || disposed) return;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const allPoints: [number, number][] = [];

      const markerStyle = {
        hospedagem: { color: '#14b86a', fillColor: '#2ad879' },
        origem: { color: '#5f2eff', fillColor: '#8b5cf6' },
        destino: { color: '#ec4899', fillColor: '#f472b6' },
        voo_origem: { color: '#f59e0b', fillColor: '#fbbf24' },
        voo_destino: { color: '#fb7185', fillColor: '#fda4af' },
      } as const;

      mapData.markers.forEach((entry) => {
        const style = markerStyle[entry.kind];
        const marker =
          entry.kind === 'hospedagem' && entry.order
            ? L.marker([entry.lat, entry.lon], {
              icon: L.divIcon({
                className: '',
                html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:#16a34a;color:white;font-size:12px;font-weight:700;border:2px solid #14532d;box-shadow:0 4px 10px rgba(0,0,0,0.25)">${entry.order}</div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12],
              }),
            }).addTo(map)
            : L.circleMarker([entry.lat, entry.lon], {
              radius: 7,
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: 0.9,
              weight: 2,
            }).addTo(map);

        marker.bindPopup(`<strong>${entry.label}</strong>`);
        allPoints.push([entry.lat, entry.lon]);
      });

      mapData.segments.forEach((segment) => {
        const color =
          segment.type === 'roteiro'
            ? '#6d28d9'
            : segment.type === 'voo'
              ? '#f59e0b'
              : '#0ea5e9';
        const dashArray = segment.type === 'transporte' ? '0' : '8 6';
        L.polyline(segment.polyline, {
          color,
          weight: 3,
          opacity: 0.85,
          dashArray,
        }).bindTooltip(segment.label).addTo(map);

        segment.polyline.forEach((point) => allPoints.push(point));
      });

      if (allPoints.length === 1) {
        map.setView(allPoints[0], 7);
      } else {
        map.fitBounds(allPoints, { padding: [24, 24] });
      }
    }

    void mountMap();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [mapData]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        style={{ height, minHeight: 220 }}
        className="w-full rounded-2xl border border-border/60 bg-muted/20"
        aria-label="Mapa da viagem em OpenStreetMap"
      />
      {isLoading && (
        <p className="mt-2 text-xs text-muted-foreground">Carregando mapa e rotas...</p>
      )}
      {!isLoading && error && (
        <p className="mt-2 text-xs text-amber-700">{error}</p>
      )}
      {!isLoading && !error && hasLocations && mapData.markers.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Base OpenStreetMap com pins de hospedagem, voos e trajetos da viagem.
        </p>
      )}
      {!isLoading && !hasLocations && (
        <p className="mt-2 text-xs text-muted-foreground">
          Adicione origem/destino ou localização das hospedagens para visualizar o mapa.
        </p>
      )}
    </div>
  );
}
