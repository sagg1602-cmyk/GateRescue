/**
 * TEMPORARY FRONTEND TYPES — GateRescue dispatcher dashboard demo.
 *
 * No shared/backend types existed when this module was written. These shapes
 * exist only so the UI can run against local synthetic data. When the shared
 * schema (Supabase / API) lands, replace imports of this module with the shared
 * types and adapt the mapping in one place rather than inside components.
 *
 * Timestamps are ISO-like local strings without a timezone
 * ("2026-10-17T07:30:00") on a single simulated incident day.
 */

export type IsoLocal = string;

export type TerminalId = "term-a" | "term-b";
export type TerminalPortalStatus = "online" | "outage" | "reconciling";

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

export type EquipmentType = "chassis-40" | "chassis-20" | "reefer-40" | "triaxle";

export type Priority = "critical" | "high" | "normal";

export type AppointmentStatus = "confirmed" | "unverified" | "none" | "lost";

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

export type HoldType = "customs" | "freight" | "usda";

/**
 * Criticality tier: 3 government-designated, 2 third-party verified,
 * 1 self-declared, 0 none stated.
 */
export type CriticalityTier = 0 | 1 | 2 | 3;

export interface DispatcherApproval {
  driverId: string;
  approvedAt: IsoLocal;
  /** Approval is recorded locally only; nothing is sent to drivers. */
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
  tier?: CriticalityTier;
  /** What happens to the receiver if this move is late. */
  consequence?: string;
  /** When delay starts causing real harm; may be earlier than `deadline`. */
  harmDeadline?: IsoLocal;
}

export type DriverAvailability = "available" | "on-job" | "off-duty" | "unreachable";

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

export type ActivityKind = "system" | "terminal" | "driver" | "plan" | "dispatcher";
export type ActivitySeverity = "info" | "success" | "warning" | "critical";

export interface ActivityEvent {
  id: number;
  at: IsoLocal;
  kind: ActivityKind;
  severity: ActivitySeverity;
  message: string;
}

export type RecommendationCategory = "ready" | "awaiting-verification" | "blocked";

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
