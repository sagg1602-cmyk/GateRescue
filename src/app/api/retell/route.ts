import {
  POST_CALL_EVENT,
  RetellWebhookSchema,
  mapPostCallAnalysis,
  namesDiffer,
  postCallProviderEventId,
  trustedDriverId,
} from "@/lib/retell/post-call-analysis";
import { RETELL_SIGNATURE_HEADER, verifyRetellSignature } from "@/lib/retell/signature";
import { getScenarioConfig } from "@/lib/recovery/scenario-registry";
import { OperationsRepository } from "@/server/db/operations-repository";
import { getSupabaseAdmin } from "@/server/db/supabase";
import { getRetellEnv } from "@/server/env";
import { handleUnexpectedError, json, jsonError } from "@/server/http";
import { DriverNotFoundError, submitDriverReport } from "@/server/services/driver-report-service";

const ROUTE = "POST /api/retell";

/** One structured log line per webhook; never the payload itself. */
function log(level: "info" | "warn" | "error", fields: Record<string, unknown>) {
  console[level](JSON.stringify({ route: ROUTE, ...fields }));
}

/**
 * POST /api/retell — Retell agent webhook (post-call path).
 *
 * Verifies X-Retell-Signature, ignores every event except `call_analyzed`,
 * maps `call.call_analysis.custom_analysis_data` to a driver report and saves
 * it through the shared driver-report service (source "retell") BEFORE
 * responding. Retell retries non-2xx/timeouts (10 s, up to 3 times); retries
 * are deduplicated by call id + event type, and the database allows one
 * Retell report per call across this route and the custom function.
 *
 * 200 → accepted (recorded, duplicate, ignored, or incomplete — nothing to retry)
 * 401 → bad signature · 400 → malformed payload · 5xx → retryable failure
 */
export async function POST(request: Request) {
  const receivedAt = new Date();
  try {
    const rawBody = await request.text();
    const { RETELL_API_KEY } = getRetellEnv();
    if (!verifyRetellSignature(rawBody, RETELL_API_KEY, request.headers.get(RETELL_SIGNATURE_HEADER))) {
      log("warn", { outcome: "rejected_signature" });
      return jsonError(401, "unauthenticated", "Invalid or missing Retell signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      log("warn", { outcome: "invalid_json" });
      return jsonError(400, "invalid_request", "Body is not valid JSON");
    }
    const parsed = RetellWebhookSchema.safeParse(payload);
    if (!parsed.success) {
      log("warn", { outcome: "invalid_payload", issues: parsed.error.issues.map((i) => i.path.join(".") || "root") });
      return jsonError(400, "invalid_request", "Expected a Retell webhook payload with event and call.call_id");
    }
    const { event, call } = parsed.data;
    const base = { event, call_id: call.call_id };

    if (event !== POST_CALL_EVENT) {
      log("info", { ...base, outcome: "ignored_event" });
      return json({ ok: true, outcome: "ignored", event });
    }

    const analysis = call.call_analysis?.custom_analysis_data;
    const presentFields = analysis ? Object.keys(analysis).sort() : [];

    const identity = trustedDriverId(call);
    if (!identity) {
      log("warn", { ...base, outcome: "driver_not_identified", fields: presentFields });
      return json({ ok: true, outcome: "driver_not_identified" });
    }

    const repository = new OperationsRepository(getSupabaseAdmin());
    const clock = await repository.getClock();
    const config = clock?.scenarioId && clock.scenarioVersion !== null ? getScenarioConfig(clock.scenarioId, clock.scenarioVersion) : null;
    if (!clock || !config) {
      log("error", { ...base, outcome: "scenario_not_loaded" });
      return jsonError(503, "dataset_incomplete", "Scenario not loaded; report not recorded");
    }

    // Configured demo date and time zone (scenario config), e.g. 2026-10-19 America/Los_Angeles.
    const mapping = mapPostCallAnalysis(analysis, config.start);
    if (mapping.kind === "incomplete") {
      log("info", { ...base, driver_id: identity.driverId, outcome: "incomplete", reason: mapping.reason, unknown: mapping.unknownFields, fields: presentFields });
      return json({ ok: true, outcome: "incomplete", unknown: mapping.unknownFields });
    }

    const result = await submitDriverReport(repository, {
      driverId: identity.driverId,
      ...mapping.report,
      providerEventId: postCallProviderEventId(call.call_id, event),
      providerCallId: call.call_id,
      reportedAt: undefined,
      source: "retell",
      receivedAt,
    });

    const nameMismatch = namesDiffer(mapping.extractedDriverName, result.driver.name);
    log(nameMismatch ? "warn" : "info", {
      ...base,
      driver_id: identity.driverId,
      driver_id_via: identity.via,
      outcome: result.duplicate ? "duplicate" : "recorded",
      report_id: result.report.id,
      unknown: mapping.unknownFields,
      ...(nameMismatch ? { name_mismatch: true } : {}),
    });
    return json({ ok: true, outcome: result.duplicate ? "duplicate" : "recorded", reportId: result.report.id });
  } catch (error) {
    if (error instanceof DriverNotFoundError) {
      log("warn", { outcome: "driver_not_found", driver_id: error.driverId });
      return json({ ok: true, outcome: "driver_not_found" });
    }
    return handleUnexpectedError(ROUTE, error);
  }
}
