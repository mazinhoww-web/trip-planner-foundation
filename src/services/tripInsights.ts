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
 * Returns the final arrival airport and original departure airport.
 */
function buildFlightChains(flights: Tables<'voos'>[]) {
  const active = flights
    .filter(f => isActiveStatus(f.status) && f.origem && f.destino)
    .sort((a, b) => {
      if (!a.data) return 1;
      if (!b.data) return -1;
      return new Date(a.data).getTime() - new Date(b.data).getTime();
    });

  if (active.length === 0) return { chains: [], connectionAirports: new Set<string>() };

  const connectionAirports = new Set<string>();
  const chains: Array<{ departure: string; arrival: string }> = [];
  let chainStart = active[0].origem!;

  for (let i = 0; i < active.length - 1; i++) {
    const current = active[i];
    const next = active[i + 1];
    if (locationsMatch(current.destino!, next.origem!)) {
      connectionAirports.add(normalizeTextForMatch(current.destino));
      connectionAirports.add(normalizeTextForMatch(next.origem));
    } else {
      chains.push({ departure: chainStart, arrival: current.destino! });
      chainStart = next.origem!;
    }
  }
  chains.push({ departure: chainStart, arrival: active[active.length - 1].destino! });

  return { chains, connectionAirports };
}

function isUserHomeAirport(airport: string, userHome: string | null) {
  if (!userHome) return false;
  return locationsMatch(airport, userHome);
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

  // ── Inter-stay gaps (unchanged logic: stays in different cities need transport) ──
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
        pushUniqueGap(gaps, {
          from,
          to,
          referenceDate,
          reason: 'Não existe trecho registrado cobrindo a troca de cidade.',
        });
      }
    }
  }

  // ── Airport ↔ Stay gaps (smart: detect connections, suppress home airport) ──
  if (activeStays.length > 0) {
    const { chains, connectionAirports } = buildFlightChains(flights);

    // For each chain's final arrival, check if transport exists to the first stay
    for (const chain of chains) {
      // Skip if this is the user's home airport (they know how to get there)
      if (isUserHomeAirport(chain.departure, userHomeLocation)) {
        // This is an outbound chain from home — only check arrival end
      }

      const arrivalAirport = chain.arrival;
      // Skip connection airports — they don't need ground transport
      if (connectionAirports.has(normalizeTextForMatch(arrivalAirport))) continue;
      // Skip if arrival is the user's home airport (return flight)
      if (isUserHomeAirport(arrivalAirport, userHomeLocation)) continue;

      const firstStay = activeStays[0];
      const firstLocation = firstStay.localizacao || '';
      if (!firstLocation) continue;

      // Don't flag if the airport matches the stay location
      if (locationsMatch(arrivalAirport, firstLocation)) continue;

      const referenceDate = firstStay.check_in || firstStay.check_out || null;

      if (!hasTransportCoverage(arrivalAirport, firstLocation, referenceDate, transports, flights)) {
        pushUniqueGap(gaps, {
          from: arrivalAirport,
          to: firstLocation,
          referenceDate,
          reason: 'Sem transporte registrado do aeroporto de chegada até a hospedagem.',
        });
      }
    }

    // Check last stay → departure airport (for return flights)
    for (const chain of chains) {
      const departureAirport = chain.departure;
      // Skip connection airports
      if (connectionAirports.has(normalizeTextForMatch(departureAirport))) continue;
      // Skip if departure is user's home (they know how to get to their airport)
      if (isUserHomeAirport(departureAirport, userHomeLocation)) continue;

      const lastStay = activeStays[activeStays.length - 1];
      const lastLocation = lastStay.localizacao || '';
      if (!lastLocation) continue;

      if (locationsMatch(lastLocation, departureAirport)) continue;

      const referenceDate = lastStay.check_out || lastStay.check_in || null;

      if (!hasTransportCoverage(lastLocation, departureAirport, referenceDate, transports, flights)) {
        pushUniqueGap(gaps, {
          from: lastLocation,
          to: departureAirport,
          referenceDate,
          reason: 'Sem transporte registrado da hospedagem até o aeroporto de partida.',
        });
      }
    }
  }

  return gaps;
}
