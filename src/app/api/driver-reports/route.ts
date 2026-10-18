import { DriverReportRequestSchema, type DriverReportResponse } from "@/lib/shared/api-contract";
import { OperationsRepository } from "@/server/db/operations-repository";
import { getSupabaseAdmin } from "@/server/db/supabase";
import { handleUnexpectedError, json, jsonError, parseJsonBody, requireDemoSession } from "@/server/http";
import { DriverNotFoundError, submitDriverReport } from "@/server/services/driver-report-service";

/**
 * POST /api/driver-reports — dispatcher-entered driver check-in.
 * Requires a demo session. Source is recorded as "dispatcher".
 * 201 when applied, 200 when providerEventId was already processed.
 */
export async function POST(request: Request) {
  const receivedAt = new Date();
  try {
    const denied = await requireDemoSession(request, { mutation: true });
    if (denied) return denied;

    const parsed = await parseJsonBody(request, DriverReportRequestSchema);
    if ("response" in parsed) return parsed.response;

    const result = await submitDriverReport(new OperationsRepository(getSupabaseAdmin()), {
      ...parsed.data,
      source: "dispatcher",
      receivedAt,
    });
    return json<DriverReportResponse>(result, result.duplicate ? 200 : 201);
  } catch (error) {
    if (error instanceof DriverNotFoundError) {
      return jsonError(404, "driver_not_found", `No driver with id "${error.driverId}"`);
    }
    return handleUnexpectedError("POST /api/driver-reports", error);
  }
}
