/**
 * API contract shared by the frontend and the route handlers. Safe to import
 * from client components: contains only Zod schemas and types, no server code.
 * Human-readable version with examples: docs/backend-contract.md.
 */

import { z } from "zod";
import { isIsoDateTime } from "./datetime";
import {
  EQUIPMENT_TYPES,
  REPORTABLE_AVAILABILITIES,
  type Driver,
  type DriverReport,
  type OperationalSnapshot,
} from "./operational-types";

/** ISO 8601 date-time with an explicit offset, e.g. "2026-10-19T15:00:00-07:00". */
const IsoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .refine(isIsoDateTime, "Expected ISO 8601 date-time with offset, e.g. 2026-10-19T15:00:00-07:00");

/* ------------------------------------------------------------ demo session */

export const DemoSessionRequestSchema = z.strictObject({
  accessCode: z.string().min(1).max(200),
});
export type DemoSessionRequest = z.infer<typeof DemoSessionRequestSchema>;

export interface DemoSessionResponse {
  authenticated: boolean;
  /** Real-world expiry instant, present when authenticated. */
  expiresAt: string | null;
}

/* ----------------------------------------------------------- driver report */

const PROVIDER_EVENT_ID = /^[A-Za-z0-9._:-]+$/;

/**
 * Body of POST /api/driver-reports. `source` is not accepted here: the server
 * records it from the authenticated channel ("dispatcher" for this endpoint).
 */
export const DriverReportRequestSchema = z
  .strictObject({
    driverId: z.string().min(1).max(64),
    availability: z.enum(REPORTABLE_AVAILABILITIES),
    /** Start of the reported availability window. */
    availableFrom: IsoDateTimeSchema,
    /** End of the reported availability window, if the driver gave one. */
    availableUntil: IsoDateTimeSchema.optional(),
    /** Reported location, e.g. "Terminal B staging area". */
    location: z.string().trim().min(1).max(200).optional(),
    /** Reported equipment; replaces the driver's equipment when present. */
    equipment: z.array(z.enum(EQUIPMENT_TYPES)).min(1).max(EQUIPMENT_TYPES.length).optional(),
    note: z.string().trim().max(500).default(""),
    /** Client-generated unique ID (e.g. crypto.randomUUID()); makes retries idempotent. */
    providerEventId: z.string().min(8).max(200).regex(PROVIDER_EVENT_ID, "Use letters, digits, . _ : -"),
    /** When the driver gave the report. Defaults to the server receipt time. */
    reportedAt: IsoDateTimeSchema.optional(),
  })
  .refine((r) => !r.availableUntil || Date.parse(r.availableUntil) > Date.parse(r.availableFrom), {
    path: ["availableUntil"],
    message: "availableUntil must be after availableFrom",
  });
export type DriverReportRequest = z.input<typeof DriverReportRequestSchema>;
export type ParsedDriverReportRequest = z.output<typeof DriverReportRequestSchema>;

export interface DriverReportResponse {
  /** True when this providerEventId was already processed; nothing was re-applied. */
  duplicate: boolean;
  report: DriverReport;
  driver: Driver;
  inputsVersion: number;
  /** True when this report invalidated a pending recovery plan. */
  planInvalidated: boolean;
}

/* ------------------------------------------------------------------- state */

export type StateResponse = OperationalSnapshot;

/* ------------------------------------------------------------------ errors */

export const API_ERROR_CODES = [
  "invalid_request",
  "unsupported_media_type",
  "unauthenticated",
  "forbidden_origin",
  "invalid_access_code",
  "driver_not_found",
  "backend_not_configured",
  "dataset_incomplete",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level validation messages, keyed by dotted path. */
    fields?: Record<string, string[]>;
  };
}
