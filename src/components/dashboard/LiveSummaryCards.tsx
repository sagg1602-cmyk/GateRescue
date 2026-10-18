import type { ReactNode } from "react";
import type { StateResponse } from "@/lib/shared/api-contract";
import { recoveryCounts } from "./snapshot-display";

interface SummaryCard {
  label: string;
  value: number | null;
  hint: ReactNode;
  accent: "teal" | "amber" | "red" | "slate";
}

const ACCENTS: Record<SummaryCard["accent"], string> = {
  teal: "border-t-teal-500",
  amber: "border-t-amber-500",
  red: "border-t-red-500",
  slate: "border-t-slate-400",
};

/** Counts from the snapshot: roster size, recovery-queue scope, and the three queue statuses. */
export function LiveSummaryCards({ snapshot }: { snapshot: StateResponse | null }) {
  const counts = recoveryCounts(snapshot);
  const queueMissing = snapshot !== null && snapshot.recoveryQueue === null;
  const scopeHint = !snapshot
    ? "Loading the backend snapshot"
    : queueMissing
      ? "Recovery queue not computed"
      : "Jobs ranked in the recovery queue";
  const cards: SummaryCard[] = [
    { label: "Total jobs", value: counts.totalJobs, hint: "Jobs in the backend snapshot", accent: "slate" },
    {
      label: "Jobs in recovery scope",
      value: counts.inScope,
      hint: scopeHint,
      accent: "slate",
    },
    {
      label: "Ready for approval",
      value: counts.ready,
      hint: "Queue status ready for approval",
      accent: "teal",
    },
    {
      label: "Awaiting verification",
      value: counts.awaiting,
      hint: "Queue status awaiting verification",
      accent: counts.awaiting ? "amber" : "teal",
    },
    {
      label: "Blocked",
      value: counts.blocked,
      hint: "Queue status blocked",
      accent: counts.blocked ? "red" : "teal",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border border-slate-200 border-t-4 bg-white px-5 py-4 shadow-sm ${ACCENTS[card.accent]}`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{card.value === null ? "—" : card.value}</p>
          <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
