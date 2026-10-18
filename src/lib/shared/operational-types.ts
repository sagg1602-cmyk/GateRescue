/**
 * SHARED OPERATIONAL TYPES — single source of truth for GateRescue data shapes,
 * used by the dashboard (frontend), the API routes, the recovery engine and
 * the database mappers. Changes here are coordinated with the team; see
 * docs/frontend-coordination.md for the change log.
 *
 * Time convention: every timestamp is an ISO 8601 string WITH an offset
 * ("2026-10-19T15:00:00-07:00"), expressed in the scenario time zone
 * (America/Los_Angeles). Compare with src/lib/shared/datetime.ts, never by
 * slicing strings. `iso.slice(11, 16)` remains valid for wall-clock display.
 *
 * Unknown values are `null` and listed in `OperationalSnapshot.unknowns`;
 * they are never replaced with invented defaults.
 */

/** ISO 8601 date-time with offset. */
export type IsoDateTime = string;
/** @deprecated Former timezone-free alias; now identical to IsoDateTime. */
export type IsoLocal = IsoDateTime;
/** @deprecated Use IsoDateTime. */
export type IsoInstant = IsoDateTime;
/** Calendar date "YYYY-MM-DD". */
export type IsoDate = string;

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

/** "not-reported": no status received yet — availability, location and report time unknown. */
export const DRIVER_AVAILABILITIES = ["available", "on-job", "off-duty", "unreachable", "not-reported"] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITIES)[number];

/** Availability values a driver report may set ("not-reported" is only an initial state). */
export const REPORTABLE_AVAILABILITIES = ["available", "on-job", "off-duty", "unreachable"] as const;
export type ReportableAvailability = (typeof REPORTABLE_AVAILABILITIES)[number];

export const ACTIVITY_KINDS = ["system", "terminal", "driver", "plan", "dispatcher"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type ActivitySeverity = (typeof ACTIVITY_SEVERITIES)[number];

/** Categories used by the dashboard's local planner (src/lib/demo). */
export const RECOMMENDATION_CATEGORIES = ["ready", "awaiting-verification", "blocked"] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];

/** Where a driver report came from. Set by the server, never by the request body. */
export const DRIVER_REPORT_SOURCES = ["dispatcher", "retell", "scenario"] as const;
export type DriverReportSource = (typeof DRIVER_REPORT_SOURCES)[number];

export const CRITICALITY_BASES = ["government_designated", "third_party_verified", "self_declared", "none"] as const;
export type CriticalityBasis = (typeof CRITICALITY_BASES)[number];

/* --------------------------------------------------------------- entities */

export interface Terminal {
  id: TerminalId;
  shortName: string;
  name: string;
  /** Status of the appointment/scheduling system — not physical closure. */
  portalStatus: TerminalPortalStatus;
}

export interface Customer {
  id: string;
  name: string;
  customerType?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  city?: string | null;
}

export interface TimeWindow {
  start: IsoDateTime;
  end: IsoDateTime;
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
  approvedAt: IsoDateTime;
  /** Approval is recorded only; nothing is sent to drivers. */
  simulated: true;
}

/**
 * Criticality tier: 3 government-designated, 2 third-party verified,
 * 1 self-declared, 0 none stated. Ranking key for the recovery queue.
 */
export type CriticalityTier = 0 | 1 | 2 | 3;

export interface Job {
  id: string;
  container: string;
  customerId: string;
  terminalId: TerminalId;
  priority: Priority;
  /**
   * Delivery deadline. When a dataset supplies only a harm deadline (the
   * scenario CSVs do), this holds the same value as `harmDeadline`.
   */
  deadline: IsoDateTime;
  appointment: Appointment;
  /** null = unknown. */
  containerAvailable: boolean | null;
  /** When containerAvailable was observed (synthetic tracking snapshot). */
  containerAvailabilityAsOf?: IsoDateTime | null;
  holds: HoldType[];
  requiredEquipment: EquipmentType;
  approval: DispatcherApproval | null;
  tier?: CriticalityTier;
  /** How the criticality claim is supported; kept separate from the tier. */
  criticalityBasis?: CriticalityBasis | null;
  criticalityStatedBy?: string | null;
  /** What happens to the receiver if this move is late. */
  consequence?: string;
  /** When delay starts causing real harm; may be earlier than `deadline`. Ranking and feasibility use it. */
  harmDeadline?: IsoDateTime;
  /** Driver assigned in the source data. History; the recovery engine decides whether it is still reserved. */
  originalAssignedDriverId?: string | null;
  cargoDescription?: string | null;
  lastFreeDay?: IsoDate | null;
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
  /** Earliest time the driver can start a new move. null = unknown. */
  availableFrom: IsoDateTime | null;
  /** Most recent status report. null = never reported. */
  lastReport: IsoDateTime | null;
  lastNote: string;
  busy: BusySlot[];
  /** End of the reported availability window. null/absent = no end reported. */
  availableUntil?: IsoDateTime | null;
  /** Last reported location. null = unknown. */
  location?: string | null;
}

export interface ActivityEvent {
  id: number;
  at: IsoDateTime;
  kind: ActivityKind;
  severity: ActivitySeverity;
  message: string;
}

export interface RecoveryCheck {
  label: string;
  result: "pass" | "fail" | "skip";
  detail: string;
}

/** Dashboard-local planner output (src/lib/demo/recovery-heuristic.ts). */
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
  generatedAt: IsoDateTime;
  inputsVersion: number;
  status: "current" | "invalidated";
  invalidatedReason: string | null;
  recommendations: Recommendation[];
}

/* ------------------------------------------- recovery queue (backend engine) */

/** Team-standard job statuses (AGENTS.md). */
export const RECOVERY_STATUSES = ["ready_for_approval", "awaiting_verification", "blocked"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export interface ReservationWindow {
  driverId: string;
  jobId: string;
  /** Departure toward the pickup (includes the estimated travel time). */
  start: IsoDateTime;
  /** Pickup start + job reservation (pickup and delivery). */
  end: IsoDateTime;
  kind: "existing_assignment" | "proposed";
}

export interface ProposedAssignment {
  driverId: string;
  departAt: IsoDateTime;
  pickupAt: IsoDateTime;
  completeBy: IsoDateTime;
  travelMinutes: number;
}

export interface RecoveryQueueEntry {
  rank: number;
  jobId: string;
  criticalityTier: CriticalityTier | null;
  criticalityBasis: CriticalityBasis | null;
  harmDeadline: IsoDateTime;
  status: RecoveryStatus;
  /** Machine-readable blocker, e.g. "appointment_unverified", "no_feasible_assignment". */
  blocker: string | null;
  /** Who resolves the blocker / takes the next action. */
  owner: string;
  nextAction: string;
  proposedDriverId: string | null;
  proposal: ProposedAssignment | null;
  originalAssignedDriverId: string | null;
  checks: RecoveryCheck[];
}

export interface RecoveryQueue {
  computedAt: IsoDateTime;
  /** Label for the synthetic timing estimates used in feasibility checks. */
  estimatesLabel: string;
  entries: RecoveryQueueEntry[];
  /** Existing assignments kept outside the recovery scope plus proposals in this queue. */
  reservations: ReservationWindow[];
}

/* ------------------------------------------------------ backend additions */

/** A stored driver status report, with provenance preserved. */
export interface DriverReport {
  id: string;
  driverId: string;
  source: DriverReportSource;
  /** Unique per source; used to deduplicate retried deliveries (e.g. Retell webhooks). */
  providerEventId: string;
  /** When the driver gave the report, per the source. */
  reportedAt: IsoDateTime;
  /** When the server stored the report (real-world instant). */
  receivedAt: IsoDateTime;
  /** Simulated-clock time at which the report was applied to the driver. */
  appliedAt: IsoDateTime | null;
  availability: ReportableAvailability;
  availableFrom: IsoDateTime;
  availableUntil: IsoDateTime | null;
  location: string | null;
  equipment: EquipmentType[] | null;
  note: string;
}

/** A value the dataset does not supply; reported instead of invented. */
export interface UnknownValue {
  entity: "scenario" | "terminal" | "customer" | "driver" | "job";
  id: string;
  field: string;
  reason: string;
}

export interface ScenarioInfo {
  id: string;
  version: number;
  timeZone: string;
}

/** Operational state, as returned by GET /api/state. Partial data is allowed. */
export interface OperationalSnapshot {
  scenario: ScenarioInfo | null;
  /** Simulated clock. null if the scenario clock is not set. */
  now: IsoDateTime | null;
  /** Increments whenever an operational input changes. */
  inputsVersion: number | null;
  terminals: Terminal[];
  customers: Customer[];
  jobs: Job[];
  drivers: Driver[];
  /** Newest first. */
  events: ActivityEvent[];
  /** Ranked recovery queue computed by the backend engine; null if it cannot be computed. */
  recoveryQueue: RecoveryQueue | null;
  /** Every null/unknown value in this snapshot, with the reason. */
  unknowns: UnknownValue[];
}
