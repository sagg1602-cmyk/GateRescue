import { formatTime, formatWindow } from "@/lib/demo/time";
import type { StateResponse } from "@/lib/shared/api-contract";
import {
  DRIVER_REPORT_SOURCES,
  type CriticalityBasis,
  type DriverReportSource,
  type RecoveryStatus,
  type TimeWindow,
} from "@/lib/shared/operational-types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Weekday and calendar date in the timestamp's own offset, e.g. "Mon, Oct 19, 2026". */
export function formatSnapshotDate(iso: string): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!year || month < 1 || month > 12 || !day) return iso;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${MONTHS[month - 1]} ${day}, ${year}`;
}

/** "Mon, Oct 19, 2026 · 14:05" using the timestamp's wall clock, not the browser zone. */
export function formatSnapshotDateTime(iso: string): string {
  return `${formatSnapshotDate(iso)} · ${formatTime(iso)}`;
}

export function formatAppointmentWindow(window: TimeWindow | null): string {
  if (!window) return "—";
  const span = formatWindow(window);
  if (window.start.slice(0, 10) === window.end.slice(0, 10)) {
    return `${formatSnapshotDate(window.start)} · ${span}`;
  }
  return `${formatSnapshotDateTime(window.start)} – ${formatSnapshotDateTime(window.end)}`;
}

export const BASIS_LABEL: Record<CriticalityBasis, string> = {
  government_designated: "Government designated",
  third_party_verified: "Third-party verified",
  self_declared: "Self-declared",
  none: "None",
};

export const REPORT_SOURCE_LABEL: Record<DriverReportSource, string> = {
  dispatcher: "Dispatcher entry",
  retell: "Phone call (Retell)",
  scenario: "Scenario data",
};

/** Backend codes such as "call_terminal_to_reconfirm" → "Call terminal to reconfirm". */
export function humanizeCode(code: string): string {
  const words = code.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** True when the queue is waiting on a driver report, e.g. "wait_for_reefer_driver_report". */
export function needsDriverReport(nextAction: string): boolean {
  return nextAction.includes("driver_report");
}

export const RECOVERY_STATUS_LABEL: Record<RecoveryStatus, string> = {
  ready_for_approval: "Ready for approval",
  awaiting_verification: "Awaiting verification",
  blocked: "Blocked",
};

/** Latest stored report for one driver, when GET /api/state includes `driverReports`. */
export interface ListedDriverReport {
  id: string;
  driverId: string;
  source: DriverReportSource;
  reportedAt: string;
  note: string;
}

function isReportSource(value: string): value is DriverReportSource {
  return (DRIVER_REPORT_SOURCES as readonly string[]).includes(value);
}

/**
 * OperationalSnapshot does not declare reports. The queue panel already reads
 * them when the response carries a `driverReports` array; the drivers panel
 * uses the same shape.
 */
export function snapshotDriverReports(snapshot: StateResponse): ListedDriverReport[] {
  const reports = (snapshot as StateResponse & { driverReports?: unknown }).driverReports;
  if (!Array.isArray(reports)) return [];
  const listed: ListedDriverReport[] = [];
  for (const value of reports) {
    if (!value || typeof value !== "object") continue;
    const report = value as Record<string, unknown>;
    if (typeof report.driverId !== "string" || typeof report.reportedAt !== "string") continue;
    if (typeof report.source !== "string" || !isReportSource(report.source)) continue;
    listed.push({
      id: typeof report.id === "string" ? report.id : `${report.driverId}-${report.reportedAt}`,
      driverId: report.driverId,
      source: report.source,
      reportedAt: report.reportedAt,
      note: typeof report.note === "string" ? report.note : "",
    });
  }
  return listed;
}

export function latestDriverReport(reports: ListedDriverReport[], driverId: string): ListedDriverReport | undefined {
  let latest: ListedDriverReport | undefined;
  for (const report of reports) {
    if (report.driverId !== driverId) continue;
    if (!latest || Date.parse(report.reportedAt) >= Date.parse(latest.reportedAt)) latest = report;
  }
  return latest;
}

export function unknownReason(
  snapshot: StateResponse,
  entity: StateResponse["unknowns"][number]["entity"],
  id: string,
  field: string,
): string | undefined {
  return snapshot.unknowns.find((item) => item.entity === entity && item.id === id && item.field === field)?.reason;
}

export interface RecoveryCounts {
  totalJobs: number | null;
  inScope: number | null;
  ready: number | null;
  awaiting: number | null;
  blocked: number | null;
}

export function recoveryCounts(snapshot: StateResponse | null): RecoveryCounts {
  if (!snapshot) {
    return { totalJobs: null, inScope: null, ready: null, awaiting: null, blocked: null };
  }
  const entries = snapshot.recoveryQueue?.entries;
  if (!entries) {
    return { totalJobs: snapshot.jobs.length, inScope: null, ready: null, awaiting: null, blocked: null };
  }
  return {
    totalJobs: snapshot.jobs.length,
    inScope: entries.length,
    ready: entries.filter((entry) => entry.status === "ready_for_approval").length,
    awaiting: entries.filter((entry) => entry.status === "awaiting_verification").length,
    blocked: entries.filter((entry) => entry.status === "blocked").length,
  };
}
