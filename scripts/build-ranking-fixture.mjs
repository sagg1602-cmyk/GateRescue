// Converts data/source/gaterescue_expected_ranking.csv (kept unchanged) into a
// test fixture describing the expected recovery ranking before and after the
// driver call. It is NOT operational data and is never imported.
//
//   npm run fixture:ranking
//
// Output: tests/fixtures/expected-ranking.json

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const file = "gaterescue_expected_ranking.csv";
const text = readFileSync(new URL(`data/source/${file}`, root), "utf8").replace(/^﻿/, "");
const EXPECTED =
  "rank,job_id,criticality_tier,harm_deadline,status_before_call,blocker_before_call,proposed_driver_before_call,next_action_before_call,status_after_call,blocker_after_call,proposed_driver_after_call,next_action_after_call,owner,data_origin";

// The ranking file has no quoted fields; fail loudly if that ever changes.
if (text.includes('"')) throw new Error(`${file}: quoted fields not supported by this converter`);
const [header, ...lines] = text.split(/\r?\n/).filter(Boolean);
if (header !== EXPECTED) throw new Error(`${file}: unexpected header:\n${header}`);

const nullable = (v) => (v === "" ? null : v);
const rows = lines.map((line) => {
  const v = line.split(",");
  if (v.length !== 14) throw new Error(`${file}: bad row: ${line}`);
  return {
    rank: Number(v[0]),
    jobId: v[1],
    criticalityTier: Number(v[2]),
    harmDeadline: v[3],
    beforeCall: { status: v[4], blocker: nullable(v[5]), proposedDriverId: nullable(v[6]), nextAction: nullable(v[7]) },
    afterCall: { status: v[8], blocker: nullable(v[9]), proposedDriverId: nullable(v[10]), nextAction: nullable(v[11]) },
    owner: v[12],
    dataOrigin: v[13],
  };
});

const fixture = {
  description:
    "Expected recovery ranking before and after the driver call, from the scenario owner. Test fixture only — not operational data.",
  source: { file: `data/source/${file}`, sha256: createHash("sha256").update(text).digest("hex") },
  // Inferred by the backend from the data, pending scenario-owner confirmation:
  inferredScenario: {
    precondition:
      "Terminal A appointment portal outage: every Terminal A job is appointment_unverified before the call, although jobs.csv lists all appointments as confirmed.",
    driverCall: "D02 (reefer_40, not_reported at start) reports in; J02 becomes ready_for_approval with D02.",
    rankedJobs: "Jobs needing dispatcher action: outage-affected Terminal A jobs plus unassigned J02.",
    order: "criticality_tier descending, then harm_deadline ascending, then job_id.",
  },
  rows,
};

const out = fileURLToPath(new URL("tests/fixtures/expected-ranking.json", root));
mkdirSync(fileURLToPath(new URL("tests/fixtures/", root)), { recursive: true });
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${out}: ${rows.length} ranked jobs.`);
