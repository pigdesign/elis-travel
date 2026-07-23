export const EXCURSION_TIME_ZONE = "Europe/Rome";
export const BALANCE_DUE_HOURS_BEFORE_DEPARTURE = 48;

const OFFSET_DATE_TIME_RE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

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
  return (
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ) - value.getTime()
  );
}

function romeLocalMidnight(calendarDate: string): Date | null {
  const match = CALENDAR_DATE_RE.exec(calendarDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const wallClockUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const calendarCheck = new Date(wallClockUtc);
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }
  let candidate = new Date(wallClockUtc);
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate));
  candidate = new Date(wallClockUtc - timeZoneOffsetMs(candidate));
  return calendarDateInRome(candidate) === calendarDate ? candidate : null;
}

/**
 * Parses an API/DB departure timestamp without ever falling back to the
 * server's local timezone. API strings must carry an explicit UTC offset.
 */
export function parseDepartureAt(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!OFFSET_DATE_TIME_RE.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Il primo inserimento dell'orario su una gita legacy non è una
 * riprogrammazione. Dopo che l'istante è stato valorizzato, invece, ogni
 * modifica o rimozione deve passare dal workflow dedicato.
 */
export function departureUpdateRequiresReschedule(
  existingDepartureAt: unknown,
  requestedDepartureAt: unknown,
): boolean {
  const existing = parseDepartureAt(existingDepartureAt);
  if (!existing) return false;
  const requested = parseDepartureAt(requestedDepartureAt);
  return !requested || requested.getTime() !== existing.getTime();
}

/** Una prenotazione e ammessa solo prima di un istante di partenza reale. */
export function isDepartureOpenForBooking(
  departureAt: unknown,
  now: Date = new Date(),
): boolean {
  const departure = parseDepartureAt(departureAt);
  return Boolean(departure && departure.getTime() > now.getTime());
}

export function hasExcursionDeparted(
  departureAt: unknown,
  now: Date = new Date(),
): boolean {
  const departure = parseDepartureAt(departureAt);
  return Boolean(departure && departure.getTime() <= now.getTime());
}

export function computeGraceUntil(input: {
  deadline: Date;
  graceMinutes: number;
  departureAt: unknown;
  hardCap?: Date | null;
}): Date {
  const graceMs = Math.max(0, Math.trunc(input.graceMinutes)) * 60_000;
  const candidates = [input.deadline.getTime() + graceMs];
  const departure = parseDepartureAt(input.departureAt);
  if (departure) candidates.push(departure.getTime());
  if (input.hardCap) candidates.push(input.hardCap.getTime());
  return new Date(Math.min(...candidates));
}

/** Returns YYYY-MM-DD for the instant as observed in Europe/Rome. */
export function calendarDateInRome(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: EXCURSION_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${byType.year}-${byType.month}-${byType.day}`;
}

/** Fine del giorno civile italiano, indipendente dal timezone del processo. */
export function endOfDayInRome(calendarDate: string): Date | null {
  const midnight = romeLocalMidnight(calendarDate);
  if (!midnight) return null;
  const [year, month, day] = calendarDate.split("-").map(Number);
  const nextUtcDate = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const nextDate = `${nextUtcDate.getUTCFullYear().toString().padStart(4, "0")}-${(
    nextUtcDate.getUTCMonth() + 1
  )
    .toString()
    .padStart(2, "0")}-${nextUtcDate.getUTCDate().toString().padStart(2, "0")}`;
  const nextMidnight = romeLocalMidnight(nextDate);
  return nextMidnight ? new Date(nextMidnight.getTime() - 1) : null;
}

/**
 * Canonical balance deadline: exactly 48 elapsed hours before departure.
 * A missing/invalid departure never degrades to the legacy date at midnight.
 */
export function computeBalanceDueAt(
  departureAt: unknown,
  hoursBeforeDeparture = BALANCE_DUE_HOURS_BEFORE_DEPARTURE,
): Date | null {
  const departure = parseDepartureAt(departureAt);
  if (
    !departure ||
    !Number.isFinite(hoursBeforeDeparture) ||
    hoursBeforeDeparture < 0
  ) {
    return null;
  }
  return new Date(departure.getTime() - hoursBeforeDeparture * 60 * 60 * 1000);
}
