/**
 * Backend recovery engine. Deterministic: same input → same queue.
 *
 * 1. Scope: outage-affected jobs (appointment has a pre-outage snapshot) plus
 *    unassigned jobs. Jobs already approved by a dispatcher are excluded.
 * 2. Reservations: original assignments OUTSIDE the scope (and dispatcher
 *    approvals) are preserved and reserve the driver; original assignments
 *    INSIDE the scope are kept as history only.
 * 3. Rank: criticality tier desc → full harm-deadline timestamp asc → job id.
 * 4. Mandatory constraints, in order: no blocking hold, container available,
 *    terminal open, verified appointment. Jobs failing any constraint get no
 *    driver ("drop jobs failing mandatory constraints"); an unverified
 *    appointment alone yields awaiting_verification, anything else blocked.
 * 5. Jobs passing all constraints get the feasible driver with the earliest
 *    pickup (then shortest travel, then driver id), whose time is reserved
 *    before the next job is considered.
 */

import type {
  Driver,
  EquipmentType,
  Job,
  RecoveryCheck,
  RecoveryQueue,
  RecoveryQueueEntry,
  ReservationWindow,
  Terminal,
} from "../shared/operational-types.ts";
import { compareIso, toEpochMs, toZonedIso } from "../shared/datetime.ts";
import { evaluateFeasibility, reservationFromAppointment, type FeasibilityResult } from "./feasibility.ts";
import type { RecoveryConfig } from "./scenario-config.ts";

export interface RecoveryEngineInput {
  now: string;
  timeZone: string;
  jobs: Job[];
  drivers: Driver[];
  terminals: Terminal[];
  config: RecoveryConfig;
}

export const NEXT_ACTIONS = {
  approve: "dispatcher_approves",
  reconfirm: "call_terminal_to_reconfirm",
  resolveHold: (hold: string) => `resolve_${hold}_hold`,
  confirmContainer: "confirm_container_status",
  rebook: "rebook_appointment",
  waitForReport: (family: string) => `wait_for_${family}_driver_report`,
  contactUnreachable: "contact_unreachable_driver",
  findCapacity: "find_additional_capacity",
} as const;

export function equipmentFamily(equipment: EquipmentType): string {
  return equipment === "reefer-40" ? "reefer" : equipment === "triaxle" ? "triaxle" : "dry";
}

export function isInRecoveryScope(job: Job, config: RecoveryConfig): boolean {
  if (job.approval) return false;
  const affected = config.scope.includeOutageAffectedJobs && job.appointment.preOutage !== null;
  const unassigned = config.scope.includeUnassignedJobs && !job.originalAssignedDriverId;
  return affected || unassigned;
}

/** Harm deadline when known, otherwise the delivery deadline. */
export function harmDeadlineOf(job: Job): string {
  return job.harmDeadline ?? job.deadline;
}

export function compareForRanking(a: Job, b: Job): number {
  const tierA = a.tier ?? -1;
  const tierB = b.tier ?? -1;
  return tierB - tierA || compareIso(harmDeadlineOf(a), harmDeadlineOf(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function buildRecoveryQueue(input: RecoveryEngineInput): RecoveryQueue {
  const { now, timeZone, jobs, drivers, terminals, config } = input;
  const timing = config.timingEstimates;
  const terminalById = new Map(terminals.map((t) => [t.id, t]));
  const areaOfLocation = (location: string) => config.locationAreas[location] ?? null;

  const scoped = jobs.filter((j) => isInRecoveryScope(j, config)).sort(compareForRanking);
  const scopedIds = new Set(scoped.map((j) => j.id));

  // Existing reservations: outside-scope original assignments, approvals, busy slots.
  const reservations: ReservationWindow[] = [];
  for (const job of jobs) {
    const driverId = job.approval?.driverId ?? (scopedIds.has(job.id) ? null : job.originalAssignedDriverId);
    if (!driverId) continue;
    const r = reservationFromAppointment(job, driverId, timing, timeZone);
    if (r) reservations.push(r);
  }
  for (const driver of drivers) {
    for (const slot of driver.busy) {
      reservations.push({
        driverId: driver.id,
        jobId: slot.jobId ?? slot.label,
        start: toZonedIso(slot.start, timeZone),
        end: toZonedIso(slot.end, timeZone),
        kind: "existing_assignment",
      });
    }
  }

  const entries: RecoveryQueueEntry[] = scoped.map((job, index) => {
    const terminal = terminalById.get(job.terminalId);
    const checks: RecoveryCheck[] = [];
    const base = {
      rank: index + 1,
      jobId: job.id,
      criticalityTier: job.tier ?? null,
      criticalityBasis: job.criticalityBasis ?? null,
      harmDeadline: harmDeadlineOf(job),
      originalAssignedDriverId: job.originalAssignedDriverId ?? null,
    };
    const result = (
      status: RecoveryQueueEntry["status"],
      blocker: string | null,
      owner: string,
      nextAction: string,
      proposal: FeasibilityResult["proposal"] = null,
    ): RecoveryQueueEntry => ({
      ...base,
      status,
      blocker,
      owner,
      nextAction,
      proposedDriverId: proposal?.driverId ?? null,
      proposal,
      checks,
    });

    // Mandatory constraints.
    const hold = job.holds[0];
    checks.push(
      hold
        ? { label: "No blocking hold", result: "fail", detail: job.holds.map((h) => `${h} hold`).join(", ") }
        : { label: "No blocking hold", result: "pass", detail: "No holds" },
    );
    checks.push(
      job.containerAvailable === true
        ? { label: "Container available", result: "pass", detail: `Available${job.containerAvailabilityAsOf ? ` as of ${job.containerAvailabilityAsOf}` : ""}` }
        : { label: "Container available", result: "fail", detail: job.containerAvailable === false ? "Not available" : "Unknown" },
    );
    // A scheduling-system outage is not a physical closure; no closure data exists in this model.
    checks.push({
      label: "Terminal open",
      result: "pass",
      detail: terminal?.portalStatus === "online" ? "Open" : `Open; scheduling system ${terminal?.portalStatus ?? "unknown"}`,
    });
    const appt = job.appointment;
    checks.push(
      appt.status === "confirmed" && appt.window
        ? { label: "Verified appointment in window", result: "pass", detail: `${appt.window.start} – ${appt.window.end}` }
        : { label: "Verified appointment in window", result: "fail", detail: `Appointment ${appt.status}` },
    );

    if (hold) return result("blocked", `${hold}_hold`, "customer", NEXT_ACTIONS.resolveHold(hold));
    if (job.containerAvailable !== true) {
      return result("blocked", job.containerAvailable === false ? "container_unavailable" : "container_status_unknown", "dispatcher", NEXT_ACTIONS.confirmContainer);
    }
    if (appt.status === "unverified") return result("awaiting_verification", "appointment_unverified", "dispatcher", NEXT_ACTIONS.reconfirm);
    if (appt.status !== "confirmed" || !appt.window) return result("blocked", "appointment_missing", "dispatcher", NEXT_ACTIONS.rebook);

    // Driver assignment.
    const evaluations = drivers
      .map((driver) =>
        evaluateFeasibility(job, driver, reservations.filter((r) => r.driverId === driver.id), {
          now,
          timeZone,
          timing,
          areaOfLocation,
          jobArea: terminal?.shortName ?? job.terminalId,
        }),
      )
      .sort((a, b) => a.driverId.localeCompare(b.driverId));
    for (const e of evaluations) {
      checks.push({
        label: `Driver ${e.driverId}`,
        result: e.feasible ? "pass" : "fail",
        detail: e.feasible
          ? `${timing.label}: depart ${e.proposal?.departAt}, pickup ${e.proposal?.pickupAt}, complete ${e.proposal?.completeBy}`
          : `${e.reasons.join(", ")}${e.conflictsWith.length ? ` (${e.conflictsWith.join(", ")})` : ""}`,
      });
    }
    const feasible = evaluations
      .filter((e) => e.feasible && e.proposal)
      .sort(
        (a, b) =>
          toEpochMs(a.proposal!.pickupAt) - toEpochMs(b.proposal!.pickupAt) ||
          a.proposal!.travelMinutes - b.proposal!.travelMinutes ||
          a.driverId.localeCompare(b.driverId),
      );
    const chosen = feasible[0];
    if (chosen?.proposal) {
      reservations.push({
        driverId: chosen.driverId,
        jobId: job.id,
        start: chosen.proposal.departAt,
        end: chosen.proposal.completeBy,
        kind: "proposed",
      });
      return result("ready_for_approval", null, "dispatcher", NEXT_ACTIONS.approve, chosen.proposal);
    }

    const compatible = drivers.filter((d) => d.equipment.includes(job.requiredEquipment));
    const nextAction = compatible.some((d) => d.availability === "not-reported")
      ? NEXT_ACTIONS.waitForReport(equipmentFamily(job.requiredEquipment))
      : compatible.some((d) => d.availability === "unreachable")
        ? NEXT_ACTIONS.contactUnreachable
        : NEXT_ACTIONS.findCapacity;
    return result("blocked", "no_feasible_assignment", "dispatcher", nextAction);
  });

  return {
    computedAt: toZonedIso(now, timeZone),
    estimatesLabel: `${timing.label}: ${timing.sameAreaTravelMinutes} min within an area, ${timing.betweenAreasTravelMinutes} min between areas, ${timing.jobReservationMinutes} min job reservation (${timing.jobReservationIncludes ?? "pickup and delivery"})`,
    entries,
    reservations: reservations.sort((a, b) => compareIso(a.start, b.start) || a.driverId.localeCompare(b.driverId)),
  };
}
