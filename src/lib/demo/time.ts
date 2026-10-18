import { addMinutesIso, setWallClockTime, toEpochMs } from "../shared/datetime";
import type { IsoLocal, TimeWindow } from "./frontend-types";

// Display/arithmetic helpers for the dashboard. Timestamps carry an offset
// ("2026-10-17T07:30:00-07:00"); comparisons use the absolute instant, so
// multi-day values sort correctly. Deterministic on server and client.

/**
 * Absolute minutes since the epoch. Only meaningful for comparisons and
 * differences (e.g. `toMinutes(b) - toMinutes(a)`), never for display.
 */
export function toMinutes(iso: IsoLocal): number {
  return Math.floor(toEpochMs(iso) / 60_000);
}

export function addMinutes(iso: IsoLocal, minutes: number): IsoLocal {
  return addMinutesIso(iso, minutes);
}

/** Same date and offset as `dayIso`, at wall-clock "HH:MM". */
export function withTime(dayIso: IsoLocal, hhmm: string): IsoLocal {
  return setWallClockTime(dayIso, hhmm);
}

/** Wall-clock "HH:MM" in the timestamp's own offset. */
export function formatTime(iso: IsoLocal): string {
  return iso.slice(11, 16);
}

export function formatWindow(window: TimeWindow | null): string {
  return window ? `${formatTime(window.start)}–${formatTime(window.end)}` : "—";
}

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return toEpochMs(a.start) < toEpochMs(b.end) && toEpochMs(b.start) < toEpochMs(a.end);
}
