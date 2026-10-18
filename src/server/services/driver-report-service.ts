import "server-only";
import type { DriverReportResponse, ParsedDriverReportRequest } from "@/lib/shared/api-contract";
import type {
  Driver,
  DriverReport,
  DriverReportSource,
  EquipmentType,
  ReportableAvailability,
} from "@/lib/shared/operational-types";

/**
 * Shared driver-report service. Every channel that reports driver status —
 * the dispatcher check-in endpoint today, the Retell webhook later — goes
 * through `submitDriverReport` so provenance, deduplication and plan
 * invalidation behave identically.
 *
 * The store applies a report atomically (see apply_driver_report() in the
 * migration): dedupe on (source, providerEventId), persist provenance, update
 * the driver, log the event, bump inputsVersion, invalidate a pending plan.
 */

export class DriverNotFoundError extends Error {
  constructor(readonly driverId: string) {
    super(`Driver not found: ${driverId}`);
    this.name = "DriverNotFoundError";
  }
}

export interface ApplyDriverReportInput {
  driverId: string;
  source: DriverReportSource;
  providerEventId: string;
  reportedAt: string;
  availability: ReportableAvailability;
  availableFrom: string;
  availableUntil: string | null;
  location: string | null;
  equipment: EquipmentType[] | null;
  note: string;
}

export interface ApplyDriverReportResult {
  duplicate: boolean;
  report: DriverReport;
  inputsVersion: number;
  planInvalidated: boolean;
}

export interface DriverReportStore {
  applyDriverReport(input: ApplyDriverReportInput): Promise<ApplyDriverReportResult>;
  getDriver(driverId: string): Promise<Driver | null>;
}

export interface SubmitDriverReportInput extends ParsedDriverReportRequest {
  /** Determined by the server from the authenticated channel, never from the body. */
  source: DriverReportSource;
  /** Server receipt instant; used as reportedAt when the source omits it. */
  receivedAt: Date;
}

export async function submitDriverReport(
  store: DriverReportStore,
  input: SubmitDriverReportInput,
): Promise<DriverReportResponse> {
  const result = await store.applyDriverReport({
    driverId: input.driverId,
    source: input.source,
    providerEventId: input.providerEventId,
    reportedAt: input.reportedAt ?? input.receivedAt.toISOString(),
    availability: input.availability,
    availableFrom: input.availableFrom,
    availableUntil: input.availableUntil ?? null,
    location: input.location?.trim() || null,
    equipment: input.equipment ?? null,
    note: input.note.trim(),
  });

  const driver = await store.getDriver(input.driverId);
  if (!driver) throw new DriverNotFoundError(input.driverId);

  return { ...result, driver };
}
