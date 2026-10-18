/**
 * Driver–job feasibility under the scenario's SYNTHETIC timing estimates
 * (travel 15 min within an area / 30 min between areas, 2 h job reservation
 * covering pickup and delivery). Pure and deterministic.
 *
 * A trip is: depart (≥ now, ≥ availableFrom) → travel → pickup (inside the
 * appointment window) → reservation of jobReservationMinutes → completion
 * (≤ harm deadline, ≤ availableUntil). The interval [depart, completion)
 * must not overlap any of the driver's reservations. If the earliest pickup
 * conflicts, later pickups inside the window are tried (after each
 * conflicting reservation ends).
 */

import type { Driver, Job, ProposedAssignment, ReservationWindow } from "../shared/operational-types.ts";
import { addMinutesIso, toEpochMs, toZonedIso } from "../shared/datetime.ts";
import type { TimingEstimates } from "./scenario-config.ts";

export interface FeasibilityContext {
  now: string;
  timeZone: string;
  timing: TimingEstimates;
  /** Area of a reported driver location, or null if unknown. */
  areaOfLocation: (location: string) => string | null;
  /** Area of the job's pickup terminal. */
  jobArea: string;
}

export type InfeasibleReason =
  | "driver_not_reported"
  | "driver_unreachable"
  | "driver_off_duty"
  | "equipment_mismatch"
  | "availability_unknown"
  | "location_unknown"
  | "no_appointment_window"
  | "pickup_window_missed"
  | "completion_after_harm_deadline"
  | "availability_ends_before_completion"
  | "reservation_conflict";

export interface FeasibilityResult {
  driverId: string;
  feasible: boolean;
  proposal: ProposedAssignment | null;
  /** Empty when feasible. */
  reasons: InfeasibleReason[];
  /** Jobs whose reservations conflicted with otherwise-valid pickups. */
  conflictsWith: string[];
}

const max = (a: number, b: number) => (a > b ? a : b);

export function travelMinutes(fromArea: string, toArea: string, timing: TimingEstimates): number {
  return fromArea === toArea ? timing.sameAreaTravelMinutes : timing.betweenAreasTravelMinutes;
}

export function evaluateFeasibility(
  job: Job,
  driver: Driver,
  driverReservations: ReservationWindow[],
  ctx: FeasibilityContext,
): FeasibilityResult {
  const fail = (...reasons: InfeasibleReason[]): FeasibilityResult => ({
    driverId: driver.id,
    feasible: false,
    proposal: null,
    reasons,
    conflictsWith: [],
  });

  if (driver.availability === "not-reported") return fail("driver_not_reported");
  if (driver.availability === "unreachable") return fail("driver_unreachable");
  if (driver.availability === "off-duty") return fail("driver_off_duty");
  if (!driver.equipment.includes(job.requiredEquipment)) return fail("equipment_mismatch");
  if (!driver.availableFrom) return fail("availability_unknown");
  const fromArea = driver.location ? ctx.areaOfLocation(driver.location) : null;
  if (!fromArea) return fail("location_unknown");
  const window = job.appointment.window;
  if (!window) return fail("no_appointment_window");

  const travel = travelMinutes(fromArea, ctx.jobArea, ctx.timing);
  const reservationMs = ctx.timing.jobReservationMinutes * 60_000;
  const travelMs = travel * 60_000;
  const earliestPickup = max(max(toEpochMs(ctx.now), toEpochMs(driver.availableFrom)) + travelMs, toEpochMs(window.start));
  const windowEnd = toEpochMs(window.end);
  const deadline = toEpochMs(job.deadline);
  const until = driver.availableUntil ? toEpochMs(driver.availableUntil) : Number.POSITIVE_INFINITY;
  const reservations = driverReservations.map((r) => ({ jobId: r.jobId, start: toEpochMs(r.start), end: toEpochMs(r.end) }));

  // Candidate pickups: the earliest one, then just after each reservation ends.
  const candidates = [earliestPickup, ...reservations.map((r) => r.end + travelMs)]
    .filter((p) => p >= earliestPickup)
    .sort((a, b) => a - b);

  const reasons = new Set<InfeasibleReason>();
  const conflicts = new Set<string>();
  for (const pickup of candidates) {
    if (pickup > windowEnd) {
      reasons.add("pickup_window_missed");
      break; // later candidates are later still
    }
    const completion = pickup + reservationMs;
    if (completion > deadline) reasons.add("completion_after_harm_deadline");
    if (completion > until) reasons.add("availability_ends_before_completion");
    if (completion > deadline || completion > until) continue;
    const depart = pickup - travelMs;
    const clashing = reservations.filter((r) => r.start < completion && depart < r.end);
    if (clashing.length) {
      reasons.add("reservation_conflict");
      clashing.forEach((r) => conflicts.add(r.jobId));
      continue;
    }
    return {
      driverId: driver.id,
      feasible: true,
      proposal: {
        driverId: driver.id,
        departAt: toZonedIso(depart, ctx.timeZone),
        pickupAt: toZonedIso(pickup, ctx.timeZone),
        completeBy: toZonedIso(completion, ctx.timeZone),
        travelMinutes: travel,
      },
      reasons: [],
      conflictsWith: [],
    };
  }
  return { driverId: driver.id, feasible: false, proposal: null, reasons: [...reasons], conflictsWith: [...conflicts].sort() };
}

/** Reservation window for an assignment starting at the appointment start (no travel known). */
export function reservationFromAppointment(
  job: Job,
  driverId: string,
  timing: TimingEstimates,
  timeZone: string,
): ReservationWindow | null {
  const start = job.appointment.window?.start;
  if (!start) return null;
  return {
    driverId,
    jobId: job.id,
    start: toZonedIso(start, timeZone),
    end: toZonedIso(addMinutesIso(start, timing.jobReservationMinutes), timeZone),
    kind: "existing_assignment",
  };
}
