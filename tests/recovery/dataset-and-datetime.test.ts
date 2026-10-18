import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addMinutesIso,
  compareIso,
  parseIsoDateTime,
  setWallClockTime,
  toZonedIso,
} from "../../src/lib/shared/datetime.ts";
import { computeAppliedAt } from "../../src/lib/recovery/driver-report.ts";
import { buildRecoveryQueue } from "../../src/lib/recovery/engine.ts";
import { loadDataset } from "./helpers.ts";

describe("datetime", () => {
  it("compares full timestamps across dates and offsets", () => {
    assert.ok(compareIso("2026-10-20T06:00:00-07:00", "2026-10-19T20:30:00-07:00") > 0);
    assert.equal(compareIso("2026-10-19T21:00:00Z", "2026-10-19T14:00:00-07:00"), 0);
    assert.throws(() => parseIsoDateTime("2026-10-19T14:00:00"), /offset/);
  });

  it("adds minutes across midnight, keeping the offset", () => {
    assert.equal(addMinutesIso("2026-10-19T23:30:00-07:00", 45), "2026-10-20T00:15:00-07:00");
  });

  it("re-expresses instants in the scenario time zone, including DST changes", () => {
    assert.equal(toZonedIso("2026-10-19T21:00:00+00:00", "America/Los_Angeles"), "2026-10-19T14:00:00-07:00");
    assert.equal(toZonedIso("2026-11-02T20:00:00Z", "America/Los_Angeles"), "2026-11-02T12:00:00-08:00");
  });

  it("sets a wall-clock time on the same date and offset", () => {
    assert.equal(setWallClockTime("2026-10-17T06:30:00-07:00", "15:05"), "2026-10-17T15:05:00-07:00");
  });

  it("applies reports at the report time when it is shortly after the clock, else clock + 1 min", () => {
    const tz = "America/Los_Angeles";
    assert.equal(computeAppliedAt("2026-10-19T14:05:00-07:00", "2026-10-19T14:10:00-07:00", tz), "2026-10-19T14:10:00-07:00");
    assert.equal(computeAppliedAt("2026-10-19T14:05:00-07:00", "2026-10-17T09:00:00-07:00", tz), "2026-10-19T14:06:00-07:00");
    assert.equal(computeAppliedAt("2026-10-19T14:05:00-07:00", "2026-10-21T09:00:00-07:00", tz), "2026-10-19T14:06:00-07:00");
  });
});

describe("scenario dataset", () => {
  const { dataset, config } = loadDataset();
  const job = (id: string) => dataset.jobs.find((j) => j.job.id === id)!.job;
  const driver = (id: string) => dataset.drivers.find((d) => d.driver.id === id)!;

  it("applies the Terminal A scheduling outage without closing the terminal", () => {
    const termA = dataset.terminals.find((t) => t.shortName === "Terminal A")!;
    assert.equal(termA.portalStatus, "outage");
    const unverified = dataset.jobs.filter((j) => j.job.appointment.status === "unverified").map((j) => j.job.id);
    assert.deepEqual(unverified, ["J01", "J03", "J04", "J09", "J11", "J15", "J17"]);
    assert.ok(dataset.jobs.every((j) => j.job.terminalId === "term-a" || j.job.appointment.status === "confirmed"));
    assert.deepEqual(job("J01").appointment.preOutage, {
      status: "confirmed",
      window: { start: "2026-10-19T15:00:00-07:00", end: "2026-10-19T16:00:00-07:00" },
    });
    assert.equal(dataset.events.at(-1)?.message.includes("not assumed physically closed"), true);
  });

  it("marks D02 explicitly not reported with unknown fields", () => {
    const d02 = driver("D02");
    assert.equal(d02.driver.availability, "not-reported");
    assert.equal(d02.driver.location, null);
    assert.equal(d02.driver.availableFrom, null);
    assert.equal(d02.driver.lastReport, null);
    assert.equal(d02.source.sourceStatus, "not_reported");
  });

  it("keeps CSV availability times and sets 13:55 last reports for the other drivers", () => {
    assert.equal(driver("D01").driver.availableFrom, "2026-10-19T14:30:00-07:00");
    assert.equal(driver("D04").driver.availableFrom, "2026-10-19T18:00:00-07:00");
    for (const id of ["D01", "D03", "D04", "D05"]) assert.equal(driver(id).driver.lastReport, "2026-10-19T13:55:00-07:00");
  });

  it("uses the 14:00 synthetic tracking snapshot and keeps holds blocking", () => {
    assert.ok(dataset.jobs.every((j) => j.job.containerAvailable === true));
    assert.ok(dataset.jobs.every((j) => j.job.containerAvailabilityAsOf === "2026-10-19T14:00:00-07:00"));
    assert.deepEqual(job("J07").holds, ["customs"]);
    assert.deepEqual(job("J12").holds, ["freight"]);
  });

  it("scopes recovery to Terminal A affected jobs plus unassigned J01/J02, keeping original assignments", () => {
    const queue = buildRecoveryQueue({
      now: dataset.simNow,
      timeZone: config.timeZone,
      jobs: dataset.jobs.map((j) => j.job),
      drivers: dataset.drivers.map((d) => d.driver),
      terminals: dataset.terminals,
      config: config.recovery,
    });
    assert.deepEqual(queue.entries.map((e) => e.jobId).sort(), ["J01", "J02", "J03", "J04", "J09", "J11", "J15", "J17"]);
    assert.equal(queue.entries.find((e) => e.jobId === "J09")?.originalAssignedDriverId, "D03");
    assert.equal(job("J09").originalAssignedDriverId, "D03");
  });
});
