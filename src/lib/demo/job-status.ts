import type { Driver, Job, Terminal } from "./frontend-types";
import { HOLD_LABELS } from "./synthetic-data";
import { toMinutes } from "./time";

export type Tone = "neutral" | "teal" | "amber" | "red";

export interface JobStatus {
  blocker: { label: string; tone: Tone } | null;
  nextAction: string;
}

/** Jobs due within this many minutes of the simulated clock count as urgent. */
export const URGENT_WINDOW_MINUTES = 180;

export function isOutageAffected(job: Job): boolean {
  return job.appointment.preOutage !== null && job.appointment.status !== "confirmed";
}

export function isUrgent(job: Job, now: string): boolean {
  if (job.approval) return false;
  return job.priority === "critical" || toMinutes(job.deadline) - toMinutes(now) <= URGENT_WINDOW_MINUTES;
}

export function getJobStatus(job: Job, terminal: Terminal | undefined, drivers: Driver[]): JobStatus {
  const appt = job.appointment;
  const portal = terminal?.portalStatus ?? "online";
  const name = terminal?.shortName ?? "terminal";

  if (job.approval) {
    const driver = drivers.find((d) => d.id === job.approval?.driverId)?.name ?? "driver";
    if (appt.status !== "confirmed") {
      return {
        blocker: { label: "Approved move has unverified appointment", tone: "amber" },
        nextAction: `Reconfirm appointment before ${driver} rolls`,
      };
    }
    return { blocker: null, nextAction: `Approved for ${driver} — dispatch happens outside this demo` };
  }
  if (job.holds.length > 0) {
    return {
      blocker: { label: job.holds.map((h) => HOLD_LABELS[h]).join(", "), tone: "red" },
      nextAction: "Work hold release with broker",
    };
  }
  if (!job.containerAvailable) {
    return { blocker: { label: "Container not available", tone: "red" }, nextAction: "Monitor release status" };
  }
  if (appt.status === "none") {
    return { blocker: { label: "No appointment", tone: "red" }, nextAction: `Book ${name} appointment` };
  }
  if (appt.status === "lost") {
    return { blocker: { label: "Appointment lost in outage", tone: "red" }, nextAction: `Rebook ${name} appointment` };
  }
  if (appt.status === "unverified") {
    return portal === "reconciling"
      ? { blocker: { label: "Awaiting reconfirmation", tone: "amber" }, nextAction: "Reconfirm or mark lost" }
      : { blocker: { label: `${name} portal outage`, tone: "amber" }, nextAction: "Hold — verify once access returns" };
  }
  return { blocker: null, nextAction: "Include in recovery plan" };
}
