import { createHash } from "node:crypto";
import {
  RETELL_FUNCTION_NAME,
  RetellDriverReportArgsSchema,
  RetellFunctionRequestSchema,
  mapRetellArgs,
  resolveDriverIdentity,
  retellProviderEventId,
} from "@/lib/retell/driver-report-function";
import { RETELL_SIGNATURE_HEADER, verifyRetellSignature } from "@/lib/retell/signature";
import { OperationsRepository } from "@/server/db/operations-repository";
import { getSupabaseAdmin } from "@/server/db/supabase";
import { getRetellEnv } from "@/server/env";
import { handleUnexpectedError, json, jsonError } from "@/server/http";
import { DriverNotFoundError, submitDriverReport } from "@/server/services/driver-report-service";

/**
 * POST /api/retell/driver-report — Retell custom function `submit_driver_report`.
 *
 * Authenticated by Retell's X-Retell-Signature (HMAC of the raw body with the
 * RETELL_API_KEY), not by the demo session. Records the report through the
 * shared driver-report service with source "retell". A voice report never
 * dispatches anything: it only updates the driver's status.
 *
 * Responses (the JSON body is read back to the agent's LLM):
 *   200 { result: "recorded" | "already_recorded" | "rejected", message }
 *   401 bad/missing signature · 400 malformed request · 503 backend not ready
 */
export async function POST(request: Request) {
  const receivedAt = new Date();
  try {
    const rawBody = await request.text();
    const { RETELL_API_KEY } = getRetellEnv();
    if (!verifyRetellSignature(rawBody, RETELL_API_KEY, request.headers.get(RETELL_SIGNATURE_HEADER))) {
      return jsonError(401, "unauthenticated", "Invalid or missing Retell signature");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return jsonError(400, "invalid_request", "Body is not valid JSON");
    }
    const envelope = RetellFunctionRequestSchema.safeParse(payload);
    if (!envelope.success || envelope.data.name !== RETELL_FUNCTION_NAME) {
      return jsonError(400, "invalid_request", `Expected the ${RETELL_FUNCTION_NAME} custom function with the default payload`);
    }
    const { call } = envelope.data;
    const callRef = createHash("sha256").update(call.call_id).digest("hex").slice(0, 8);

    const parsedArgs = RetellDriverReportArgsSchema.safeParse(envelope.data.args);
    if (!parsedArgs.success) {
      const problems = parsedArgs.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
      return json({ result: "rejected", message: `Report not recorded. Please confirm: ${problems}.` });
    }
    const args = parsedArgs.data;

    const identity = resolveDriverIdentity(call, args);
    if (!identity) {
      return json({ result: "rejected", message: "Report not recorded: the driver could not be identified. Ask for the driver ID." });
    }

    const repository = new OperationsRepository(getSupabaseAdmin());
    const clock = await repository.getClock();
    if (!clock) {
      console.error(`[POST /api/retell/driver-report] call ${callRef}: simulated clock not set`);
      return jsonError(503, "dataset_incomplete", "Scenario not loaded; report not recorded");
    }

    const mapped = mapRetellArgs(args, clock);
    if (!mapped.ok) return json({ result: "rejected", message: `Report not recorded: ${mapped.reason}.` });

    const result = await submitDriverReport(repository, {
      driverId: identity.driverId,
      ...mapped.report,
      providerEventId: retellProviderEventId(call.call_id, args),
      reportedAt: undefined,
      source: "retell",
      receivedAt,
    });

    const d = result.driver;
    const window = `${d.availableFrom?.slice(11, 16) ?? "unknown"}${d.availableUntil ? `–${d.availableUntil.slice(11, 16)}` : ""}`;
    console.info(
      `[POST /api/retell/driver-report] call ${callRef}: ${result.duplicate ? "duplicate" : "recorded"} for ${d.id} (driver id via ${identity.via})`,
    );
    return json({
      result: result.duplicate ? "already_recorded" : "recorded",
      message:
        `${result.duplicate ? "Already recorded" : "Recorded"}: ${d.name} ${d.availability.replace("-", " ")}, ${window}` +
        `${d.location ? ` at ${d.location}` : ""}. A dispatcher reviews every assignment; this report does not dispatch the driver.`,
      driverId: d.id,
    });
  } catch (error) {
    if (error instanceof DriverNotFoundError) {
      return json({ result: "rejected", message: `Report not recorded: no driver with ID ${error.driverId}.` });
    }
    return handleUnexpectedError("POST /api/retell/driver-report", error);
  }
}
