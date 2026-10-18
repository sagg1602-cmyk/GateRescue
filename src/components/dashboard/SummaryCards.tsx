import type { ReactNode } from "react";

export interface StatCard {
  label: string;
  /** null renders as "—" (not loaded or not computed). */
  value: number | null;
  hint: ReactNode;
  /** Filled teal; reserved for the Ready for approval count. */
  featured?: boolean;
}

/** One row of five deck-style stat cards with large numerals. */
export function StatCardRow({ cards }: { cards: StatCard[] }) {
  return (
    <dl className="grid grid-cols-5 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`flex min-w-0 flex-col rounded-card border px-5 py-5 ${
            card.featured ? "border-ready bg-ready text-white" : "border-line bg-white"
          }`}
        >
          <dt className={`eyebrow ${card.featured ? "text-white" : "text-rust"}`}>{card.label}</dt>
          <dd
            className={`mt-3 font-display text-5xl font-semibold leading-none tabular-nums ${
              card.featured ? "text-white" : "text-rust"
            }`}
          >
            {card.value === null ? "—" : card.value}
          </dd>
          <dd className={`mt-3 text-xs leading-snug ${card.featured ? "text-white/90" : "text-ink-muted"}`}>{card.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SummaryCards({
  readyForApproval,
  planInvalidated,
  totalJobs,
  affectedJobs,
  availableDrivers,
  totalDrivers,
  urgentJobs,
}: {
  /** Unapproved ready recommendations in the current plan; null when no plan exists. */
  readyForApproval: number | null;
  planInvalidated: boolean;
  totalJobs: number;
  affectedJobs: number;
  availableDrivers: number;
  totalDrivers: number;
  urgentJobs: number;
}) {
  const cards: StatCard[] = [
    {
      label: "Ready for approval",
      value: readyForApproval,
      hint:
        readyForApproval === null
          ? "Generate a recovery plan to see ready jobs"
          : planInvalidated
            ? "Plan out of date: regenerate before approving"
            : "All checks pass; awaiting dispatcher approval",
      featured: true,
    },
    {
      label: "Affected jobs",
      value: affectedJobs,
      hint: affectedJobs ? "Appointments unverified or lost in outage" : "No outage impact",
    },
    { label: "Urgent jobs", value: urgentJobs, hint: "Critical or due within 3 h, unapproved" },
    { label: "Available drivers", value: availableDrivers, hint: `of ${totalDrivers} on roster, by latest check-in` },
    { label: "Total jobs", value: totalJobs, hint: "Synthetic import moves today" },
  ];

  return <StatCardRow cards={cards} />;
}
