import type { IsoLocal, TimeWindow } from "./frontend-types";

// Timezone-free helpers for the single simulated incident day. Avoids Date so
// rendering is deterministic on server and client.

export function toMinutes(iso: IsoLocal): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

export function addMinutes(iso: IsoLocal, minutes: number): IsoLocal {
  const total = toMinutes(iso) + minutes;
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${iso.slice(0, 11)}${h}:${m}:00`;
}

export function withTime(dayIso: IsoLocal, hhmm: string): IsoLocal {
  return `${dayIso.slice(0, 11)}${hhmm}:00`;
}

export function formatTime(iso: IsoLocal): string {
  return iso.slice(11, 16);
}

export function formatWindow(window: TimeWindow | null): string {
  return window ? `${formatTime(window.start)}–${formatTime(window.end)}` : "—";
}

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}
