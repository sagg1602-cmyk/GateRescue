/**
 * Retell `call_analyzed` webhook → driver report. Pure; no I/O.
 *
 * Payload (https://docs.retellai.com/features/webhook-overview,
 * https://docs.retellai.com/features/post-call-analysis-consumption):
 *   { event: "call_analyzed", call: { call_id, metadata?, retell_llm_dynamic_variables?,
 *     call_analysis: { custom_analysis_data: { <field name>: value } } } }
 *
 * Custom analysis fields (configured by the scenario owner in Retell):
 *   driver_name, available, available_from, available_until, location_type,
 *   terminal_name, equipment, appointment_outcome, notes
 *
 * Rules: the driver is identified only from call-level configuration
 * (dynamic variables or metadata), never from the extracted name. Times are
 * accepted only when unambiguous and are placed on the configured scenario
 * date in the scenario time zone. Anything missing or ambiguous stays unknown;
 * a report is written only when availability and its start time are known.
 */

import { z } from "zod";
import type { EquipmentType } from "../shared/operational-types.ts";
import { compareIso, setWallClockTime } from "../shared/datetime.ts";
import { RETELL_EQUIPMENT } from "./driver-report-function.ts";

export const POST_CALL_EVENT = "call_analyzed";

export const RetellWebhookSchema = z.object({
  event: z.string().min(1).max(64),
  call: z
    .object({
      call_id: z.string().min(1).max(200),
      agent_id: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
      retell_llm_dynamic_variables: z.record(z.string(), z.unknown()).nullish(),
      call_analysis: z
        .object({
          custom_analysis_data: z.record(z.string(), z.unknown()).nullish(),
          call_successful: z.boolean().nullish(),
        })
        .passthrough()
        .nullish(),
    })
    .passthrough(),
});
export type RetellWebhook = z.infer<typeof RetellWebhookSchema>;

export const ANALYSIS_FIELDS = [
  "driver_name",
  "available",
  "available_from",
  "available_until",
  "location_type",
  "terminal_name",
  "equipment",
  "appointment_outcome",
  "notes",
] as const;

/** Trusted driver id: set when the call was created, not extracted from speech. */
export function trustedDriverId(call: RetellWebhook["call"]): { driverId: string; via: "dynamic_variables" | "metadata" } | null {
  const fromVars = call.retell_llm_dynamic_variables?.driver_id;
  if (typeof fromVars === "string" && fromVars.trim()) return { driverId: fromVars.trim(), via: "dynamic_variables" };
  const fromMeta = call.metadata?.driver_id;
  if (typeof fromMeta === "string" && fromMeta.trim()) return { driverId: fromMeta.trim(), via: "metadata" };
  return null;
}

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t && !/^(unknown|n\/a|none|null|not mentioned|unclear)$/i.test(t) ? t : null;
};

/** true/false from a boolean or an unambiguous yes/no string; otherwise null (unknown). */
export function parseAvailable(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const t = text(value)?.toLowerCase();
  if (!t) return null;
  if (["yes", "true", "available"].includes(t)) return true;
  if (["no", "false", "not available", "unavailable"].includes(t)) return false;
  return null;
}

/**
 * "HH:MM" (24-hour, two-digit hour) or "h[:mm] am/pm" → "HH:MM". Single-digit
 * hours without am/pm ("3:00") are ambiguous and return null.
 */
export function parseSpokenTime(value: unknown): string | null {
  const t = text(value)?.toLowerCase().replace(/\./g, "");
  if (!t) return null;
  const h24 = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  if (h24) return `${h24[1]}:${h24[2]}`;
  const ampm = /^(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)$/.exec(t);
  if (ampm) {
    const hour = (Number(ampm[1]) % 12) + (ampm[3] === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${ampm[2] ?? "00"}`;
  }
  return null;
}

const TERMINAL_NAME = /^terminal\s+([a-c])$/i;

/** Builds a location the recovery engine understands ("Terminal B staging area"); unknown → null. */
export function composeLocation(locationType: unknown, terminalName: unknown): string | null {
  const type = text(locationType)?.toLowerCase().replace(/[\s-]+/g, "_");
  const terminalMatch = text(terminalName)?.match(TERMINAL_NAME);
  const terminal = terminalMatch ? `Terminal ${terminalMatch[1].toUpperCase()}` : null;
  if (!type || !terminal) return null;
  if (type === "terminal") return terminal;
  if (type === "staging_area" || type === "staging") return `${terminal} staging area`;
  return null;
}

export interface PostCallReport {
  availability: "available";
  availableFrom: string;
  availableUntil: string | undefined;
  location: string | undefined;
  equipment: EquipmentType[] | undefined;
  note: string;
}

export type PostCallMapping =
  | { kind: "report"; report: PostCallReport; unknownFields: string[]; extractedDriverName: string | null }
  | { kind: "incomplete"; reason: string; unknownFields: string[] };

/**
 * Maps custom analysis data to a report. `scenarioDate` is an ISO timestamp
 * on the configured demo date in the scenario time zone (its offset is used).
 */
export function mapPostCallAnalysis(data: Record<string, unknown> | null | undefined, scenarioDate: string): PostCallMapping {
  const fields = data ?? {};
  const unknownFields: string[] = [];

  const available = parseAvailable(fields.available);
  const from = parseSpokenTime(fields.available_from);
  const until = parseSpokenTime(fields.available_until);
  if (available === null) unknownFields.push("available");
  if (!from) unknownFields.push("available_from");

  if (available !== true) {
    return {
      kind: "incomplete",
      reason:
        available === false
          ? "driver not available; on-job vs off-duty and return time are not captured by these fields"
          : "availability unknown",
      unknownFields,
    };
  }
  if (!from) return { kind: "incomplete", reason: "available_from missing or ambiguous", unknownFields };

  const availableFrom = setWallClockTime(scenarioDate, from);
  let availableUntil = until ? setWallClockTime(scenarioDate, until) : undefined;
  if (!until) unknownFields.push("available_until");
  if (availableUntil && compareIso(availableUntil, availableFrom) <= 0) {
    availableUntil = undefined; // e.g. past midnight: ambiguous on a single demo date
    unknownFields.push("available_until");
  }

  const location = composeLocation(fields.location_type, fields.terminal_name);
  if (!location) unknownFields.push("location");
  const equipmentKey = text(fields.equipment)?.toLowerCase();
  const equipment = equipmentKey && equipmentKey in RETELL_EQUIPMENT ? [RETELL_EQUIPMENT[equipmentKey]] : undefined;
  if (!equipment) unknownFields.push("equipment");

  const extractedDriverName = text(fields.driver_name);
  const noteParts = [
    text(fields.notes),
    text(fields.appointment_outcome) && `Appointment outcome: ${text(fields.appointment_outcome)}`,
  ]
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`));

  return {
    kind: "report",
    report: {
      availability: "available",
      availableFrom,
      availableUntil,
      location: location ?? undefined,
      equipment,
      note: noteParts.join(" ").slice(0, 500),
    },
    unknownFields,
    extractedDriverName,
  };
}

/** Provider event id for the post-call path: one per call and event type. */
export function postCallProviderEventId(callId: string, event: string): string {
  return `retell:${callId.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 150)}:${event}`;
}

/** Loose comparison used only to flag a possible wrong-person call in logs/notes. */
export function namesDiffer(extracted: string | null, configured: string): boolean {
  if (!extracted) return false;
  const norm = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/)[0] ?? "";
  return norm(extracted) !== norm(configured);
}
