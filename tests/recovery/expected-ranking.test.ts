/**
 * Compares the backend recovery engine with the scenario owner's expected
 * ranking (tests/fixtures/expected-ranking.json, generated from the unchanged
 * CSV) before and after D02's 14:10 report. Nothing here is hardcoded to the
 * expected answers: the engine runs on the imported dataset and the fixture
 * is only read.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecoveryQueue } from "../../src/lib/shared/operational-types.ts";
import { toEpochMs } from "../../src/lib/shared/datetime.ts";
import { applyDriverReport, computeAppliedAt } from "../../src/lib/recovery/driver-report.ts";
import { buildRecoveryQueue } from "../../src/lib/recovery/engine.ts";
import type { ScenarioConfig, ScenarioEvent } from "../../src/lib/recovery/scenario-config.ts";
import type { ScenarioDataset } from "../../src/lib/recovery/scenario-dataset.ts";
import { loadDataset, loadRankingFixture, readRepoFile, sha256, type FixtureCallState } from "./helpers.ts";

const fixture = loadRankingFixture();

function queueFor(dataset: ScenarioDataset, config: ScenarioConfig, now: string, drivers = dataset.drivers.map((d) => d.driver)) {
  return buildRecoveryQueue({
    now,
    timeZone: config.timeZone,
    jobs: dataset.jobs.map((j) => j.job),
    drivers,
    terminals: dataset.terminals,
    config: config.recovery,
  });
}

function assertMatchesFixture(queue: RecoveryQueue, key: "beforeCall" | "afterCall") {
  assert.deepEqual(
    queue.entries.map((e) => e.jobId),
    fixture.rows.map((r) => r.jobId),
    "ranked job order",
  );
  for (const row of fixture.rows) {
    const entry = queue.entries.find((e) => e.jobId === row.jobId);
    assert.ok(entry, `${row.jobId} missing`);
    const expected: FixtureCallState = row[key];
    const actual: FixtureCallState = {
      status: entry.status,
      blocker: entry.blocker,
      proposedDriverId: entry.proposedDriverId,
      nextAction: entry.nextAction,
    };
    assert.deepEqual(actual, expected, `${row.jobId} (${key})`);
    assert.equal(entry.rank, row.rank, `${row.jobId} rank`);
    assert.equal(entry.owner, row.owner, `${row.jobId} owner`);
    assert.equal(entry.criticalityTier, row.criticalityTier, `${row.jobId} tier`);
    assert.equal(toEpochMs(entry.harmDeadline), toEpochMs(row.harmDeadline), `${row.jobId} harm deadline`);
  }
}

describe("expected ranking fixture", () => {
  it("is generated from the unchanged source CSV", () => {
    assert.equal(sha256(readRepoFile(fixture.source.file)), fixture.source.sha256);
  });

  const { dataset, config } = loadDataset();
  const report = config.events.find(
    (e): e is Extract<ScenarioEvent, { type: "driver_report" }> => e.type === "driver_report",
  );

  it("matches before D02's report (after the 14:05 outage)", () => {
    assert.equal(dataset.simNow, "2026-10-19T14:05:00-07:00");
    assertMatchesFixture(queueFor(dataset, config, dataset.simNow), "beforeCall");
  });

  it("matches after D02's 14:10 report", () => {
    assert.ok(report, "scenario driver report");
    const request = report.request;
    const appliedAt = computeAppliedAt(dataset.simNow, request.reportedAt ?? report.at, config.timeZone);
    assert.equal(appliedAt, "2026-10-19T14:10:00-07:00");
    const drivers = dataset.drivers.map(({ driver }) =>
      driver.id === request.driverId
        ? applyDriverReport(driver, { ...request, reportedAt: request.reportedAt ?? report.at }, appliedAt)
        : driver,
    );
    assertMatchesFixture(queueFor(dataset, config, appliedAt, drivers), "afterCall");
  });
});
