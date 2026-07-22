export const EXCURSION_TIME_ZONE = "Europe/Rome";

type RomeLocalDateTime = {
  date: string;
  time: string;
};

function partsInRome(value: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EXCURSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function timeZoneOffsetMs(value: Date): number {
  const parts = partsInRome(value);
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return representedAsUtc - value.getTime();
}

export function departureAtToRomeLocal(value?: string | Date | null): RomeLocalDateTime | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = partsInRome(parsed);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Converts an Italian wall-clock value to an ISO timestamp. The round trip
 * rejects nonexistent local times during the spring DST transition.
 */
export function romeLocalDateTimeToIso(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) return null;

  const [, year, month, day] = match;
  const [, hour, minute] = timeMatch;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const min = Number(minute);
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;

  const wallClockUtc = Date.UTC(y, m - 1, d, h, min, 0);
  const calendarCheck = new Date(wallClockUtc);
  if (
    calendarCheck.getUTCFullYear() !== y ||
    calendarCheck.getUTCMonth() !== m - 1 ||
    calendarCheck.getUTCDate() !== d
  ) {
    return null;
  }

  let candidate = new Date(wallClockUtc);
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate));
  // One more pass handles an offset transition between the initial guess and
  // the actual instant (for example the start/end of daylight saving time).
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate));

  const roundTrip = departureAtToRomeLocal(candidate);
  if (!roundTrip || roundTrip.date !== date || roundTrip.time !== time) return null;
  return candidate.toISOString();
}

export function formatDepartureInRome(
  departureAt?: string | Date | null,
  options?: Intl.DateTimeFormatOptions,
): string | null {
  if (!departureAt) return null;
  const parsed = departureAt instanceof Date ? departureAt : new Date(departureAt);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: EXCURSION_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(parsed);
}
