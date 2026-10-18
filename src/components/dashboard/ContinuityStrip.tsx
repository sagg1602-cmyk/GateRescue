export type ContinuityPhase = "normal" | "degraded" | "reconcile" | "restored";

const PHASES: { id: ContinuityPhase; label: string; description: string; current: string; dot: string }[] = [
  {
    id: "normal",
    label: "Normal",
    description: "Portal online, appointments confirmed",
    current: "border-ready/40 bg-ready-soft text-ready",
    dot: "bg-ready text-white",
  },
  {
    id: "degraded",
    label: "Degraded",
    description: "Portal outage, appointments unverified",
    current: "border-blocked/30 bg-blocked-soft text-blocked",
    dot: "bg-blocked text-white",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    description: "Access restored, dispatcher reconfirms each one",
    current: "border-awaiting/30 bg-awaiting-soft text-awaiting",
    dot: "bg-amber-500 text-navy",
  },
  {
    id: "restored",
    label: "Back to normal",
    description: "Every affected appointment reviewed",
    current: "border-ready/40 bg-ready-soft text-ready",
    dot: "bg-ready text-white",
  },
];

export function ContinuityStrip({ phase }: { phase: ContinuityPhase }) {
  const currentIndex = PHASES.findIndex((p) => p.id === phase);
  return (
    <nav aria-label="Continuity phase" className="mb-6">
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {PHASES.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-start gap-2.5 rounded-card border px-3 py-2.5 ${
                isCurrent
                  ? `${step.current} border-2`
                  : isPast
                    ? "border-line bg-white text-slate-700"
                    : "border-dashed border-line bg-paper text-ink-muted"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isCurrent ? step.dot : isPast ? "bg-paper-deep text-slate-700" : "bg-white text-ink-muted ring-1 ring-line"
                }`}
                aria-hidden
              >
                {isPast ? "✓" : index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                  {step.label}
                  {isPast && <span className="sr-only"> (completed)</span>}
                  {isCurrent && <span className="eyebrow">Now</span>}
                </span>
                <span className="block text-xs">{step.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
