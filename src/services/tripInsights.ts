import { Tables } from '@/integrations/supabase/types';
import { locationsMatch, normalizeTextForMatch } from '@/services/geo';

export type StayGap = {
  start: string;
  end: string;
  nights: number;
  reason: string;
};

export type TransportGap = {
  from: string;
  to: string;
  referenceDate: string | null;
  reason: string;
};

function toDateOnly(date?: string | null) {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toUtcDate(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function diffDays(start: string, endExclusive: string) {
  const startDate = toUtcDate(start);
  const endDate = toUtcDate(endExclusive);
  const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diff));
}

function isActiveStatus(status: string | null | undefined) {
  return status !== 'cancelado';
}

function normalizedDateInRange(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const target = new Date(date).getTime();
  const startTime = new Date(`${start}T00:00:00Z`).getTime();
  const endTime = new Date(`${end}T23:59:59Z`).getTime();
  return target >= startTime && target <= endTime;
}

function isInReferenceWindow(date: string | null | undefined, referenceDate: string | null, toleranceDays: number = 2) {
  if (!referenceDate) return true;
  if (!date) return true;
  const start = toIsoDate(addDays(toUtcDate(referenceDate), -toleranceDays));
  const end = toIsoDate(addDays(toUtcDate(referenceDate), toleranceDays));
  return normalizedDateInRange(date, start, end);
}

export function calculateStayCoverageGaps(
  stays: Tables<'hospedagens'>[],
  tripStart: string | null | undefined,
  tripEnd: string | null | undefined,
): StayGap[] {
  const activeStays = stays
    .filter((stay) => isActiveStatus(stay.status) && stay.check_in && stay.check_out)
    .map((stay) => ({
      ...stay,
      check_in: toDateOnly(stay.check_in),
      check_out: toDateOnly(stay.check_out),
    }))
    .filter((stay): stay is Tables<'hospedagens'> & { check_in: string; check_out: string } => !!stay.check_in && !!stay.check_out)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));

  if (activeStays.length === 0) return [];

  const start = toDateOnly(tripStart) ?? activeStays[0].check_in;
  const end = toDateOnly(tripEnd) ?? activeStays[activeStays.length - 1].check_out;

  if (!start || !end || start > end) return [];

  const gaps: StayGap[] = [];
  let coverageCursor = start;

  for (const stay of activeStays) {
    if (stay.check_in > coverageCursor) {
      const nights = diffDays(coverageCursor, stay.check_in);
      if (nights > 0) {
        gaps.push({
          start: coverageCursor,
          end: toIsoDate(addDays(toUtcDate(stay.check_in), -1)),
          nights,
          reason: `Sem hospedagem registrada até ${stay.nome || stay.localizacao || 'próxima reserva'}.`,
        });
      }
    }

    if (stay.check_out > coverageCursor) {
      coverageCursor = stay.check_out;
    }
  }

  if (coverageCursor < end) {
    const nights = diffDays(coverageCursor, end);
    if (nights > 0) {
      gaps.push({
        start: coverageCursor,
        end: toIsoDate(addDays(toUtcDate(end), -1)),
        nights,
        reason: 'Trecho final da viagem sem hospedagem confirmada.',
      });
    }
  }

  return gaps;
}

function hasTransportCoverage(
  from: string,
  to: string,
  referenceDate: string | null,
  transports: Tables<'transportes'>[],
  flights: Tables<'voos'>[],
) {
  const rangeStart = referenceDate ? toIsoDate(addDays(toUtcDate(referenceDate), -2)) : '1900-01-01';
  const rangeEnd = referenceDate ? toIsoDate(addDays(toUtcDate(referenceDate), 2)) : '2999-12-31';

  const transportCovered = transports.some((transport) => {
    if (!isActiveStatus(transport.status)) return false;
    if (!transport.origem || !transport.destino) return false;
    if (!locationsMatch(transport.origem, from)) return false;
    if (!locationsMatch(transport.destino, to)) return false;
    if (!transport.data) return true;
    return normalizedDateInRange(transport.data, rangeStart, rangeEnd);
  });

  if (transportCovered) return true;

  return flights.some((flight) => {
    if (!isActiveStatus(flight.status)) return false;
    if (!flight.origem || !flight.destino) return false;
    if (!locationsMatch(flight.origem, from)) return false;
    if (!locationsMatch(flight.destino, to)) return false;
    if (!flight.data) return true;
    return normalizedDateInRange(flight.data, rangeStart, rangeEnd);
  });
}

function pushUniqueGap(gaps: TransportGap[], gap: TransportGap) {
  const exists = gaps.some((item) => {
    return locationsMatch(item.from, gap.from) && locationsMatch(item.to, gap.to);
  });
  if (!exists) gaps.push(gap);
}

/**
 * Detect flight connections: if flight A's destination matches flight B's origin
 * (and they are consecutive by date), B is a connection — no ground transport needed.
 * Returns the final arrival airport and original departure airport, plus date info.
 */
function buildFlightChains(flights: Tables<'voos'>[]) {
  const active = flights
    .filter(f => isActiveStatus(f.status) && f.origem && f.destino)
    .sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

  if (active.length === 0) return { chains: [] as FlightChain[], connectionAirports: new Set<string>() };

  const connectionAirports = new Set<string>();
  const chains: FlightChain[] = [];
  let chainStart = active[0].origem!;
  let chainStartDate = toDateOnly(active[0].data) ?? null;

  for (let i = 0; i < active.length - 1; i++) {
    const current = active[i];
    const next = active[i + 1];
    if (locationsMatch(current.destino!, next.origem!)) {
      connectionAirports.add(normalizeTextForMatch(current.destino));
      connectionAirports.add(normalizeTextForMatch(next.origem));
    } else {
      chains.push({
        departure: chainStart,
        arrival: current.destino!,
        departureDate: chainStartDate,
        arrivalDate: toDateOnly(current.data) ?? null,
      });
      chainStart = next.origem!;
      chainStartDate = toDateOnly(next.data) ?? null;
    }
  }
  const lastFlight = active[active.length - 1];
  chains.push({
    departure: chainStart,
    arrival: lastFlight.destino!,
    departureDate: chainStartDate,
    arrivalDate: toDateOnly(lastFlight.data) ?? null,
  });

  return { chains, connectionAirports };
}

type FlightChain = {
  departure: string;
  arrival: string;
  departureDate: string | null;
  arrivalDate: string | null;
};

function isUserHomeAirport(airport: string, userHome: string | null) {
  if (!userHome) return false;
  return locationsMatch(airport, userHome);
}

function getTransportSuggestion(from: string, to: string): string {
  const normalized = normalizeTextForMatch(to) + ' ' + normalizeTextForMatch(from);

  const publicTransitCities = ['paris', 'london', 'londres', 'roma', 'rome', 'barcelona', 'berlin',
    'amsterdam', 'tokyo', 'new york', 'nyc', 'chicago', 'toronto', 'madrid', 'lisboa', 'lisbon',
    'milao', 'milan', 'munique', 'munich', 'zurich', 'zurique', 'bruxelas', 'brussels', 'viena', 'vienna'];
  const carCities = ['miami', 'los angeles', 'las vegas', 'orlando', 'houston', 'phoenix',
    'san diego', 'dallas', 'austin', 'nashville', 'cancun', 'punta cana'];

  const isPublicTransit = publicTransitCities.some((c) => normalized.includes(c));
  const isCar = carCities.some((c) => normalized.includes(c));

  if (isPublicTransit) return ' Considere transporte público (metrô/trem). Veja rotas em Google Maps ou Citymapper.';
  if (isCar) return ' Considere alugar um veículo ou usar Uber/táxi. Transporte público limitado nesta região.';
  return ' Verifique opções de transporte no Google Maps.';
}

/**
 * Find the stay whose date field (check_in or check_out) is closest to a reference date.
 * For check_in: prefer stays starting on or after the reference date.
 * For check_out: prefer stays ending on or before the reference date.
 */
function findNearestStay(
  stays: Array<{ check_in: string | null; check_out: string | null; localizacao: string | null }>,
  referenceDate: string | null,
  field: 'check_in' | 'check_out',
) {
  if (stays.length === 0) return null;
  if (!referenceDate) return field === 'check_in' ? stays[0] : stays[stays.length - 1];

  const refTime = toUtcDate(referenceDate).getTime();
  let best: typeof stays[0] | null = null;
  let bestDiff = Infinity;

  for (const stay of stays) {
    const dateStr = stay[field];
    if (!dateStr) continue;
    const stayTime = toUtcDate(dateStr).getTime();
    const diff = field === 'check_in'
      ? (stayTime >= refTime ? stayTime - refTime : Infinity)
      : (stayTime <= refTime ? refTime - stayTime : Infinity);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = stay;
    }
  }

  // Fallback: if no stay found in preferred direction, pick closest overall
  if (!best) {
    for (const stay of stays) {
      const dateStr = stay[field];
      if (!dateStr) continue;
      const diff = Math.abs(toUtcDate(dateStr).getTime() - refTime);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = stay;
      }
    }
  }

  return best ?? (field === 'check_in' ? stays[0] : stays[stays.length - 1]);
}

export function calculateTransportCoverageGaps(
  stays: Tables<'hospedagens'>[],
  transports: Tables<'transportes'>[],
  flights: Tables<'voos'>[],
  userHomeLocation: string | null = null,
): TransportGap[] {
  const activeStays = stays
    .filter((stay) => isActiveStatus(stay.status) && !!stay.localizacao)
    .map((stay) => ({
      ...stay,
      check_in: toDateOnly(stay.check_in),
      check_out: toDateOnly(stay.check_out),
    }))
    .sort((a, b) => {
      const left = a.check_in ?? '9999-12-31';
      const right = b.check_in ?? '9999-12-31';
      return left.localeCompare(right);
    });

  const gaps: TransportGap[] = [];

  // ── Inter-stay gaps ──
  if (activeStays.length >= 2) {
    for (let i = 0; i < activeStays.length - 1; i += 1) {
      const current = activeStays[i];
      const next = activeStays[i + 1];

      const from = current.localizacao || '';
      const to = next.localizacao || '';
      if (!from || !to) continue;

      if (locationsMatch(from, to)) continue;

      const referenceDate = next.check_in || current.check_out || null;

      if (!hasTransportCoverage(from, to, referenceDate, transports, flights)) {
        const suggestion = getTransportSuggestion(from, to);
        pushUniqueGap(gaps, {
          from,
          to,
          referenceDate,
          reason: 'Não existe trecho registrado cobrindo a troca de cidade.' + suggestion,
        });
      }
    }
  }

  // ── Airport ↔ Stay gaps (date-aware: match chains to temporally relevant stays) ──
  if (activeStays.length > 0) {
    const { chains, connectionAirports } = buildFlightChains(flights);

    for (const chain of chains) {
      if (connectionAirports.has(normalizeTextForMatch(chain.arrival))) continue;
      if (connectionAirports.has(normalizeTextForMatch(chain.departure))) continue;

      const isReturnHome = isUserHomeAirport(chain.arrival, userHomeLocation);
      const isDepartureFromHome = isUserHomeAirport(chain.departure, userHomeLocation);

      // Skip connection origins (same arrival as another chain)
      const isConnectionOrigin = chains.some(other => {
        if (other === chain) return false;
        return locationsMatch(other.arrival, chain.arrival);
      }) && !locationsMatch(chain.departure, chain.arrival);
      if (isConnectionOrigin) continue;

      if (isDepartureFromHome && !isReturnHome) {
        // ── OUTBOUND chain: departure from home → arrival at destination ──
        // Find the stay whose check_in is closest to (and after) the arrival date
        const nearestStay = findNearestStay(activeStays, chain.arrivalDate, 'check_in');
        if (!nearestStay) continue;

        const stayLocation = nearestStay.localizacao || '';
        if (!stayLocation || locationsMatch(chain.arrival, stayLocation)) continue;

        const referenceDate = nearestStay.check_in || chain.arrivalDate || null;

        if (!hasTransportCoverage(chain.arrival, stayLocation, referenceDate, transports, flights)) {
          const suggestion = getTransportSuggestion(chain.arrival, stayLocation);
          pushUniqueGap(gaps, {
            from: chain.arrival,
            to: stayLocation,
            referenceDate,
            reason: 'Sem transporte registrado do aeroporto de chegada até a hospedagem.' + suggestion,
          });
        }
      } else if (isReturnHome && !isDepartureFromHome) {
        // ── RETURN chain: departure from destination → arrival at home ──
        // Find the stay whose check_out is closest to (and before) the departure date
        const nearestStay = findNearestStay(activeStays, chain.departureDate, 'check_out');
        if (!nearestStay) continue;

        const stayLocation = nearestStay.localizacao || '';
        if (!stayLocation || locationsMatch(stayLocation, chain.departure)) continue;

        const referenceDate = nearestStay.check_out || chain.departureDate || null;

        if (!hasTransportCoverage(stayLocation, chain.departure, referenceDate, transports, flights)) {
          const suggestion = getTransportSuggestion(stayLocation, chain.departure);
          pushUniqueGap(gaps, {
            from: stayLocation,
            to: chain.departure,
            referenceDate,
            reason: 'Sem transporte registrado da hospedagem até o aeroporto de partida.' + suggestion,
          });
        }
      } else if (!isDepartureFromHome && !isReturnHome) {
        // ── MID-TRIP chain (e.g. inter-city flight within the trip) ──
        // Arrival side: find stay starting near arrival date
        const arrivalStay = findNearestStay(activeStays, chain.arrivalDate, 'check_in');
        if (arrivalStay) {
          const loc = arrivalStay.localizacao || '';
          if (loc && !locationsMatch(chain.arrival, loc)) {
            const ref = arrivalStay.check_in || chain.arrivalDate || null;
            if (!hasTransportCoverage(chain.arrival, loc, ref, transports, flights)) {
              const suggestion = getTransportSuggestion(chain.arrival, loc);
              pushUniqueGap(gaps, { from: chain.arrival, to: loc, referenceDate: ref, reason: 'Sem transporte do aeroporto até a hospedagem.' + suggestion });
            }
          }
        }
        // Departure side: find stay ending near departure date
        const departureStay = findNearestStay(activeStays, chain.departureDate, 'check_out');
        if (departureStay) {
          const loc = departureStay.localizacao || '';
          if (loc && !locationsMatch(loc, chain.departure)) {
            const ref = departureStay.check_out || chain.departureDate || null;
            if (!hasTransportCoverage(loc, chain.departure, ref, transports, flights)) {
              const suggestion = getTransportSuggestion(loc, chain.departure);
              pushUniqueGap(gaps, { from: loc, to: chain.departure, referenceDate: ref, reason: 'Sem transporte da hospedagem até o aeroporto.' + suggestion });
            }
          }
        }
      }
    }
  }

  return gaps;
}
