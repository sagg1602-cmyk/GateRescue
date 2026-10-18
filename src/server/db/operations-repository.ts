import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityEvent,
  AppointmentStatus,
  BusySlot,
  Driver,
  DriverReport,
  Job,
  OperationalSnapshot,
  RecoveryPlan,
  Terminal,
} from "@/lib/shared/operational-types";
import type { ApplyDriverReportInput, ApplyDriverReportResult, DriverReportStore } from "../services/driver-report-service";
import { DriverNotFoundError } from "../services/driver-report-service";

/* ------------------------------------------------------------- row shapes */
// Column names as defined in supabase/migrations/*_operational_schema.sql.

interface TerminalRow { id: Terminal["id"]; short_name: string; name: string; portal_status: Terminal["portalStatus"] }
interface CustomerRow { id: string; name: string }
interface DriverRow {
  id: string; name: string; equipment: Driver["equipment"]; availability: Driver["availability"];
  available_from: string | null; last_report: string | null; last_note: string;
}
interface BusySlotRow { driver_id: string; start_at: string; end_at: string; label: string; job_id: string | null }
interface JobRow {
  id: string; container: string; customer_id: string; terminal_id: Job["terminalId"]; priority: Job["priority"];
  deadline: string; appointment_status: AppointmentStatus; appointment_start: string | null; appointment_end: string | null;
  pre_outage_status: AppointmentStatus | null; pre_outage_start: string | null; pre_outage_end: string | null;
  container_available: boolean | null; holds: Job["holds"]; required_equipment: Job["requiredEquipment"];
  approval_driver_id: string | null; approval_at: string | null;
}
interface EventRow { id: number; at: string; kind: ActivityEvent["kind"]; severity: ActivityEvent["severity"]; message: string }
interface PlanRow {
  id: number; generated_at: string; inputs_version: number; status: RecoveryPlan["status"];
  invalidated_reason: string | null; recommendations: RecoveryPlan["recommendations"];
}
interface DemoStateRow { sim_now: string; inputs_version: number }
interface DriverReportRow {
  id: string; driver_id: string; source: DriverReport["source"]; provider_event_id: string;
  reported_at: string; received_at: string; applied_at: string | null;
  availability: DriverReport["availability"]; available_from: string; note: string;
}

/* ---------------------------------------------------------------- mappers */

/**
 * The database may hold NULL where the source dataset supplies no value
 * (see docs/dataset-import.md). The shared types require these fields, so the
 * API refuses to serve them rather than inventing values.
 */
export class DatasetIncompleteError extends Error {
  constructor(readonly missing: string[]) {
    super(`Dataset incomplete — values not supplied: ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ` (+${missing.length - 12} more)` : ""}`);
    this.name = "DatasetIncompleteError";
  }
}

/** Asserts a value collectMissing() already checked; never substitutes a default. */
function present<T>(value: T | null, field: string): T {
  if (value === null) throw new DatasetIncompleteError([field]);
  return value;
}

function collectMissing(drivers: DriverRow[], jobs: JobRow[], demo: DemoStateRow | null): string[] {
  const missing: string[] = [];
  if (!demo) missing.push("demo_state.sim_now");
  for (const d of drivers) {
    if (d.available_from === null) missing.push(`drivers.${d.id}.available_from`);
    if (d.last_report === null) missing.push(`drivers.${d.id}.last_report`);
  }
  for (const j of jobs) {
    if (j.container_available === null) missing.push(`jobs.${j.id}.container_available`);
  }
  return missing;
}

/** Normalizes Postgres timestamp output to the IsoLocal "YYYY-MM-DDTHH:MM:SS" form. */
function local(value: string): string {
  return value.replace(" ", "T").slice(0, 19);
}

function toWindow(start: string | null, end: string | null) {
  return start && end ? { start: local(start), end: local(end) } : null;
}

function mapDriver(row: DriverRow, slots: BusySlotRow[]): Driver {
  return {
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    availability: row.availability,
    availableFrom: local(present(row.available_from, `drivers.${row.id}.available_from`)),
    lastReport: local(present(row.last_report, `drivers.${row.id}.last_report`)),
    lastNote: row.last_note,
    busy: slots
      .filter((s) => s.driver_id === row.id)
      .map((s): BusySlot => ({
        start: local(s.start_at),
        end: local(s.end_at),
        label: s.label,
        ...(s.job_id ? { jobId: s.job_id } : {}),
      })),
  };
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    container: row.container,
    customerId: row.customer_id,
    terminalId: row.terminal_id,
    priority: row.priority,
    deadline: local(row.deadline),
    appointment: {
      status: row.appointment_status,
      window: toWindow(row.appointment_start, row.appointment_end),
      preOutage: row.pre_outage_status
        ? { status: row.pre_outage_status, window: toWindow(row.pre_outage_start, row.pre_outage_end) }
        : null,
    },
    containerAvailable: present(row.container_available, `jobs.${row.id}.container_available`),
    holds: row.holds,
    requiredEquipment: row.required_equipment,
    approval:
      row.approval_driver_id && row.approval_at
        ? { driverId: row.approval_driver_id, approvedAt: local(row.approval_at), simulated: true }
        : null,
  };
}

function mapPlan(row: PlanRow): RecoveryPlan {
  return {
    id: Number(row.id),
    generatedAt: local(row.generated_at),
    inputsVersion: row.inputs_version,
    status: row.status,
    invalidatedReason: row.invalidated_reason,
    recommendations: row.recommendations,
  };
}

function mapDriverReport(row: DriverReportRow): DriverReport {
  return {
    id: row.id,
    driverId: row.driver_id,
    source: row.source,
    providerEventId: row.provider_event_id,
    reportedAt: new Date(row.reported_at).toISOString(),
    receivedAt: new Date(row.received_at).toISOString(),
    appliedAt: row.applied_at ? local(row.applied_at) : null,
    availability: row.availability,
    availableFrom: row.available_from.slice(0, 5),
    note: row.note,
  };
}

/* ------------------------------------------------------------- repository */

function unwrap<T>(label: string, result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${label}: no data`);
  return result.data;
}

/** Number of activity events returned in a snapshot (newest first). */
export const SNAPSHOT_EVENT_LIMIT = 200;

export class OperationsRepository implements DriverReportStore {
  constructor(private readonly db: SupabaseClient) {}

  async getSnapshot(): Promise<OperationalSnapshot> {
    const [state, terminals, customers, drivers, slots, jobs, events, plans] = await Promise.all([
      this.db.from("demo_state").select("sim_now, inputs_version").eq("id", 1).maybeSingle<DemoStateRow>(),
      this.db.from("terminals").select("*").order("id").overrideTypes<TerminalRow[], { merge: false }>(),
      this.db.from("customers").select("*").order("id").overrideTypes<CustomerRow[], { merge: false }>(),
      this.db.from("drivers").select("*").order("id").overrideTypes<DriverRow[], { merge: false }>(),
      this.db.from("driver_busy_slots").select("driver_id, start_at, end_at, label, job_id").order("start_at").overrideTypes<BusySlotRow[], { merge: false }>(),
      this.db.from("jobs").select("*").order("id").overrideTypes<JobRow[], { merge: false }>(),
      this.db.from("activity_events").select("*").order("at", { ascending: false }).order("id", { ascending: false }).limit(SNAPSHOT_EVENT_LIMIT).overrideTypes<EventRow[], { merge: false }>(),
      this.db.from("recovery_plans").select("*").order("id", { ascending: false }).limit(1).overrideTypes<PlanRow[], { merge: false }>(),
    ]);

    if (state.error) throw new Error(`demo_state: ${state.error.message}`);
    const driverRows = unwrap("drivers", drivers);
    const jobRows = unwrap("jobs", jobs);
    const missing = collectMissing(driverRows, jobRows, state.data);
    if (missing.length || !state.data) throw new DatasetIncompleteError(missing);
    const demo = state.data;
    const slotRows = unwrap("driver_busy_slots", slots);
    const planRows = unwrap("recovery_plans", plans);

    return {
      now: local(demo.sim_now),
      inputsVersion: demo.inputs_version,
      terminals: unwrap("terminals", terminals).map((t) => ({
        id: t.id,
        shortName: t.short_name,
        name: t.name,
        portalStatus: t.portal_status,
      })),
      customers: unwrap("customers", customers),
      jobs: jobRows.map(mapJob),
      drivers: driverRows.map((d) => mapDriver(d, slotRows)),
      events: unwrap("activity_events", events).map((e) => ({ ...e, id: Number(e.id), at: local(e.at) })),
      plan: planRows[0] ? mapPlan(planRows[0]) : null,
    };
  }

  async getDriver(driverId: string): Promise<Driver | null> {
    const [driver, slots] = await Promise.all([
      this.db.from("drivers").select("*").eq("id", driverId).maybeSingle<DriverRow>(),
      this.db.from("driver_busy_slots").select("driver_id, start_at, end_at, label, job_id").eq("driver_id", driverId).order("start_at").overrideTypes<BusySlotRow[], { merge: false }>(),
    ]);
    if (driver.error) throw new Error(`drivers: ${driver.error.message}`);
    if (!driver.data) return null;
    const missing = collectMissing([driver.data], [], { sim_now: "", inputs_version: 0 });
    if (missing.length) throw new DatasetIncompleteError(missing);
    return mapDriver(driver.data, unwrap("driver_busy_slots", slots));
  }

  async applyDriverReport(input: ApplyDriverReportInput): Promise<ApplyDriverReportResult> {
    const { data, error } = await this.db.rpc("apply_driver_report", {
      p_driver_id: input.driverId,
      p_source: input.source,
      p_provider_event_id: input.providerEventId,
      p_reported_at: input.reportedAt,
      p_availability: input.availability,
      p_available_from: input.availableFrom,
      p_note: input.note,
    });
    if (error) {
      if (error.code === "P0002") throw new DriverNotFoundError(input.driverId);
      // Raised by apply_driver_report() when the simulated clock was never set.
      if (error.message.includes("demo_state row missing")) throw new DatasetIncompleteError(["demo_state.sim_now"]);
      throw new Error(`apply_driver_report: ${error.message}`);
    }
    const result = data as {
      duplicate: boolean;
      report: DriverReportRow;
      inputs_version: number;
      plan_invalidated: boolean;
    };
    return {
      duplicate: result.duplicate,
      report: mapDriverReport(result.report),
      inputsVersion: result.inputs_version,
      planInvalidated: result.plan_invalidated,
    };
  }
}
