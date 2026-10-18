/**
 * SHARED OPERATIONAL TYPES — single source of truth for GateRescue data shapes,
 * used by the dashboard (frontend), the API routes and the database mappers.
 *
 * These were promoted unchanged from the original temporary frontend module
 * (src/lib/demo/frontend-types.ts, which now re-exports this file). Change a
 * shape here, not in a parallel model.
 *
 * Time conventions:
 * - `IsoLocal` values are timezone-free strings ("2026-10-17T07:30:00") on the
 *   single simulated incident day. The database stores them as `timestamp`
 *   (without time zone), which PostgREST returns in exactly this format.
 * - `IsoInstant` values are real-world instants with an offset
 *   ("2026-10-17T14:31:05.120Z"), used for provenance of external reports.
 */

export type IsoLocal = string;
export type IsoInstant = string;

/* ------------------------------------------------------------------ enums */

export const TERMINAL_IDS = ["term-a", "term-b", "term-c"] as const;
export type TerminalId = (typeof TERMINAL_IDS)[number];

export const TERMINAL_PORTAL_STATUSES = ["online", "outage", "reconciling"] as const;
export type TerminalPortalStatus = (typeof TERMINAL_PORTAL_STATUSES)[number];

export const EQUIPMENT_TYPES = ["chassis-40", "chassis-20", "reefer-40", "triaxle"] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const PRIORITIES = ["critical", "high", "normal"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const APPOINTMENT_STATUSES = ["confirmed", "unverified", "none", "lost"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const HOLD_TYPES = ["customs", "freight", "usda"] as const;
export type HoldType = (typeof HOLD_TYPES)[number];

export const DRIVER_AVAILABILITIES = ["available", "on-job", "off-duty", "unreachable"] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITIES)[number];

export const ACTIVITY_KINDS = ["system", "terminal", "driver", "plan", "dispatcher"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number];

export const RECOMMENDATION_CATEGORIES = ["ready", "awaiting-verification", "blocked"] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];

/** Where a driver report came from. Set by the server, never by the request body. */
export const DRIVER_REPORT_SOURCES = ["dispatcher", "retell"] as const;
export type DriverReportSource = (typeof DRIVER_REPORT_SOURCES)[number];

/* --------------------------------------------------------------- entities */

export interface Terminal {
  id: TerminalId;
  shortName: string;
  name: string;
  portalStatus: TerminalPortalStatus;
}

export interface Customer {
  id: string;
  name: string;
}

export interface TimeWindow {
  start: IsoLocal;
  end: IsoLocal;
}

export interface AppointmentSnapshot {
  status: AppointmentStatus;
  window: TimeWindow | null;
}

export interface Appointment extends AppointmentSnapshot {
  /** Value captured when an outage made this appointment unverifiable. */
  preOutage: AppointmentSnapshot | null;
}

export interface DispatcherApproval {
  driverId: string;
  approvedAt: IsoLocal;
  /** Approval is recorded only; nothing is sent to drivers. */
  simulated: true;
}

export interface Job {
  id: string;
  container: string;
  customerId: string;
  terminalId: TerminalId;
  priority: Priority;
  deadline: IsoLocal;
  appointment: Appointment;
  containerAvailable: boolean;
  holds: HoldType[];
  requiredEquipment: EquipmentType;
  approval: DispatcherApproval | null;
}

export interface BusySlot extends TimeWindow {
  label: string;
  jobId?: string;
}

export interface Driver {
  id: string;
  name: string;
  equipment: EquipmentType[];
  availability: DriverAvailability;
  /** Earliest time the driver can start a new move. */
  availableFrom: IsoLocal;
  lastReport: IsoLocal;
  lastNote: string;
  busy: BusySlot[];
}

export interface ActivityEvent {
  id: number;
  at: IsoLocal;
  kind: ActivityKind;
  severity: ActivitySeverity;
  message: string;
}

export interface RecoveryCheck {
  label: string;
  result: "pass" | "fail" | "skip";
  detail: string;
}

export interface Recommendation {
  jobId: string;
  category: RecommendationCategory;
  driverId: string | null;
  checks: RecoveryCheck[];
  explanation: string;
  approved: boolean;
}

export interface RecoveryPlan {
  id: number;
  generatedAt: IsoLocal;
  inputsVersion: number;
  status: "current" | "invalidated";
  invalidatedReason: string | null;
  recommendations: Recommendation[];
}

/* ------------------------------------------------------ backend additions */

/** A stored driver status report, with provenance preserved. */
export interface DriverReport {
  id: string;
  driverId: string;
  source: DriverReportSource;
  /** Unique per source; used to deduplicate retried deliveries (e.g. Retell webhooks). */
  providerEventId: string;
  /** When the driver gave the report, per the source (real-world instant). */
  reportedAt: IsoInstant;
  /** When the server stored the report (real-world instant). */
  receivedAt: IsoInstant;
  /** Simulated-clock time at which the report was applied to the driver. */
  appliedAt: IsoLocal | null;
  availability: DriverAvailability;
  /** "HH:MM" on the simulated incident day, as reported. */
  availableFrom: string;
  note: string;
}

/** Full operational state, as returned by GET /api/state. */
export interface OperationalSnapshot {
  /** Simulated clock. */
  now: IsoLocal;
  /** Increments whenever an operational input changes. */
  inputsVersion: number;
  terminals: Terminal[];
  customers: Customer[];
  jobs: Job[];
  drivers: Driver[];
  /** Newest first. */
  events: ActivityEvent[];
  /** Most recent recovery plan, or null if none has been generated. */
  plan: RecoveryPlan | null;
}
