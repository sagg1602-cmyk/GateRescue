import type { StateResponse } from "@/lib/shared/api-contract";
import { OperationsRepository } from "@/server/db/operations-repository";
import { getSupabaseAdmin } from "@/server/db/supabase";
import { handleUnexpectedError, json, requireDemoSession } from "@/server/http";

/** GET /api/state — full operational snapshot. Requires a demo session. */
export async function GET(request: Request) {
  try {
    const denied = await requireDemoSession(request, { mutation: false });
    if (denied) return denied;

    const snapshot = await new OperationsRepository(getSupabaseAdmin()).getSnapshot();
    return json<StateResponse>(snapshot);
  } catch (error) {
    return handleUnexpectedError("GET /api/state", error);
  }
}
