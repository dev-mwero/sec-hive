/**
 * Shift time arithmetic.
 *
 * A shift time is a *wall-clock time of day*, not a timestamp. Two failure modes drove this
 * design:
 *
 * - Storing `"06:00"` as a string invites lexicographic comparison bugs and unindexed scans.
 * - Storing a real timestamp drags in a meaningless year/month/day that people misread, and
 *   then someone "helpfully" normalises it across a date boundary.
 *
 * So the time is stored as a `Date` pinned to a fixed reference day (1970-01-01) and every
 * read goes through minutes-since-midnight. Correct numeric arithmetic, correct `lt`/`gt`
 * range queries, no string parsing — and 1970 never reaches the UI because formatters take
 * minutes directly.
 *
 * Documented in docs/database.md#why-a-date-for-a-time-of-day.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** Reference day for stored wall-clock times. Never displayed. */
const REFERENCE_DAY = "1970-01-01";

/** `06:00` → 360 */
export function timeToMinutes(value: Date | string | number): number {
  if (value instanceof Date) {
    return value.getUTCHours() * 60 + value.getUTCMinutes();
  }

  if (typeof value === "number") {
    return value;
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new TypeError(`Invalid time-of-day: "${value}". Expected HH:mm.`);
  }

  return normalizeMinutes(Number(match[1]) * 60 + Number(match[2]));
}

/** 360 → `Date` at 1970-01-01T06:00Z */
export function minutesToTime(minutes: number): Date {
  const normalized = normalizeMinutes(minutes);
  return new Date(`${REFERENCE_DAY}T${formatHHMM(normalized)}:00.000Z`);
}

export function normalizeMinutes(minutes: number): number {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** `06:00` — the only format that reaches the UI. */
export function formatHHMM(minutes: number): string {
  const m = normalizeMinutes(minutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** `06:00 – 18:00`, or `18:00 – 06:00 (+1)` for an overnight shift. */
export function formatShiftWindow(
  startMinutes: number,
  endMinutes: number,
  crossesMidnight = endMinutes <= startMinutes,
): string {
  const suffix = crossesMidnight ? " (+1)" : "";
  return `${formatHHMM(startMinutes)} – ${formatHHMM(endMinutes)}${suffix}`;
}

/** True when the end time falls at or before the start time, i.e. the shift crosses midnight. */
export function shiftCrossesMidnight(
  startMinutes: number,
  endMinutes: number,
): boolean {
  return normalizeMinutes(endMinutes) <= normalizeMinutes(startMinutes);
}

/** Signed duration in minutes, accounting for an overnight wrap. Always positive. */
export function shiftDurationMinutes(
  startMinutes: number,
  endMinutes: number,
): number {
  const start = normalizeMinutes(startMinutes);
  const end = normalizeMinutes(endMinutes);
  return end > start ? end - start : MINUTES_PER_DAY - start + end;
}

/**
 * Materialises a shift into absolute start/end instants for a given calendar date.
 *
 * This is what `DutyAssignment.scheduledStart` / `scheduledEnd` hold. An overnight shift's
 * end lands on the **next** calendar day — the single most common source of off-by-one bugs in
 * duty rostering, so it lives in one tested place rather than at each call site.
 *
 * @param date       `YYYY-MM-DD` local calendar date of the shift's first day
 * @param tzOffsetMinutes minutes to add to UTC to get local time (e.g. 180 for EAT)
 */
export function materialiseShiftWindow(
  date: string,
  startMinutes: number,
  endMinutes: number,
  tzOffsetMinutes = 0,
): { scheduledStart: Date; scheduledEnd: Date; crossesMidnight: boolean } {
  const crossesMidnight = shiftCrossesMidnight(startMinutes, endMinutes);
  const start = toUtcInstant(date, startMinutes, tzOffsetMinutes);
  const endDay = crossesMidnight ? addDaysToIsoDate(date, 1) : date;
  const end = toUtcInstant(endDay, endMinutes, tzOffsetMinutes);

  return { scheduledStart: start, scheduledEnd: end, crossesMidnight };
}

function toUtcInstant(
  isoDate: string,
  minutes: number,
  tzOffsetMinutes: number,
): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) {
    throw new TypeError(`Invalid ISO date: "${isoDate}". Expected YYYY-MM-DD.`);
  }
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(utcMs + (minutes - tzOffsetMinutes) * 60_000);
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * MINUTES_PER_DAY * 60_000);
  return next.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` for a Date, in the caller's local offset. */
export function toIsoDate(value: Date, tzOffsetMinutes = 0): string {
  const shifted = new Date(value.getTime() + tzOffsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

/** True when `[startA, endA)` and `[startB, endB)` overlap. Touching endpoints do not. */
export function windowsOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}

/** Local `YYYY-MM-DD HH:mm` — the format audit metadata and CSV exports use. */
export function formatDateTime(value: Date | null | undefined): string {
  if (!value) {
    return "—";
  }
  return `${toIsoDate(value)} ${formatClockMinutes(
    value.getUTCHours() * 60 + value.getUTCMinutes(),
  )}`;
}

export function formatClockMinutes(minutes: number): string {
  const m = normalizeMinutes(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
