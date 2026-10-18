import type { StateResponse } from "@/lib/shared/api-contract";
import { recoveryCounts } from "./snapshot-display";
import { StatCardRow, type StatCard } from "./SummaryCards";

/** Counts from the snapshot: the three queue statuses, recovery-queue scope, and roster size. */
export function LiveSummaryCards({ snapshot }: { snapshot: StateResponse | null }) {
  const counts = recoveryCounts(snapshot);
  const queueMissing = snapshot !== null && snapshot.recoveryQueue === null;
  const scopeHint = !snapshot
    ? "Loading the backend snapshot"
    : queueMissing
      ? "Recovery queue not computed"
      : "Jobs ranked in the recovery queue";
  const cards: StatCard[] = [
    {
      label: "Ready for approval",
      value: counts.ready,
      hint: "All checks pass; a dispatcher approves each one",
      featured: true,
    },
    { label: "Awaiting verification", value: counts.awaiting, hint: "Appointment or input must be confirmed first" },
    { label: "Blocked", value: counts.blocked, hint: "A mandatory check fails; see blocker and next action" },
    {
      label: "In recovery scope",
      value: counts.inScope,
      hint: counts.totalJobs === null ? scopeHint : `of ${counts.totalJobs} jobs in the snapshot; ${scopeHint.toLowerCase()}`,
    },
  ];

  return <StatCardRow cards={cards} />;
}
