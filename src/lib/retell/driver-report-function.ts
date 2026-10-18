/**
 * Retell custom function `submit_driver_report`: request validation and the
 * mapping from a Retell call + function arguments to a driver report for the
 * shared driver-report service. Pure; no I/O.
 *
 * Request shape (Retell default payload, NOT "args only"):
 *   { name, call: { call_id, metadata?, retell_llm_dynamic_variables?, ... }, args }
 * https://docs.retellai.com/build/single-multi-prompt/custom-function
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import type { EquipmentType, ReportableAvailability } from "../shared/operational-types.ts";
import { REPORTABLE_AVAILABILITIES } from "../shared/operational-types.ts";
import { compareIso, setWallClockTime, toZonedIso } from "../shared/datetime.ts";

export const RETELL_FUNCTION_NAME = "submit_driver_report";

/** Equipment as drivers and the scenario data name it → operational equipment. */
export const RETELL_EQUIPMENT: Record<string, EquipmentType> = {
  dry_20: "chassis-20",
  dry_40: "chassis-40",
  reefer_40: "reefer-40",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Arguments the Retell agent's LLM fills in (see docs/retell-integration.md for the JSON schema). */
export const RetellDriverReportArgsSchema = z.object({
  availability: z.enum(REPORTABLE_AVAILABILITIES),
  available_from: z.string().regex(HHMM, "24-hour HH:MM"),
  available_until: z.string().regex(HHMM, "24-hour HH:MM").optional(),
  location: z.string().trim().min(1).max(200).optional(),
  equipment: z.enum(Object.keys(RETELL_EQUIPMENT) as [string, ...string[]]).optional(),
  note: z.string().trim().max(500).optional(),
  /** Only used when the call carries no driver_id in dynamic variables or metadata. */
  driver_id: z.string().trim().min(1).max(64).optional(),
});
export type RetellDriverReportArgs = z.infer<typeof RetellDriverReportArgsSchema>;

export const RetellFunctionRequestSchema = z.object({
  name: z.string(),
  call: z
    .object({
      call_id: z.string().min(1).max(200),
      agent_id: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
      retell_llm_dynamic_variables: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough(),
  args: z.unknown(),
});
export type RetellFunctionRequest = z.infer<typeof RetellFunctionRequestSchema>;

export interface DriverIdentity {
  driverId: string;
  /** Where the driver id came from. Call-level values are set by us, not by the LLM. */
  via: "dynamic_variables" | "metadata" | "llm_args";
}

/** Prefers identifiers set when the call was created over values the LLM extracted. */
export function resolveDriverIdentity(call: RetellFunctionRequest["call"], args: RetellDriverReportArgs): DriverIdentity | null {
  const fromVars = call.retell_llm_dynamic_variables?.driver_id;
  if (typeof fromVars === "string" && fromVars.trim()) return { driverId: fromVars.trim(), via: "dynamic_variables" };
  const fromMeta = call.metadata?.driver_id;
  if (typeof fromMeta === "string" && fromMeta.trim()) return { driverId: fromMeta.trim(), via: "metadata" };
  if (args.driver_id) return { driverId: args.driver_id, via: "llm_args" };
  return null;
}

/**
 * Deterministic provider event id: same call + same arguments → same id, so
 * Retell retries are deduplicated while a corrected report in the same call
 * (different arguments) is recorded.
 */
export function retellProviderEventId(callId: string, args: RetellDriverReportArgs): string {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))));
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  const safeCallId = callId.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 150);
  return `retell:${safeCallId}:${digest}`;
}

export interface MappedRetellReport {
  availability: ReportableAvailability;
  availableFrom: string;
  availableUntil: string | undefined;
  location: string | undefined;
  equipment: EquipmentType[] | undefined;
  note: string;
}

/**
 * Converts spoken "HH:MM" times to timestamps on the scenario's simulated day
 * (the calendar date of the simulated clock, in the scenario time zone).
 */
export function mapRetellArgs(
  args: RetellDriverReportArgs,
  clock: { simNow: string; timeZone: string },
): { ok: true; report: MappedRetellReport } | { ok: false; reason: string } {
  const day = toZonedIso(clock.simNow, clock.timeZone);
  const availableFrom = setWallClockTime(day, args.available_from);
  const availableUntil = args.available_until ? setWallClockTime(day, args.available_until) : undefined;
  if (availableUntil && compareIso(availableUntil, availableFrom) <= 0) {
    return { ok: false, reason: "available_until must be later than available_from on the same day" };
  }
  return {
    ok: true,
    report: {
      availability: args.availability,
      availableFrom,
      availableUntil,
      location: args.location,
      equipment: args.equipment ? [RETELL_EQUIPMENT[args.equipment]] : undefined,
      note: args.note ?? "",
    },
  };
}
