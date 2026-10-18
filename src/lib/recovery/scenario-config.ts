/**
 * Shape of the versioned scenario configuration
 * (data/scenario/terminal-a-outage.v1.json). The JSON holds the team's
 * authorized fictional decisions that fill gaps in the source CSVs.
 */

import type { EquipmentType, ReportableAvailability } from "../shared/operational-types.ts";

export interface TimingEstimates {
  label: string;
  sameAreaTravelMinutes: number;
  betweenAreasTravelMinutes: number;
  jobReservationMinutes: number;
  jobReservationIncludes?: string;
}

export interface RecoveryConfig {
  scope: {
    includeOutageAffectedJobs: boolean;
    includeUnassignedJobs: boolean;
    expectedUnassignedJobIds?: string[];
  };
  existingAssignments: {
    outsideScope: "preserve_and_reserve";
    insideScope: "keep_as_history";
  };
  ranking: string[];
  timingEstimates: TimingEstimates;
  /** Reported location → area name. Terminals are areas named by their short name. */
  locationAreas: Record<string, string>;
}

export interface ScenarioDriverReportRequest {
  driverId: string;
  availability: ReportableAvailability;
  availableFrom: string;
  availableUntil?: string;
  location?: string;
  equipment?: EquipmentType[];
  note?: string;
  providerEventId: string;
  reportedAt?: string;
}

export type ScenarioEvent =
  | {
      type: "terminal_scheduling_outage";
      at: string;
      terminal: string;
      effect: "confirmed_appointments_become_unverified";
      physicalClosure: boolean;
      appliedBy: "import";
    }
  | {
      type: "driver_report";
      at: string;
      appliedBy: "api";
      request: ScenarioDriverReportRequest;
    };

export interface ScenarioConfig {
  id: string;
  version: number;
  dataOrigin: string;
  timeZone: string;
  start: string;
  containerTracking: {
    label: string;
    snapshotAt: string;
    allContainersAvailable: boolean;
    holdsRemainBlocking: boolean;
  };
  driverStartState: {
    reportedDrivers: { driverIds: string[]; lastReportAt: string; keepCsvAvailableFrom: boolean };
    notReportedDrivers: { driverIds: string[]; unknownFields: string[] };
  };
  events: ScenarioEvent[];
  recovery: RecoveryConfig;
}

export const RANKING_RULE = ["criticality_tier_desc", "harm_deadline_asc", "job_id_asc"] as const;

/** Light structural validation; throws with a readable message. */
export function assertScenarioConfig(value: unknown): asserts value is ScenarioConfig {
  const c = value as Partial<ScenarioConfig>;
  const problems: string[] = [];
  if (!c || typeof c !== "object") throw new Error("Scenario config must be an object");
  if (typeof c.id !== "string") problems.push("id");
  if (!Number.isInteger(c.version)) problems.push("version");
  if (typeof c.timeZone !== "string") problems.push("timeZone");
  if (typeof c.start !== "string") problems.push("start");
  if (!c.recovery?.timingEstimates) problems.push("recovery.timingEstimates");
  if (JSON.stringify(c.recovery?.ranking) !== JSON.stringify(RANKING_RULE)) {
    problems.push(`recovery.ranking must be ${RANKING_RULE.join(", ")}`);
  }
  if (problems.length) throw new Error(`Invalid scenario config: ${problems.join("; ")}`);
}
