/**
 * SYNTHETIC DEMO DATA — every company, terminal, person and container below is
 * fictional. Container numbers use the made-up "SYNU" prefix. Replace this
 * module with backend queries once the data layer exists.
 */

import type {
  ActivityEvent,
  AppointmentStatus,
  Customer,
  Driver,
  EquipmentType,
  HoldType,
  Job,
  Priority,
  Terminal,
  TerminalId,
} from "./frontend-types";

export const DEMO_DAY = "2026-10-17T00:00:00";
export const DEMO_START_TIME = "2026-10-17T06:30:00";

const t = (hhmm: string) => `2026-10-17T${hhmm}:00`;

export const TERMINALS: Terminal[] = [
  {
    id: "term-a",
    shortName: "Terminal A",
    name: "Harborview Container Yard (fictional)",
    portalStatus: "online",
  },
  {
    id: "term-b",
    shortName: "Terminal B",
    name: "Eastbay Marine Terminal (fictional)",
    portalStatus: "online",
  },
];

export const CUSTOMERS: Customer[] = [
  { id: "cust-northwind", name: "Northwind Grocers" },
  { id: "cust-cobalt", name: "Cobalt Home Goods" },
  { id: "cust-summit", name: "Summit Auto Parts" },
];

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  "chassis-40": "40′ chassis",
  "chassis-20": "20′ chassis",
  "reefer-40": "40′ reefer + genset",
  triaxle: "Tri-axle (overweight)",
};

export const HOLD_LABELS: Record<HoldType, string> = {
  customs: "Customs hold",
  freight: "Freight hold",
  usda: "USDA hold",
};

type JobRow = [
  container: string,
  customerId: string,
  terminalId: TerminalId,
  priority: Priority,
  deadline: string,
  appointment: [AppointmentStatus, string, string] | ["none"],
  containerAvailable: boolean,
  holds: HoldType[],
  equipment: EquipmentType,
];

const JOB_ROWS: JobRow[] = [
  // Terminal A
  ["SYNU1000011", "cust-northwind", "term-a", "critical", "10:00", ["confirmed", "07:30", "08:30"], true, [], "chassis-40"],
  ["SYNU1000022", "cust-cobalt", "term-a", "high", "11:30", ["confirmed", "08:00", "09:00"], true, [], "chassis-20"],
  ["SYNU1000033", "cust-summit", "term-a", "normal", "15:00", ["confirmed", "09:00", "10:00"], false, [], "chassis-40"],
  ["SYNU1000044", "cust-northwind", "term-a", "critical", "12:00", ["confirmed", "08:30", "09:30"], true, [], "reefer-40"],
  ["SYNU1000055", "cust-cobalt", "term-a", "normal", "16:00", ["confirmed", "10:00", "11:00"], true, ["customs"], "chassis-40"],
  ["SYNU1000066", "cust-summit", "term-a", "high", "13:00", ["confirmed", "10:30", "11:30"], true, [], "triaxle"],
  ["SYNU1000077", "cust-northwind", "term-a", "normal", "16:30", ["confirmed", "11:00", "12:00"], true, [], "chassis-40"],
  ["SYNU1000088", "cust-cobalt", "term-a", "high", "12:30", ["none"], true, [], "chassis-40"],
  ["SYNU1000099", "cust-summit", "term-a", "normal", "17:00", ["confirmed", "12:00", "13:00"], true, [], "chassis-40"],
  ["SYNU1000101", "cust-northwind", "term-a", "high", "14:00", ["confirmed", "13:00", "14:00"], true, [], "reefer-40"],
  ["SYNU1000112", "cust-cobalt", "term-a", "critical", "11:00", ["confirmed", "07:00", "08:00"], true, ["freight"], "chassis-40"],
  // Terminal B
  ["SYNU2000013", "cust-summit", "term-b", "critical", "10:30", ["confirmed", "07:30", "08:30"], true, [], "chassis-40"],
  ["SYNU2000024", "cust-northwind", "term-b", "high", "12:00", ["confirmed", "09:00", "10:00"], true, [], "chassis-20"],
  ["SYNU2000035", "cust-cobalt", "term-b", "normal", "15:30", ["confirmed", "10:00", "11:00"], true, [], "chassis-40"],
  ["SYNU2000046", "cust-summit", "term-b", "normal", "16:00", ["confirmed", "11:30", "12:30"], true, [], "reefer-40"],
  ["SYNU2000057", "cust-northwind", "term-b", "high", "13:30", ["confirmed", "12:00", "13:00"], true, ["usda"], "chassis-40"],
  ["SYNU2000068", "cust-cobalt", "term-b", "normal", "17:00", ["confirmed", "13:00", "14:00"], false, [], "triaxle"],
  ["SYNU2000079", "cust-summit", "term-b", "high", "14:30", ["confirmed", "13:30", "14:30"], true, [], "chassis-20"],
  ["SYNU2000081", "cust-northwind", "term-b", "normal", "17:30", ["confirmed", "14:00", "15:00"], true, [], "chassis-40"],
  ["SYNU2000092", "cust-cobalt", "term-b", "critical", "11:30", ["confirmed", "08:00", "09:00"], true, [], "chassis-40"],
];

function buildJobs(): Job[] {
  return JOB_ROWS.map(
    ([container, customerId, terminalId, priority, deadline, appt, containerAvailable, holds, equipment], i) => ({
      id: `job-${String(i + 1).padStart(2, "0")}`,
      container,
      customerId,
      terminalId,
      priority,
      deadline: t(deadline),
      appointment: {
        status: appt[0],
        window: appt[0] === "none" ? null : { start: t(appt[1]), end: t(appt[2]) },
        preOutage: null,
      },
      containerAvailable,
      holds: [...holds],
      requiredEquipment: equipment,
      approval: null,
    }),
  );
}

function buildDrivers(): Driver[] {
  return [
    {
      id: "drv-1",
      name: "Marisol Vega",
      equipment: ["chassis-40", "chassis-20"],
      availability: "available",
      availableFrom: t("06:30"),
      lastReport: t("06:12"),
      lastNote: "At yard, tractor fueled.",
      busy: [],
    },
    {
      id: "drv-2",
      name: "Theo Okafor",
      equipment: ["reefer-40", "chassis-40"],
      availability: "on-job",
      availableFrom: t("08:30"),
      lastReport: t("06:05"),
      lastNote: "Finishing an outbound reefer delivery.",
      busy: [{ start: t("06:00"), end: t("08:30"), label: "Pre-existing delivery" }],
    },
    {
      id: "drv-3",
      name: "Priya Raman",
      equipment: ["chassis-20", "chassis-40"],
      availability: "available",
      availableFrom: t("06:30"),
      lastReport: t("06:20"),
      lastNote: "Ready at north lot.",
      busy: [],
    },
    {
      id: "drv-4",
      name: "Jonah Becker",
      equipment: ["triaxle", "chassis-40"],
      availability: "off-duty",
      availableFrom: t("09:00"),
      lastReport: t("05:40"),
      lastNote: "Shift starts 09:00.",
      busy: [],
    },
    {
      id: "drv-5",
      name: "Ana Lucía Torres",
      equipment: ["chassis-40", "reefer-40"],
      availability: "unreachable",
      availableFrom: t("06:30"),
      lastReport: t("04:50"),
      lastNote: "No response since early check.",
      busy: [],
    },
  ];
}

function buildEvents(): ActivityEvent[] {
  return [
    { id: 1, at: t("06:00"), kind: "system", severity: "info", message: "Synthetic demo dataset loaded: 20 jobs, 5 drivers, 2 terminals." },
    { id: 2, at: t("06:12"), kind: "driver", severity: "info", message: "Marisol Vega checked in — available at yard." },
    { id: 3, at: t("06:20"), kind: "driver", severity: "info", message: "Priya Raman checked in — available at north lot." },
    { id: 4, at: t("06:25"), kind: "terminal", severity: "success", message: "Terminal A and Terminal B appointment portals reachable." },
  ];
}

export interface DemoDataset {
  terminals: Terminal[];
  jobs: Job[];
  drivers: Driver[];
  events: ActivityEvent[];
}

/** Returns a fresh, deep copy of the original dataset every call. */
export function createSyntheticDataset(): DemoDataset {
  return {
    terminals: TERMINALS.map((terminal) => ({ ...terminal })),
    jobs: buildJobs(),
    drivers: buildDrivers(),
    events: buildEvents(),
  };
}
