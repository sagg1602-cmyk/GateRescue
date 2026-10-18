/**
 * Date-time helpers for GateRescue. All operational timestamps are ISO 8601
 * strings WITH an offset ("2026-10-19T15:00:00-07:00"). Comparisons use the
 * absolute instant, so calendar dates and offsets are always respected.
 * Formatting keeps each value's own offset, so wall-clock display
 * (`iso.slice(11, 16)`) stays correct. No helper depends on the runtime's
 * local time zone, so server and browser give identical results.
 *
 * Imported with explicit ".ts" extensions elsewhere so Node's built-in test
 * runner can load it directly.
 */

const ISO_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface ParsedIso {
  /** Absolute instant (ms since epoch). */
  ms: number;
  /** Offset from UTC in minutes, e.g. -420 for -07:00. */
  offsetMinutes: number;
}

export function parseIsoDateTime(iso: string): ParsedIso {
  const m = ISO_WITH_OFFSET.exec(iso);
  if (!m) throw new RangeError(`Expected ISO 8601 date-time with offset, got "${iso}"`);
  const [, y, mo, d, h, mi, s = "0", frac = "0", tz] = m;
  const offsetMinutes =
    tz === "Z" ? 0 : (tz[0] === "-" ? -1 : 1) * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4, 6)));
  const wallMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(frac.padEnd(3, "0")));
  return { ms: wallMs - offsetMinutes * 60_000, offsetMinutes };
}

export function isIsoDateTime(value: string): boolean {
  return ISO_WITH_OFFSET.test(value);
}

export function toEpochMs(iso: string): number {
  return parseIsoDateTime(iso).ms;
}

/** Negative if a is earlier than b, 0 if the same instant, positive if later. */
export function compareIso(a: string, b: string): number {
  return toEpochMs(a) - toEpochMs(b);
}

export function minutesBetween(from: string, to: string): number {
  return (toEpochMs(to) - toEpochMs(from)) / 60_000;
}

function pad(n: number, width = 2): string {
  return String(Math.trunc(Math.abs(n))).padStart(width, "0");
}

/** Formats an instant as wall-clock time at a fixed offset (seconds precision). */
export function formatAtOffset(ms: number, offsetMinutes: number): string {
  const wall = new Date(ms + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
    `${sign}${pad(Math.abs(offsetMinutes) / 60)}:${pad(Math.abs(offsetMinutes) % 60)}`
  );
}

/** Adds minutes, keeping the input's offset. */
export function addMinutesIso(iso: string, minutes: number): string {
  const { ms, offsetMinutes } = parseIsoDateTime(iso);
  return formatAtOffset(ms + minutes * 60_000, offsetMinutes);
}

/** Same calendar date and offset as `iso`, with the wall-clock time set to "HH:MM". */
export function setWallClockTime(iso: string, hhmm: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) throw new RangeError(`Expected HH:MM, got "${hhmm}"`);
  const { offsetMinutes } = parseIsoDateTime(iso);
  return `${iso.slice(0, 11)}${hhmm}:00${formatAtOffset(0, offsetMinutes).slice(19)}`;
}

const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

/** UTC offset (minutes) of an IANA time zone at a given instant, e.g. -420 for PDT. */
export function offsetInTimeZone(ms: number, timeZone: string): number {
  let fmt = zoneFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    zoneFormatters.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** Re-expresses any ISO instant in an IANA time zone, e.g. "…T21:00:00+00:00" → "…T14:00:00-07:00". */
export function toZonedIso(isoOrMs: string | number, timeZone: string): string {
  const ms = typeof isoOrMs === "number" ? isoOrMs : toEpochMs(isoOrMs);
  return formatAtOffset(ms, offsetInTimeZone(ms, timeZone));
}
