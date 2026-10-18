/**
 * Builds the operational dataset from the scenario owner's CSVs plus the
 * versioned scenario configuration. Single mapping used by both the SQL
 * import generator (scripts/import-authoritative-csv.mjs) and the tests.
 *
 * CSV values are kept verbatim in `source`; scenario decisions are applied on
 * top and labelled; anything still unknown stays null.
 */

import type {
  ActivityEvent,
  CriticalityBasis,
  CriticalityTier,
  Customer,
  Driver,
  EquipmentType,
  HoldType,
  Job,
  Priority,
  Terminal,
  TerminalId,
} from "../shared/operational-types.ts";
import { compareIso, isIsoDateTime } from "../shared/datetime.ts";
import { parseCsvRecords } from "./csv.ts";
import type { ScenarioConfig } from "./scenario-config.ts";

export const CSV_HEADERS = {
  customers: "customer_id,name,customer_type,contact_name,contact_phone,city,data_origin",
  drivers: "driver_id,name,phone,equipment,status_at_start,available_from,location_at_start,checked_in,data_origin",
  jobs: "job_id,customer_id,container_id,cargo_description,container_type,terminal,appointment_start,appointment_end,appointment_status,assigned_driver_id,criticality_tier,criticality_basis,criticality_stated_by,harm_deadline,hold_type,last_free_day,data_origin",
} as const;

/* ---------------------------------------------------------------- mappings */

const TERMINAL_IDS: Record<string, TerminalId> = { "Terminal A": "term-a", "Terminal B": "term-b", "Terminal C": "term-c" };

/** Source container/equipment type → operational equipment. reefer_20/unknown are unsupported and fail. */
export const EQUIPMENT_FROM_SOURCE: Record<string, EquipmentType> = {
  dry_20: "chassis-20",
  dry_40: "chassis-40",
  reefer_40: "reefer-40",
};

const AVAILABILITY_FROM_SOURCE = { available: "available", busy: "on-job", not_reported: "not-reported" } as const;

/** Display priority for the dashboard; ranking uses the numeric tier, not this. */
const PRIORITY_FROM_TIER: Record<string, Priority> = { "3": "critical", "2": "critical", "1": "high", "0": "normal" };

const CRITICALITY_BASES: Record<string, CriticalityBasis> = {
  government_designated: "government_designated",
  third_party_verified: "third_party_verified",
  self_declared: "self_declared",
  none: "none",
};

const HOLDS_FROM_SOURCE: Record<string, HoldType[]> = { none: [], customs: ["customs"], freight: ["freight"] };

/* ------------------------------------------------------------------ output */

export interface DriverSource {
  phone: string | null;
  sourceEquipment: string;
  sourceStatus: string;
  checkedIn: boolean;
  dataOrigin: string;
}

export interface JobSource {
  sourceContainerType: string;
  sourceTerminal: string;
  sourceAppointmentStatus: string;
  dataOrigin: string;
}

export interface ScenarioDataset {
  scenario: { id: string; version: number; timeZone: string };
  /** Simulated clock after the import-applied events. */
  simNow: string;
  terminals: Terminal[];
  customers: (Customer & { dataOrigin: string })[];
  drivers: { driver: Driver; source: DriverSource }[];
  jobs: { job: Job; source: JobSource }[];
  /** Oldest first; ids assigned by the database. */
  events: Omit<ActivityEvent, "id">[];
}

export interface SourceCsvs {
  customers: string;
  drivers: string;
  jobs: string;
}

class DatasetErrors {
  readonly problems: string[] = [];
  need(ok: unknown, message: string) {
    if (!ok) this.problems.push(message);
  }
  map<T>(table: Record<string, T>, value: string, where: string): T {
    this.need(value in table, `${where}: unsupported value "${value}"`);
    return table[value];
  }
  iso(value: string, where: string): string {
    this.need(isIsoDateTime(value), `${where}: expected ISO date-time with offset, got "${value}"`);
    return value;
  }
  throwIfAny() {
    if (this.problems.length) throw new Error(`Dataset problems:\n  - ${this.problems.join("\n  - ")}`);
  }
}

/**
 * Builds the start-of-scenario dataset and applies every event marked
 * `appliedBy: "import"` (the Terminal A scheduling outage). Driver reports
 * (`appliedBy: "api"`) are left for the report endpoint.
 */
export function buildScenarioDataset(csv: SourceCsvs, config: ScenarioConfig): ScenarioDataset {
  const err = new DatasetErrors();
  const customersCsv = parseCsvRecords(csv.customers, CSV_HEADERS.customers, "customers");
  const driversCsv = parseCsvRecords(csv.drivers, CSV_HEADERS.drivers, "drivers");
  const jobsCsv = parseCsvRecords(csv.jobs, CSV_HEADERS.jobs, "jobs");

  const reported = new Set(config.driverStartState.reportedDrivers.driverIds);
  const notReported = new Set(config.driverStartState.notReportedDrivers.driverIds);
  const driverIds = new Set(driversCsv.map((d) => d.driver_id));
  const customerIds = new Set(customersCsv.map((c) => c.customer_id));

  const customers = customersCsv.map((c) => ({
    id: c.customer_id,
    name: c.name,
    customerType: c.customer_type || null,
    contactName: c.contact_name || null,
    contactPhone: c.contact_phone || null,
    city: c.city || null,
    dataOrigin: c.data_origin,
  }));

  const drivers = driversCsv.map((d) => {
    const at = `drivers ${d.driver_id}`;
    err.need(["true", "false"].includes(d.checked_in), `${at}: checked_in must be true/false`);
    err.need(reported.has(d.driver_id) !== notReported.has(d.driver_id), `${at}: must be in exactly one scenario driver start group`);
    const isNotReported = notReported.has(d.driver_id);
    err.need(!isNotReported || d.status_at_start === "not_reported", `${at}: scenario says not reported but CSV status is ${d.status_at_start}`);
    const driver: Driver = {
      id: d.driver_id,
      name: d.name,
      equipment: [err.map(EQUIPMENT_FROM_SOURCE, d.equipment, `${at} equipment`)],
      availability: err.map(AVAILABILITY_FROM_SOURCE, d.status_at_start, `${at} status_at_start`),
      // Scenario decision: keep CSV availability times; unknown for not-reported drivers.
      availableFrom: isNotReported || !d.available_from ? null : err.iso(d.available_from, `${at} available_from`),
      lastReport: isNotReported ? null : config.driverStartState.reportedDrivers.lastReportAt,
      lastNote: "",
      busy: [],
      availableUntil: null,
      location: isNotReported ? null : d.location_at_start || null,
    };
    const source: DriverSource = {
      phone: d.phone || null,
      sourceEquipment: d.equipment,
      sourceStatus: d.status_at_start,
      checkedIn: d.checked_in === "true",
      dataOrigin: d.data_origin,
    };
    return { driver, source };
  });

  const terminals: Terminal[] = [...new Set(jobsCsv.map((j) => j.terminal))].sort().map((name) => ({
    id: err.map(TERMINAL_IDS, name, "jobs terminal"),
    shortName: name,
    name, // the dataset supplies no longer terminal name
    portalStatus: "online",
  }));

  const tracking = config.containerTracking;
  const jobs = jobsCsv.map((j) => {
    const at = `jobs ${j.job_id}`;
    err.need(customerIds.has(j.customer_id), `${at}: unknown customer_id ${j.customer_id}`);
    err.need(!j.assigned_driver_id || driverIds.has(j.assigned_driver_id), `${at}: unknown assigned_driver_id`);
    err.need(["confirmed", "unverified"].includes(j.appointment_status), `${at}: appointment_status "${j.appointment_status}"`);
    const tier = Number(j.criticality_tier);
    err.need(Number.isInteger(tier) && tier >= 0 && tier <= 3, `${at}: criticality_tier "${j.criticality_tier}"`);
    const window = {
      start: err.iso(j.appointment_start, `${at} appointment_start`),
      end: err.iso(j.appointment_end, `${at} appointment_end`),
    };
    const job: Job = {
      id: j.job_id,
      container: j.container_id,
      customerId: j.customer_id,
      terminalId: err.map(TERMINAL_IDS, j.terminal, `${at} terminal`),
      priority: err.map(PRIORITY_FROM_TIER, String(tier), `${at} criticality_tier`),
      // The CSV supplies only a harm deadline; it is also used as the delivery deadline.
      deadline: err.iso(j.harm_deadline, `${at} harm_deadline`),
      harmDeadline: j.harm_deadline,
      appointment: { status: j.appointment_status as "confirmed" | "unverified", window, preOutage: null },
      containerAvailable: tracking.allContainersAvailable ? true : null,
      containerAvailabilityAsOf: tracking.allContainersAvailable ? tracking.snapshotAt : null,
      holds: err.map(HOLDS_FROM_SOURCE, j.hold_type, `${at} hold_type`),
      requiredEquipment: err.map(EQUIPMENT_FROM_SOURCE, j.container_type, `${at} container_type`),
      approval: null,
      tier: tier as CriticalityTier,
      criticalityBasis: err.map(CRITICALITY_BASES, j.criticality_basis, `${at} criticality_basis`),
      criticalityStatedBy: j.criticality_stated_by || null,
      originalAssignedDriverId: j.assigned_driver_id || null,
      cargoDescription: j.cargo_description || null,
      lastFreeDay: j.last_free_day || null,
    };
    const source: JobSource = {
      sourceContainerType: j.container_type,
      sourceTerminal: j.terminal,
      sourceAppointmentStatus: j.appointment_status,
      dataOrigin: j.data_origin,
    };
    return { job, source };
  });

  const expectedUnassigned = config.recovery.scope.expectedUnassignedJobIds;
  if (expectedUnassigned) {
    const actual = jobs.filter((j) => !j.job.originalAssignedDriverId).map((j) => j.job.id).sort();
    err.need(
      JSON.stringify(actual) === JSON.stringify([...expectedUnassigned].sort()),
      `scenario expects unassigned jobs ${expectedUnassigned.join(",")} but CSV has ${actual.join(",")}`,
    );
  }
  err.throwIfAny();

  const events: Omit<ActivityEvent, "id">[] = [
    {
      at: config.driverStartState.reportedDrivers.lastReportAt,
      kind: "driver",
      severity: "info",
      message: `Last driver reports before the incident (scenario): ${config.driverStartState.reportedDrivers.driverIds.join(", ")}.`,
    },
    {
      at: config.start,
      kind: "system",
      severity: "info",
      message: `Scenario "${config.id}" v${config.version} loaded (synthetic): ${jobs.length} jobs, ${drivers.length} drivers, ${terminals.length} terminals.`,
    },
    {
      at: tracking.snapshotAt,
      kind: "system",
      severity: "info",
      message: `${tracking.label}: ${tracking.allContainersAvailable ? `all ${jobs.length} containers available` : "availability unknown"}; holds remain blocking.`,
    },
  ];

  const dataset: ScenarioDataset = {
    scenario: { id: config.id, version: config.version, timeZone: config.timeZone },
    simNow: config.start,
    terminals,
    customers,
    drivers,
    jobs,
    events,
  };

  for (const event of [...config.events].sort((a, b) => compareIso(a.at, b.at))) {
    if (event.appliedBy !== "import") continue;
    if (event.type === "terminal_scheduling_outage") applyTerminalSchedulingOutage(dataset, event.terminal, event.at, event.physicalClosure);
  }
  return dataset;
}

/**
 * Marks the terminal's confirmed appointments unverified, preserving the
 * previous values. The terminal is not treated as physically closed.
 */
export function applyTerminalSchedulingOutage(
  dataset: ScenarioDataset,
  terminalShortName: string,
  at: string,
  physicalClosure: boolean,
): void {
  const terminal = dataset.terminals.find((t) => t.shortName === terminalShortName);
  if (!terminal) throw new Error(`Outage terminal not found: ${terminalShortName}`);
  terminal.portalStatus = "outage";
  let affected = 0;
  for (const { job } of dataset.jobs) {
    if (job.terminalId !== terminal.id || job.appointment.status !== "confirmed") continue;
    const { status, window } = job.appointment;
    job.appointment = { status: "unverified", window, preOutage: { status, window } };
    affected += 1;
  }
  dataset.simNow = at;
  dataset.events.push({
    at,
    kind: "terminal",
    severity: "critical",
    message:
      `${terminal.shortName} scheduling system outage (simulated): ${affected} confirmed appointments marked unverified; ` +
      `previous values preserved. ${physicalClosure ? "Terminal physically closed." : "Terminal not assumed physically closed."}`,
  });
}
