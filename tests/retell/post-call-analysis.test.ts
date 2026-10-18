import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RetellWebhookSchema,
  composeLocation,
  mapPostCallAnalysis,
  namesDiffer,
  parseAvailable,
  parseSpokenTime,
  postCallProviderEventId,
  trustedDriverId,
} from "../../src/lib/retell/post-call-analysis.ts";

const DEMO_DATE = "2026-10-19T14:00:00-07:00"; // scenario config `start`

// Maelie's nine fields, as the D02 demo call should produce them.
const D02_FIELDS = {
  driver_name: "Aisha Johnson",
  available: true,
  available_from: "15:00",
  available_until: "19:00",
  location_type: "staging_area",
  terminal_name: "Terminal B",
  equipment: "reefer_40",
  appointment_outcome: "not_applicable",
  notes: "Can take a reefer load this afternoon.",
};

describe("call_analyzed payload", () => {
  it("parses the documented webhook shape", () => {
    const parsed = RetellWebhookSchema.parse({
      event: "call_analyzed",
      call: {
        call_id: "Jabr9TXYYJHfvl6Syypi88rdAHYHmcq6",
        agent_id: "agent_x",
        retell_llm_dynamic_variables: { driver_id: "D02" },
        call_analysis: { call_summary: "…", custom_analysis_data: D02_FIELDS },
        transcript: "…",
      },
    });
    assert.equal(parsed.call.call_analysis?.custom_analysis_data?.available_from, "15:00");
  });

  it("identifies the driver only from configured call variables or metadata", () => {
    assert.deepEqual(trustedDriverId({ call_id: "c", retell_llm_dynamic_variables: { driver_id: "D02" } }), { driverId: "D02", via: "dynamic_variables" });
    assert.deepEqual(trustedDriverId({ call_id: "c", metadata: { driver_id: "D02" } }), { driverId: "D02", via: "metadata" });
    assert.equal(trustedDriverId({ call_id: "c", call_analysis: { custom_analysis_data: { driver_name: "Aisha Johnson" } } }), null);
  });
});

describe("post-call mapping", () => {
  it("maps the D02 call to a report on the configured demo date", () => {
    const m = mapPostCallAnalysis(D02_FIELDS, DEMO_DATE);
    assert.equal(m.kind, "report");
    assert.ok(m.kind === "report");
    assert.deepEqual(m.report, {
      availability: "available",
      availableFrom: "2026-10-19T15:00:00-07:00",
      availableUntil: "2026-10-19T19:00:00-07:00",
      location: "Terminal B staging area",
      equipment: ["reefer-40"],
      note: "Can take a reefer load this afternoon. Appointment outcome: not_applicable.",
    });
    assert.deepEqual(m.unknownFields, []);
  });

  it("keeps missing or ambiguous answers unknown instead of guessing", () => {
    const m = mapPostCallAnalysis({ ...D02_FIELDS, available_until: "", location_type: "yard", equipment: "unknown" }, DEMO_DATE);
    assert.ok(m.kind === "report");
    assert.equal(m.report.availableUntil, undefined);
    assert.equal(m.report.location, undefined);
    assert.equal(m.report.equipment, undefined);
    assert.deepEqual(m.unknownFields.sort(), ["available_until", "equipment", "location"]);
  });

  it("writes nothing when availability or its start time is unknown or ambiguous", () => {
    assert.equal(mapPostCallAnalysis({ ...D02_FIELDS, available: "maybe" }, DEMO_DATE).kind, "incomplete");
    assert.equal(mapPostCallAnalysis({ ...D02_FIELDS, available_from: "3:00" }, DEMO_DATE).kind, "incomplete");
    assert.equal(mapPostCallAnalysis({ ...D02_FIELDS, available: false }, DEMO_DATE).kind, "incomplete");
    assert.equal(mapPostCallAnalysis(null, DEMO_DATE).kind, "incomplete");
  });

  it("treats an end time not after the start as unknown", () => {
    const m = mapPostCallAnalysis({ ...D02_FIELDS, available_until: "01:00" }, DEMO_DATE);
    assert.ok(m.kind === "report");
    assert.equal(m.report.availableUntil, undefined);
    assert.ok(m.unknownFields.includes("available_until"));
  });

  it("parses only unambiguous times", () => {
    assert.equal(parseSpokenTime("15:00"), "15:00");
    assert.equal(parseSpokenTime("09:30"), "09:30");
    assert.equal(parseSpokenTime("3 pm"), "15:00");
    assert.equal(parseSpokenTime("3:30 p.m."), "15:30");
    assert.equal(parseSpokenTime("12 am"), "00:00");
    assert.equal(parseSpokenTime("3:00"), null);
    assert.equal(parseSpokenTime("afternoon"), null);
    assert.equal(parseSpokenTime(1500), null);
  });

  it("parses availability and locations conservatively", () => {
    assert.equal(parseAvailable(true), true);
    assert.equal(parseAvailable("Yes"), true);
    assert.equal(parseAvailable("unclear"), null);
    assert.equal(composeLocation("staging_area", "terminal b"), "Terminal B staging area");
    assert.equal(composeLocation("terminal", "Terminal C"), "Terminal C");
    assert.equal(composeLocation("staging_area", "Terminal Z"), null);
    assert.equal(composeLocation(undefined, "Terminal B"), null);
  });

  it("uses one event id per call and event type, and flags name mismatches", () => {
    assert.equal(postCallProviderEventId("call_1", "call_analyzed"), "retell:call_1:call_analyzed");
    assert.equal(namesDiffer("aisha", "Aisha Johnson"), false);
    assert.equal(namesDiffer("Marcus Reyes", "Aisha Johnson"), true);
    assert.equal(namesDiffer(null, "Aisha Johnson"), false);
  });
});
