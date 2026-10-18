/**
 * Feasibility rules tested independently of the expected-ranking fixture,
 * using small constructed jobs/drivers plus direct checks on the scenario
 * data. Timing values are the scenario's synthetic estimates.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Driver, Job, ReservationWindow } from "../../src/lib/shared/operational-types.ts";
import { applyDriverReport } from "../../src/lib/recovery/driver-report.ts";
import { buildRecoveryQueue } from "../../src/lib/recovery/engine.ts";
import { evaluateFeasibility, type FeasibilityContext } from "../../src/lib/recovery/feasibility.ts";
import type { TimingEstimates } from "../../src/lib/recovery/scenario-config.ts";
import { loadDataset } from "./helpers.ts";

const TZ = "America/Los_Angeles";
const timing: TimingEstimates = {
  label: "Synthetic timing estimate",
  sameAreaTravelMinutes: 15,
  betweenAreasTravelMinutes: 30,
  jobReservationMinutes: 120,
};
const at = (hhmm: string, day = "19") => `2026-10-${day}T${hhmm}:00-07:00`;

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "JX",
    container: "SYNUTEST",
    customerId: "C",
    terminalId: "term-b",
    priority: "high",
    deadline: at("20:00"),
    appointment: { status: "confirmed", window: { start: at("15:00"), end: at("16:00") }, preOutage: null },
    containerAvailable: true,
    holds: [],
    requiredEquipment: "chassis-40",
    approval: null,
    tier: 1,
    criticalityBasis: "self_declared",
    originalAssignedDriverId: null,
    ...overrides,
  };
}

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: "DX",
    name: "Test Driver",
    equipment: ["chassis-40"],
    availability: "available",
    availableFrom: at("14:00"),
    lastReport: at("13:55"),
    lastNote: "",
    busy: [],
    availableUntil: null,
    location: "Terminal B",
    ...overrides,
  };
}

const areas: Record<string, string> = { "Terminal A": "Terminal A", "Terminal B": "Terminal B", "Terminal B staging area": "Terminal B" };
const ctx = (overrides: Partial<FeasibilityContext> = {}): FeasibilityContext => ({
  now: at("14:00"),
  timeZone: TZ,
  timing,
  areaOfLocation: (l) => areas[l] ?? null,
  jobArea: "Terminal B",
  ...overrides,
});
const reservation = (start: string, end: string, jobId = "JR"): ReservationWindow => ({
  driverId: "DX",
  jobId,
  start,
  end,
  kind: "existing_assignment",
});

describe("feasibility rules", () => {
  it("uses 15 min travel within an area and a 2 h reservation", () => {
    const r = evaluateFeasibility(job(), driver(), [], ctx());
    assert.equal(r.feasible, true);
    assert.deepEqual(r.proposal, {
      driverId: "DX",
      departAt: at("14:45"),
      pickupAt: at("15:00"),
      completeBy: at("17:00"),
      travelMinutes: 15,
    });
  });

  it("uses 30 min travel between areas", () => {
    const r = evaluateFeasibility(job(), driver({ location: "Terminal A" }), [], ctx());
    assert.equal(r.proposal?.travelMinutes, 30);
    assert.equal(r.proposal?.departAt, at("14:30"));
  });

  it("treats a staging area as part of its terminal area", () => {
    const r = evaluateFeasibility(job(), driver({ location: "Terminal B staging area" }), [], ctx());
    assert.equal(r.proposal?.travelMinutes, 15);
  });

  it("rejects a pickup after the appointment window", () => {
    const r = evaluateFeasibility(job(), driver({ availableFrom: at("15:50") }), [], ctx());
    assert.deepEqual(r.reasons, ["pickup_window_missed"]);
  });

  it("allows pickup exactly at the window end and completion exactly at the harm deadline", () => {
    const r = evaluateFeasibility(job({ deadline: at("18:00") }), driver({ availableFrom: at("15:45") }), [], ctx());
    assert.equal(r.proposal?.pickupAt, at("16:00"));
    assert.equal(r.proposal?.completeBy, at("18:00"));
  });

  it("rejects completion after the harm deadline", () => {
    const r = evaluateFeasibility(job({ deadline: at("16:59") }), driver(), [], ctx());
    assert.deepEqual(r.reasons, ["completion_after_harm_deadline"]);
  });

  it("compares harm deadlines across calendar dates", () => {
    const nextDay = evaluateFeasibility(job({ deadline: at("08:00", "20") }), driver(), [], ctx());
    assert.equal(nextDay.feasible, true, "08:00 next day is after a 17:00 completion");
    const sameDayMorning = evaluateFeasibility(job({ deadline: at("08:00") }), driver(), [], ctx());
    assert.equal(sameDayMorning.feasible, false, "08:00 same day is before a 17:00 completion");
  });

  it("rejects completion after the driver's availability ends", () => {
    const r = evaluateFeasibility(job(), driver({ availableUntil: at("16:30") }), [], ctx());
    assert.deepEqual(r.reasons, ["availability_ends_before_completion"]);
  });

  it("never departs before now or before availableFrom", () => {
    const late = evaluateFeasibility(job(), driver({ availableFrom: at("13:00") }), [], ctx({ now: at("14:50") }));
    assert.equal(late.proposal?.departAt, at("14:50"));
    assert.equal(late.proposal?.pickupAt, at("15:05"));
  });

  it("detects a conflicting reservation and retries after it ends", () => {
    const blocked = evaluateFeasibility(job(), driver(), [reservation(at("14:30"), at("16:30"))], ctx());
    assert.deepEqual(blocked.reasons.sort(), ["pickup_window_missed", "reservation_conflict"]);
    assert.deepEqual(blocked.conflictsWith, ["JR"]);
    const shifted = evaluateFeasibility(job(), driver(), [reservation(at("13:00"), at("15:20"))], ctx());
    assert.equal(shifted.proposal?.pickupAt, at("15:35"), "pickup moves to reservation end + travel");
  });

  it("excludes drivers that have not reported, are unreachable or lack equipment/location/availability", () => {
    assert.deepEqual(evaluateFeasibility(job(), driver({ availability: "not-reported" }), [], ctx()).reasons, ["driver_not_reported"]);
    assert.deepEqual(evaluateFeasibility(job(), driver({ availability: "unreachable" }), [], ctx()).reasons, ["driver_unreachable"]);
    assert.deepEqual(evaluateFeasibility(job(), driver({ equipment: ["reefer-40"] }), [], ctx()).reasons, ["equipment_mismatch"]);
    assert.deepEqual(evaluateFeasibility(job(), driver({ location: null }), [], ctx()).reasons, ["location_unknown"]);
    assert.deepEqual(evaluateFeasibility(job(), driver({ availableFrom: null }), [], ctx()).reasons, ["availability_unknown"]);
  });
});

describe("scenario feasibility (independent of the fixture)", () => {
  const { dataset, config } = loadDataset();
  const j02 = dataset.jobs.find((j) => j.job.id === "J02")!.job;
  const d02 = dataset.drivers.find((d) => d.driver.id === "D02")!.driver;
  const d04 = dataset.drivers.find((d) => d.driver.id === "D04")!.driver;
  const queue = buildRecoveryQueue({
    now: dataset.simNow,
    timeZone: config.timeZone,
    jobs: dataset.jobs.map((j) => j.job),
    drivers: dataset.drivers.map((d) => d.driver),
    terminals: dataset.terminals,
    config: config.recovery,
  });
  const scenarioCtx = ctx({ now: "2026-10-19T14:10:00-07:00", timing: config.recovery.timingEstimates });
  const d04Reservations = queue.reservations.filter((r) => r.driverId === "D04");

  it("reserves D04's existing assignments outside the recovery scope", () => {
    assert.deepEqual(d04Reservations.map((r) => r.jobId), ["J08", "J13", "J16", "J18"]);
  });

  it("keeps in-scope original assignments as history, not reservations", () => {
    const reserved = new Set(queue.reservations.map((r) => r.jobId));
    for (const id of ["J03", "J04", "J09", "J11", "J15", "J17"]) assert.equal(reserved.has(id), false, id);
  });

  it("finds D04 infeasible for J02 (busy until 18:00, J18 reservation)", () => {
    const r = evaluateFeasibility(j02, d04, d04Reservations, scenarioCtx);
    assert.equal(r.feasible, false);
    assert.ok(r.reasons.includes("pickup_window_missed"));
  });

  it("finds D02 infeasible before reporting and feasible after", () => {
    assert.deepEqual(evaluateFeasibility(j02, d02, [], scenarioCtx).reasons, ["driver_not_reported"]);
    const report = config.events.find((e) => e.type === "driver_report");
    assert.ok(report && report.type === "driver_report");
    const reported = applyDriverReport(d02, { ...report.request, reportedAt: report.at }, report.at);
    const r = evaluateFeasibility(j02, reported, [], scenarioCtx);
    assert.deepEqual(r.proposal, {
      driverId: "D02",
      departAt: "2026-10-19T15:15:00-07:00",
      pickupAt: "2026-10-19T15:30:00-07:00",
      completeBy: "2026-10-19T17:30:00-07:00",
      travelMinutes: 15,
    });
  });
});
