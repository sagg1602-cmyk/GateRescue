import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityEvent,
  AppointmentStatus,
  BusySlot,
  Customer,
  Driver,
  DriverReport,
  Job,
  OperationalSnapshot,
  ScenarioInfo,
  Terminal,
  UnknownValue,
} from "@/lib/shared/operational-types";
import { toZonedIso } from "@/lib/shared/datetime";
import { buildRecoveryQueue } from "@/lib/recovery/engine";
import { getScenarioConfig } from "@/lib/recovery/scenario-registry";
import type { ApplyDriverReportInput, ApplyDriverReportResult, DriverReportStore } from "../services/driver-report-service";
import { DriverNotFoundError } from "../services/driver-report-service";

/* ------------------------------------------------------------- row shapes */
// Column names as defined in supabase/migrations/*.sql. Timestamps are
// timestamptz, returned by PostgREST in UTC ("…+00:00").

interface TerminalRow { id: Terminal["id"]; short_name: string; name: string; portal_status: Terminal["portalStatus"] }
interface CustomerRow {
  id: string; name: string; customer_type: string | null; contact_name: string | null;
  contact_phone: string | null; city: string | null;
}
interface DriverRow {
  id: string; name: string; equipment: Driver["equipment"]; availability: Driver["availability"];
  available_from: string | null; available_until: string | null; last_report: string | null;
  last_note: string; location: string | null;
}
interface BusySlotRow { driver_id: string; start_at: string; end_at: string; label: string; job_id: string | null }
interface JobRow {
  id: string; container: string; customer_id: string; terminal_id: Job["terminalId"]; priority: Job["priority"];
  deadline: string; appointment_status: AppointmentStatus; appointment_start: string | null; appointment_end: string | null;
  pre_outage_status: AppointmentStatus | null; pre_outage_start: string | null; pre_outage_end: string | null;
  container_available: boolean | null; container_status_as_of: string | null; holds: Job["holds"];
  required_equipment: Job["requiredEquipment"]; approval_driver_id: string | null; approval_at: string | null;
  criticality_tier: Job["tier"] | null; criticality_basis: Job["criticalityBasis"] | null;
  criticality_stated_by: string | null; assigned_driver_id: string | null; cargo_description: string | null;
  last_free_day: string | null;
}
interface EventRow { id: number; at: string; kind: ActivityEvent["kind"]; severity: ActivityEvent["severity"]; message: string }
interface DemoStateRow {
  sim_now: string; inputs_version: number; scenario_id: string | null; scenario_version: number | null; time_zone: string;
}
interface DriverReportRow {
  id: string; driver_id: string; source: DriverReport["source"]; provider_event_id: string;
  reported_at: string; received_at: string; applied_at: string | null; availability: DriverReport["availability"];
  available_from: string; available_until: string | null; location: string | null;
  equipment: DriverReport["equipment"]; note: string;
}

/** Scenario time zone used when demo_state is missing. */
const DEFAULT_TIME_ZONE = "America/Los_Angeles";

/**
 * Raised when an operation needs the simulated clock (demo_state) and it is
 * missing. GET /api/state never raises it; it returns partial data instead.
 */
export class DatasetIncompleteError extends Error {
  constructor(readonly missing: string[]) {
    super(`Dataset incomplete — values not supplied: ${missing.join(", ")}`);
    this.name = "DatasetIncompleteError";
  }
}

/* ---------------------------------------------------------------- mappers */

function makeMappers(timeZone: string) {
  const zoned = (value: string) => toZonedIso(value, timeZone);
  const zonedOrNull = (value: string | null) => (value === null ? null : zoned(value));
  const window = (start: string | null, end: string | null) => (start && end ? { start: zoned(start), end: zoned(end) } : null);

  return {
    zoned,
    driver(row: DriverRow, slots: BusySlotRow[]): Driver {
      return {
        id: row.id,
        name: row.name,
        equipment: row.equipment,
        availability: row.availability,
        availableFrom: zonedOrNull(row.available_from),
        availableUntil: zonedOrNull(row.available_until),
        lastReport: zonedOrNull(row.last_report),
        lastNote: row.last_note,
        location: row.location,
        busy: slots
          .filter((s) => s.driver_id === row.id)
          .map((s): BusySlot => ({
            start: zoned(s.start_at),
            end: zoned(s.end_at),
            label: s.label,
            ...(s.job_id ? { jobId: s.job_id } : {}),
          })),
      };
    },
    job(row: JobRow): Job {
      return {
        id: row.id,
        container: row.container,
        customerId: row.customer_id,
        terminalId: row.terminal_id,
        priority: row.priority,
        deadline: zoned(row.deadline),
        appointment: {
          status: row.appointment_status,
          window: window(row.appointment_start, row.appointment_end),
          preOutage: row.pre_outage_status
            ? { status: row.pre_outage_status, window: window(row.pre_outage_start, row.pre_outage_end) }
            : null,
        },
        containerAvailable: row.container_available,
        containerAvailabilityAsOf: zonedOrNull(row.container_status_as_of),
        holds: row.holds,
        requiredEquipment: row.required_equipment,
        approval:
          row.approval_driver_id && row.approval_at
            ? { driverId: row.approval_driver_id, approvedAt: zoned(row.approval_at), simulated: true }
            : null,
        // jobs.deadline holds the harm deadline supplied by the dataset.
        harmDeadline: zoned(row.deadline),
        ...(row.criticality_tier !== null ? { tier: row.criticality_tier } : {}),
        criticalityBasis: row.criticality_basis,
        criticalityStatedBy: row.criticality_stated_by,
        originalAssignedDriverId: row.assigned_driver_id,
        cargoDescription: row.cargo_description,
        lastFreeDay: row.last_free_day,
      };
    },
    customer(row: CustomerRow): Customer {
      return {
        id: row.id,
        name: row.name,
        customerType: row.customer_type,
        contactName: row.contact_name,
        contactPhone: row.contact_phone,
        city: row.city,
      };
    },
    report(row: DriverReportRow): DriverReport {
      return {
        id: row.id,
        driverId: row.driver_id,
        source: row.source,
        providerEventId: row.provider_event_id,
        reportedAt: zoned(row.reported_at),
        receivedAt: new Date(row.received_at).toISOString(),
        appliedAt: zonedOrNull(row.applied_at),
        availability: row.availability,
        availableFrom: zoned(row.available_from),
        availableUntil: zonedOrNull(row.available_until),
        location: row.location,
        equipment: row.equipment,
        note: row.note,
      };
    },
  };
}

/** Lists every unknown value so the dashboard can show it explicitly. */
export function listUnknowns(drivers: Driver[], jobs: Job[], hasClock: boolean): UnknownValue[] {
  const unknowns: UnknownValue[] = [];
  if (!hasClock) {
    unknowns.push({ entity: "scenario", id: "demo_state", field: "now", reason: "Simulated clock not set; run the scenario import" });
  }
  for (const d of drivers) {
    const reason = d.availability === "not-reported" ? "Driver has not reported yet" : "Not supplied by the dataset";
    if (d.availableFrom === null) unknowns.push({ entity: "driver", id: d.id, field: "availableFrom", reason });
    if (d.lastReport === null) unknowns.push({ entity: "driver", id: d.id, field: "lastReport", reason });
    if (d.location === null) unknowns.push({ entity: "driver", id: d.id, field: "location", reason });
  }
  for (const j of jobs) {
    if (j.containerAvailable === null) {
      unknowns.push({ entity: "job", id: j.id, field: "containerAvailable", reason: "Not supplied by the dataset" });
    }
    if (j.tier === undefined) unknowns.push({ entity: "job", id: j.id, field: "tier", reason: "Not supplied by the dataset" });
  }
  return unknowns;
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

  private async timeZone(): Promise<string> {
    const { data } = await this.db.from("demo_state").select("time_zone").eq("id", 1).maybeSingle<{ time_zone: string }>();
    return data?.time_zone ?? DEFAULT_TIME_ZONE;
  }

  async getSnapshot(): Promise<OperationalSnapshot> {
    const [state, terminals, customers, drivers, slots, jobs, events] = await Promise.all([
      this.db.from("demo_state").select("sim_now, inputs_version, scenario_id, scenario_version, time_zone").eq("id", 1).maybeSingle<DemoStateRow>(),
      this.db.from("terminals").select("id, short_name, name, portal_status").order("id").overrideTypes<TerminalRow[], { merge: false }>(),
      this.db.from("customers").select("*").order("id").overrideTypes<CustomerRow[], { merge: false }>(),
      this.db.from("drivers").select("*").order("id").overrideTypes<DriverRow[], { merge: false }>(),
      this.db.from("driver_busy_slots").select("driver_id, start_at, end_at, label, job_id").order("start_at").overrideTypes<BusySlotRow[], { merge: false }>(),
      this.db.from("jobs").select("*").order("id").overrideTypes<JobRow[], { merge: false }>(),
      this.db.from("activity_events").select("id, at, kind, severity, message").order("at", { ascending: false }).order("id", { ascending: false }).limit(SNAPSHOT_EVENT_LIMIT).overrideTypes<EventRow[], { merge: false }>(),
    ]);
    if (state.error) throw new Error(`demo_state: ${state.error.message}`);

    const demo = state.data;
    const timeZone = demo?.time_zone ?? DEFAULT_TIME_ZONE;
    const map = makeMappers(timeZone);
    const slotRows = unwrap("driver_busy_slots", slots);
    const mappedTerminals = unwrap("terminals", terminals).map((t) => ({
      id: t.id,
      shortName: t.short_name,
      name: t.name,
      portalStatus: t.portal_status,
    }));
    const mappedJobs = unwrap("jobs", jobs).map(map.job);
    const mappedDrivers = unwrap("drivers", drivers).map((d) => map.driver(d, slotRows));
    const now = demo ? map.zoned(demo.sim_now) : null;

    const scenario: ScenarioInfo | null =
      demo?.scenario_id && demo.scenario_version !== null
        ? { id: demo.scenario_id, version: demo.scenario_version, timeZone }
        : null;
    const unknowns = listUnknowns(mappedDrivers, mappedJobs, Boolean(demo));
    const config = scenario ? getScenarioConfig(scenario.id, scenario.version) : null;
    if (scenario && !config) {
      unknowns.push({ entity: "scenario", id: scenario.id, field: "config", reason: `No configuration for ${scenario.id} v${scenario.version}` });
    }

    return {
      scenario,
      now,
      inputsVersion: demo?.inputs_version ?? null,
      terminals: mappedTerminals,
      customers: unwrap("customers", customers).map(map.customer),
      jobs: mappedJobs,
      drivers: mappedDrivers,
      events: unwrap("activity_events", events).map((e) => ({ ...e, id: Number(e.id), at: map.zoned(e.at) })),
      recoveryQueue:
        now && config
          ? buildRecoveryQueue({
              now,
              timeZone,
              jobs: mappedJobs,
              drivers: mappedDrivers,
              terminals: mappedTerminals,
              config: config.recovery,
            })
          : null,
      unknowns,
    };
  }

  async getDriver(driverId: string): Promise<Driver | null> {
    const [driver, slots, timeZone] = await Promise.all([
      this.db.from("drivers").select("*").eq("id", driverId).maybeSingle<DriverRow>(),
      this.db.from("driver_busy_slots").select("driver_id, start_at, end_at, label, job_id").eq("driver_id", driverId).order("start_at").overrideTypes<BusySlotRow[], { merge: false }>(),
      this.timeZone(),
    ]);
    if (driver.error) throw new Error(`drivers: ${driver.error.message}`);
    return driver.data ? makeMappers(timeZone).driver(driver.data, unwrap("driver_busy_slots", slots)) : null;
  }

  async applyDriverReport(input: ApplyDriverReportInput): Promise<ApplyDriverReportResult> {
    const { data, error } = await this.db.rpc("apply_driver_report", {
      p_driver_id: input.driverId,
      p_source: input.source,
      p_provider_event_id: input.providerEventId,
      p_reported_at: input.reportedAt,
      p_availability: input.availability,
      p_available_from: input.availableFrom,
      p_available_until: input.availableUntil,
      p_location: input.location,
      p_equipment: input.equipment,
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
      report: makeMappers(await this.timeZone()).report(result.report),
      inputsVersion: result.inputs_version,
      planInvalidated: result.plan_invalidated,
    };
  }
}
