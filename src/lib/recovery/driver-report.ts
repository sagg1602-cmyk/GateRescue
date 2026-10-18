/**
 * Pure mirror of the database function apply_driver_report() (see the
 * scenario migration). Used by tests and anywhere a report must be applied
 * to an in-memory snapshot. Keep the two in sync.
 */

import type { Driver, EquipmentType, ReportableAvailability } from "../shared/operational-types.ts";
import { addMinutesIso, compareIso, toZonedIso } from "../shared/datetime.ts";

/** A report within this window after the simulated clock advances the clock to the report time. */
export const SIM_CLOCK_JUMP_LIMIT_MINUTES = 12 * 60;

export interface DriverReportInput {
  availability: ReportableAvailability;
  availableFrom: string;
  availableUntil?: string | null;
  location?: string | null;
  equipment?: EquipmentType[] | null;
  note?: string;
  reportedAt: string;
}

/**
 * Simulated time at which a report is applied: the report time if it lies
 * within 12 hours after the clock, otherwise the clock plus one minute
 * (e.g. a real-time Retell call on a different day). Never moves backwards.
 */
export function computeAppliedAt(simNow: string, reportedAt: string, timeZone: string): string {
  const tick = addMinutesIso(simNow, 1);
  const withinWindow =
    compareIso(reportedAt, tick) >= 0 && compareIso(reportedAt, addMinutesIso(simNow, SIM_CLOCK_JUMP_LIMIT_MINUTES)) <= 0;
  return toZonedIso(withinWindow ? reportedAt : tick, timeZone);
}

export function applyDriverReport(driver: Driver, report: DriverReportInput, appliedAt: string): Driver {
  const note = (report.note ?? "").trim();
  return {
    ...driver,
    availability: report.availability,
    availableFrom: report.availableFrom,
    availableUntil: report.availableUntil ?? null,
    location: report.location?.trim() ? report.location.trim() : (driver.location ?? null),
    equipment: report.equipment?.length ? [...report.equipment] : driver.equipment,
    lastReport: appliedAt,
    lastNote: note || driver.lastNote,
  };
}
