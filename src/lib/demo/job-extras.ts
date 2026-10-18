import type { CriticalityTier, IsoLocal, Job, Priority } from "./frontend-types";
import { toMinutes } from "./time";

export interface JobExtras {
  tier: CriticalityTier;
  consequence: string;
  harmDeadline: IsoLocal;
}

/** Unapproved jobs whose harm deadline is this close to the simulated clock get a "harm soon" badge. */
export const HARM_SOON_MINUTES = 180;

export const TIER_LABEL: Record<CriticalityTier, string> = {
  3: "government",
  2: "verified",
  1: "self-declared",
  0: "none stated",
};

export const TIER_DESCRIPTION: Record<CriticalityTier, string> = {
  3: "Government-designated critical cargo",
  2: "Criticality verified by a third party",
  1: "Criticality self-declared by the customer",
  0: "No criticality stated",
};

const TIER_FROM_PRIORITY: Record<Priority, CriticalityTier> = { critical: 2, high: 1, normal: 0 };

const NOT_STATED = "Not stated";

/**
 * PLACEHOLDER values for the demo only — fictional, not sourced from any
 * customer or agency. Replace this lookup with backend data; once jobs carry
 * `tier`, `consequence` and `harmDeadline` themselves, those fields win.
 */
const PLACEHOLDER_EXTRAS: Record<string, Partial<JobExtras>> = {
  "job-01": {
    tier: 2,
    consequence: "Ventilator supplies for a hospital; patient care delayed",
    harmDeadline: "2026-10-17T09:15:00",
  },
  "job-04": {
    tier: 1,
    consequence: "Perishable groceries spoil if not moved today",
    harmDeadline: "2026-10-17T14:00:00",
  },
  "job-07": {
    tier: 0,
    consequence: "Seasonal décor restock; no customer impact today",
    harmDeadline: "2026-10-17T23:00:00",
  },
  "job-12": {
    tier: 2,
    consequence: "Assembly-line parts; plant idles the afternoon shift",
    harmDeadline: "2026-10-17T09:30:00",
  },
  "job-20": {
    tier: 3,
    consequence: "Emergency shelter supplies under a government relief order",
    harmDeadline: "2026-10-17T10:00:00",
  },
};

export function getJobExtras(job: Job): JobExtras {
  const placeholder = PLACEHOLDER_EXTRAS[job.id] ?? {};
  return {
    tier: job.tier ?? placeholder.tier ?? TIER_FROM_PRIORITY[job.priority],
    consequence: job.consequence ?? placeholder.consequence ?? NOT_STATED,
    harmDeadline: job.harmDeadline ?? placeholder.harmDeadline ?? job.deadline,
  };
}

export function isConsequenceStated(consequence: string): boolean {
  return consequence !== NOT_STATED;
}

/** Minutes until harm for unapproved jobs inside the harm-soon window, otherwise null. */
export function harmSoonMinutes(job: Job, now: IsoLocal): number | null {
  if (job.approval) return null;
  const left = toMinutes(getJobExtras(job).harmDeadline) - toMinutes(now);
  return left <= HARM_SOON_MINUTES ? left : null;
}

export function formatHarmCountdown(minutes: number): string {
  if (minutes <= 0) return "Harm deadline passed";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Harm in ${h}h ${m}m`;
}
