import type { ReactNode } from "react";

interface SummaryCard {
  label: string;
  value: number;
  hint: ReactNode;
  accent: "teal" | "amber" | "red" | "slate";
}

const ACCENTS: Record<SummaryCard["accent"], string> = {
  teal: "border-t-teal-500",
  amber: "border-t-amber-500",
  red: "border-t-red-500",
  slate: "border-t-slate-400",
};

export function SummaryCards({
  totalJobs,
  affectedJobs,
  availableDrivers,
  totalDrivers,
  urgentJobs,
}: {
  totalJobs: number;
  affectedJobs: number;
  availableDrivers: number;
  totalDrivers: number;
  urgentJobs: number;
}) {
  const cards: SummaryCard[] = [
    { label: "Total jobs", value: totalJobs, hint: "Synthetic import moves today", accent: "slate" },
    {
      label: "Affected jobs",
      value: affectedJobs,
      hint: affectedJobs ? "Appointments unverified or lost in outage" : "No outage impact",
      accent: affectedJobs ? "amber" : "teal",
    },
    {
      label: "Available drivers",
      value: availableDrivers,
      hint: `of ${totalDrivers} on roster, by latest check-in`,
      accent: "teal",
    },
    { label: "Urgent jobs", value: urgentJobs, hint: "Critical or due within 3 h, unapproved", accent: urgentJobs ? "red" : "teal" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-xl border border-slate-200 border-t-4 bg-white px-5 py-4 shadow-sm ${ACCENTS[card.accent]}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{card.label}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{card.value}</p>
          <p className="mt-1 text-xs text-slate-500">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}
