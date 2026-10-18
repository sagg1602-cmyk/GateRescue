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

function StatCardItem({ card, index }: { card: StatCard; index: number }) {
  const shown = useCountUp(card.value);
  return (
    <div
      className={`relative flex min-w-0 flex-col px-4 py-6 md:px-6 md:py-8 ${
        card.featured ? "bg-ready-soft shadow-[inset_4px_0_0_0_var(--color-ready)]" : "bg-white"
      }`}
    >
      <span className="absolute right-3 top-2 font-mono text-[10px] tracking-[0.14em] text-ink-muted" aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <dd
        className={`order-1 font-display text-6xl font-semibold leading-[0.9] tracking-[-0.03em] tabular-nums md:text-7xl ${
          card.featured ? "text-ready" : "text-navy"
        }`}
      >
        {shown === null ? "—" : shown}
      </dd>
      <dt className="order-2 mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-navy">{card.label}</dt>
      <dd className="order-3 mt-1.5 text-xs leading-snug text-ink-muted">{card.hint}</dd>
    </div>
  );
}

/** Blueprint stat row: hairline-divided cells, numeral first, mono label beneath. 2 → 4 across. */
export function StatCardRow({ cards }: { cards: StatCard[] }) {
  return (
    <dl className="grid grid-cols-2 border-x border-b border-line [&>*]:border-b [&>*]:border-line md:grid-cols-4 [&>*:nth-child(2n)]:border-l md:[&>*:nth-child(n+5)]:border-b-0 md:[&>*:not(:nth-child(4n+1))]:border-l max-md:[&>*:nth-last-child(-n+2)]:border-b-0">
      {cards.map((card, i) => (
        <StatCardItem key={card.label} card={card} index={i} />
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
      hint: affectedJobs
        ? `of ${totalJobs} synthetic moves; appointments unverified or lost`
        : `of ${totalJobs} synthetic moves; no outage impact`,
    },
    { label: "Urgent jobs", value: urgentJobs, hint: "Critical or due within 3 h, unapproved" },
    { label: "Available drivers", value: availableDrivers, hint: `of ${totalDrivers} on roster, by latest check-in` },
  ];

  return <StatCardRow cards={cards} />;
}
