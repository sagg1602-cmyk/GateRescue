"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface StatCard {
  label: string;
  /** null renders as "—" (not loaded or not computed). */
  value: number | null;
  hint: ReactNode;
  /** Filled teal; reserved for the Ready for approval count. */
  featured?: boolean;
}

const COUNT_UP_MS = 800;

/** Set once the first row of cards has animated, so later mounts show their values immediately. */
let countUpStarted = false;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Counts from 0 to `value` once, on the first page load only. Later value
 * changes render immediately. Plain requestAnimationFrame, no packages.
 */
function useCountUp(value: number | null): number | null {
  const [progress, setProgress] = useState(() => (countUpStarted ? 1 : 0));
  const shouldAnimate = useRef(!countUpStarted);
  const hasValue = value !== null;

  useEffect(() => {
    if (!shouldAnimate.current || !hasValue) return;
    shouldAnimate.current = false;
    countUpStarted = true;
    const reduced = prefersReducedMotion();
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const p = reduced ? 1 : Math.min(1, (now - start) / COUNT_UP_MS);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [hasValue]);

  if (value === null) return null;
  const eased = 1 - Math.pow(1 - progress, 3);
  return Math.round(value * eased);
}

function StatCardItem({ card }: { card: StatCard }) {
  const shown = useCountUp(card.value);
  return (
    <div
      className={`flex min-w-0 flex-col rounded-card border border-t-2 px-6 py-6 shadow-card transition-shadow hover:shadow-card-hover ${
        card.featured
          ? "border-ready border-t-white/70 bg-ready text-white max-sm:col-span-2"
          : "border-line border-t-navy/80 bg-white"
      }`}
    >
      <dt className={`eyebrow ${card.featured ? "text-white/85" : "text-ink-muted"}`}>{card.label}</dt>
      <dd
        className={`mt-4 font-display text-6xl font-semibold leading-[0.9] tracking-[-0.03em] tabular-nums md:text-7xl ${
          card.featured ? "text-white" : "text-rust"
        }`}
      >
        {shown === null ? "—" : shown}
      </dd>
      <dd className={`mt-4 text-xs leading-snug ${card.featured ? "text-white/85" : "text-ink-muted"}`}>{card.hint}</dd>
    </div>
  );
}

/** One row of deck-style stat cards with oversized numerals. Stacks 2 → 3 → 5 across breakpoints. */
export function StatCardRow({ cards }: { cards: StatCard[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => (
        <StatCardItem key={card.label} card={card} />
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
