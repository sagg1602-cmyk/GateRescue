import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RetellDriverReportArgsSchema,
  mapRetellArgs,
  resolveDriverIdentity,
  retellProviderEventId,
  type RetellFunctionRequest,
} from "../../src/lib/retell/driver-report-function.ts";
import { signRetellBody, verifyRetellSignature } from "../../src/lib/retell/signature.ts";

// Generated with the official retell-sdk 6.0.1 `symmetric.sign` (src/lib/webhook_auth.ts).
const SDK_VECTOR = {
  body: '{"name":"submit_driver_report","args":{"availability":"available"}}',
  key: "test_retell_key_0123456789abcdef",
  ts: 1760000000000,
  sig: "v=1760000000000,d=ce7684ffe80f3180171fd487d4d748a46eff4f3de08ebd001e6de14487a02551",
};

describe("Retell signature", () => {
  it("accepts a signature produced by the official SDK", () => {
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, SDK_VECTOR.sig, SDK_VECTOR.ts), true);
    assert.equal(signRetellBody(SDK_VECTOR.body, SDK_VECTOR.key, SDK_VECTOR.ts), SDK_VECTOR.sig);
  });

  it("rejects a modified body, wrong key, missing or malformed header", () => {
    assert.equal(verifyRetellSignature(SDK_VECTOR.body + " ", SDK_VECTOR.key, SDK_VECTOR.sig, SDK_VECTOR.ts), false);
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, "another_key_0123456789abcdef", SDK_VECTOR.sig, SDK_VECTOR.ts), false);
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, null, SDK_VECTOR.ts), false);
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, "sha256=abc", SDK_VECTOR.ts), false);
  });

  it("rejects signatures outside the five-minute window", () => {
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, SDK_VECTOR.sig, SDK_VECTOR.ts + 5 * 60_000), true);
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, SDK_VECTOR.sig, SDK_VECTOR.ts + 5 * 60_000 + 1), false);
    assert.equal(verifyRetellSignature(SDK_VECTOR.body, SDK_VECTOR.key, SDK_VECTOR.sig, SDK_VECTOR.ts - 5 * 60_000 - 1), false);
  });
});

describe("submit_driver_report mapping", () => {
  const args = RetellDriverReportArgsSchema.parse({
    availability: "available",
    available_from: "15:00",
    available_until: "19:00",
    location: "Terminal B staging area",
    equipment: "reefer_40",
    driver_id: "D99",
  });
  const call = (extra: Partial<RetellFunctionRequest["call"]> = {}): RetellFunctionRequest["call"] => ({ call_id: "call_abc", ...extra });
  const clock = { simNow: "2026-10-19T21:05:00+00:00", timeZone: "America/Los_Angeles" };

  it("maps the scenario D02 report onto the simulated day", () => {
    const mapped = mapRetellArgs(args, clock);
    assert.deepEqual(mapped, {
      ok: true,
      report: {
        availability: "available",
        availableFrom: "2026-10-19T15:00:00-07:00",
        availableUntil: "2026-10-19T19:00:00-07:00",
        location: "Terminal B staging area",
        equipment: ["reefer-40"],
        note: "",
      },
    });
  });

  it("rejects an availability window that ends before it starts", () => {
    const bad = RetellDriverReportArgsSchema.parse({ availability: "available", available_from: "19:00", available_until: "15:00" });
    assert.equal(mapRetellArgs(bad, clock).ok, false);
  });

  it("rejects malformed arguments", () => {
    assert.equal(RetellDriverReportArgsSchema.safeParse({ availability: "asleep", available_from: "3pm" }).success, false);
    assert.equal(RetellDriverReportArgsSchema.safeParse({ availability: "available", available_from: "15:00", equipment: "reefer_20" }).success, false);
  });

  it("identifies the driver from call variables before LLM-extracted values", () => {
    assert.deepEqual(resolveDriverIdentity(call({ retell_llm_dynamic_variables: { driver_id: "D02" } }), args), { driverId: "D02", via: "dynamic_variables" });
    assert.deepEqual(resolveDriverIdentity(call({ metadata: { driver_id: "D02" } }), args), { driverId: "D02", via: "metadata" });
    assert.deepEqual(resolveDriverIdentity(call(), args), { driverId: "D99", via: "llm_args" });
    const noId = RetellDriverReportArgsSchema.parse({ availability: "available", available_from: "15:00" });
    assert.equal(resolveDriverIdentity(call(), noId), null);
  });

  it("dedupes retries but not corrections within a call", () => {
    const reordered = RetellDriverReportArgsSchema.parse({
      driver_id: "D99",
      equipment: "reefer_40",
      location: "Terminal B staging area",
      available_until: "19:00",
      available_from: "15:00",
      availability: "available",
    });
    assert.equal(retellProviderEventId("call_abc", args), retellProviderEventId("call_abc", reordered));
    const corrected = { ...args, available_from: "15:30" };
    assert.notEqual(retellProviderEventId("call_abc", args), retellProviderEventId("call_abc", corrected));
    assert.notEqual(retellProviderEventId("call_abc", args), retellProviderEventId("call_xyz", args));
    assert.match(retellProviderEventId("call/with spaces", args), /^retell:[A-Za-z0-9._:-]+$/);
  });
});
