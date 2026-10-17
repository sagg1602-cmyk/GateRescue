/**
 * Local, deterministic recovery heuristic for the demo. This is NOT an
 * optimizer and nothing here leaves the browser. Same inputs → same plan.
 *
 * For each unapproved job, in order of priority → deadline → appointment:
 *   1. appointment confirmed?   (unverified → awaiting verification)
 *   2. container available?     (no → blocked)
 *   3. holds cleared?           (no → blocked)
 *   4. compatible equipment on a reachable driver?
 *   5. driver free for the move without a time conflict?
 * Drivers proposed earlier in the same run are reserved, so one plan never
 * double-books a driver.
 */

import type {
  BusySlot,
  Driver,
  Job,
  Recommendation,
  RecoveryCheck,
  Terminal,
} from "./frontend-types";
import { EQUIPMENT_LABELS, HOLD_LABELS } from "./synthetic-data";
import { addMinutes, formatTime, formatWindow, overlaps, toMinutes } from "./time";

/** Minutes a driver is committed per move, starting at the appointment start. */
export const DRIVER_BLOCK_MINUTES = 120;

const PRIORITY_RANK = { critical: 0, high: 1, normal: 2 } as const;

export function isDriverReachable(driver: Driver): boolean {
  return driver.availability === "available" || driver.availability === "on-job";
}

export function sortJobsForPlanning(jobs: Job[]): Job[] {
  return [...jobs].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      toMinutes(a.deadline) - toMinutes(b.deadline) ||
      (a.appointment.window ? toMinutes(a.appointment.window.start) : 9999) -
        (b.appointment.window ? toMinutes(b.appointment.window.start) : 9999) ||
      a.id.localeCompare(b.id),
  );
}

export function generateRecoveryPlan(
  jobs: Job[],
  drivers: Driver[],
  terminals: Terminal[],
  now: string,
): Recommendation[] {
  const reservations = new Map<string, BusySlot[]>(drivers.map((d) => [d.id, [...d.busy]]));
  const planCount = new Map<string, number>(drivers.map((d) => [d.id, 0]));

  return sortJobsForPlanning(jobs.filter((job) => job.approval === null)).map((job) => {
    const terminal = terminals.find((x) => x.id === job.terminalId);
    const appt = job.appointment;
    const checks: RecoveryCheck[] = [];

    // 1. Appointment
    if (appt.status === "confirmed") {
      checks.push({ label: "Appointment", result: "pass", detail: `Confirmed ${formatWindow(appt.window)}` });
    } else if (appt.status === "unverified") {
      const was = appt.preOutage ? ` (was ${appt.preOutage.status} ${formatWindow(appt.preOutage.window)})` : "";
      checks.push({
        label: "Appointment",
        result: "fail",
        detail: `Unverified — ${terminal?.shortName ?? "terminal"} portal ${terminal?.portalStatus === "reconciling" ? "reconciling" : "unreachable"}${was}`,
      });
    } else if (appt.status === "lost") {
      checks.push({ label: "Appointment", result: "fail", detail: "Slot lost during outage — rebook required" });
    } else {
      checks.push({ label: "Appointment", result: "fail", detail: "No appointment booked" });
    }

    // 2. Container availability
    checks.push(
      job.containerAvailable
        ? { label: "Container availability", result: "pass", detail: "Released and available for pickup" }
        : { label: "Container availability", result: "fail", detail: "Not yet available at terminal" },
    );

    // 3. Holds
    checks.push(
      job.holds.length === 0
        ? { label: "Holds", result: "pass", detail: "No holds" }
        : { label: "Holds", result: "fail", detail: job.holds.map((h) => HOLD_LABELS[h]).join(", ") },
    );

    const hardBlocked =
      appt.status === "none" || appt.status === "lost" || !job.containerAvailable || job.holds.length > 0;

    if (hardBlocked || !appt.window) {
      checks.push(
        { label: "Compatible equipment", result: "skip", detail: "Not evaluated until blockers clear" },
        { label: "Driver time conflicts", result: "skip", detail: "Not evaluated until blockers clear" },
      );
      return finish(job, "blocked", null, checks, drivers);
    }

    // 4. Equipment on reachable drivers
    const equipmentLabel = EQUIPMENT_LABELS[job.requiredEquipment];
    const compatible = drivers.filter((d) => d.equipment.includes(job.requiredEquipment));
    const reachable = compatible.filter(isDriverReachable);
    if (reachable.length === 0) {
      const unreachableNames = compatible.map((d) => `${d.name} (${d.availability})`).join(", ");
      checks.push({
        label: "Compatible equipment",
        result: "fail",
        detail: compatible.length
          ? `${equipmentLabel} only with ${unreachableNames}`
          : `No driver has ${equipmentLabel}`,
      });
      checks.push({ label: "Driver time conflicts", result: "skip", detail: "No compatible driver to check" });
      return finish(job, "blocked", null, checks, drivers);
    }
    checks.push({
      label: "Compatible equipment",
      result: "pass",
      detail: `${equipmentLabel}: ${reachable.map((d) => d.name).join(", ")}`,
    });

    // 5. Time conflicts
    const block: BusySlot = {
      start: appt.window.start,
      end: addMinutes(appt.window.start, DRIVER_BLOCK_MINUTES),
      label: job.container,
      jobId: job.id,
    };
    if (toMinutes(block.start) < toMinutes(now)) {
      checks.push({ label: "Driver time conflicts", result: "fail", detail: `Appointment start ${formatTime(block.start)} already passed` });
      return finish(job, "blocked", null, checks, drivers);
    }
    const free = reachable
      .filter((d) => toMinutes(d.availableFrom) <= toMinutes(block.start))
      .filter((d) => !(reservations.get(d.id) ?? []).some((slot) => overlaps(slot, block)))
      .sort(
        (a, b) =>
          (planCount.get(a.id) ?? 0) - (planCount.get(b.id) ?? 0) ||
          toMinutes(a.availableFrom) - toMinutes(b.availableFrom) ||
          a.id.localeCompare(b.id),
      );

    if (free.length === 0) {
      checks.push({
        label: "Driver time conflicts",
        result: "fail",
        detail: `Every compatible driver is committed during ${formatTime(block.start)}–${formatTime(block.end)}`,
      });
      return finish(job, "blocked", null, checks, drivers);
    }

    const chosen = free[0];
    reservations.get(chosen.id)?.push(block);
    planCount.set(chosen.id, (planCount.get(chosen.id) ?? 0) + 1);
    checks.push({
      label: "Driver time conflicts",
      result: "pass",
      detail: `${chosen.name} free ${formatTime(block.start)}–${formatTime(block.end)}`,
    });

    return finish(job, appt.status === "confirmed" ? "ready" : "awaiting-verification", chosen.id, checks, drivers);
  });
}

function finish(
  job: Job,
  category: Recommendation["category"],
  driverId: string | null,
  checks: RecoveryCheck[],
  drivers: Driver[],
): Recommendation {
  const driver = drivers.find((d) => d.id === driverId);
  const failed = checks.filter((c) => c.result === "fail").map((c) => `${c.label.toLowerCase()}: ${c.detail}`);
  let explanation: string;
  if (category === "ready" && driver) {
    explanation = `Propose ${driver.name}: appointment confirmed, container available, no holds, ${EQUIPMENT_LABELS[job.requiredEquipment]} on hand, and no schedule conflict.`;
  } else if (category === "awaiting-verification" && driver) {
    explanation = `${driver.name} is tentatively held, but the appointment must be explicitly reconfirmed before this can be approved.`;
  } else {
    explanation = `Blocked — ${failed.join("; ")}.`;
  }
  return { jobId: job.id, category, driverId, checks, explanation, approved: false };
}
