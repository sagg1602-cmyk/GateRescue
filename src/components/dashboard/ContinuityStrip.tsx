export type ContinuityPhase = "normal" | "degraded" | "reconcile" | "restored";

const PHASES: { id: ContinuityPhase; label: string; description: string; current: string; dot: string }[] = [
  {
    id: "normal",
    label: "Normal",
    description: "Portal online, appointments confirmed",
    current: "border-teal-300 bg-teal-50 text-teal-900",
    dot: "bg-teal-500 text-white",
  },
  {
    id: "degraded",
    label: "Degraded",
    description: "Portal outage, appointments unverified",
    current: "border-red-300 bg-red-50 text-red-900",
    dot: "bg-red-600 text-white",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    description: "Access restored, dispatcher reconfirms each one",
    current: "border-amber-300 bg-amber-50 text-amber-900",
    dot: "bg-amber-500 text-slate-950",
  },
  {
    id: "restored",
    label: "Back to normal",
    description: "Every affected appointment reviewed",
    current: "border-teal-300 bg-teal-50 text-teal-900",
    dot: "bg-teal-500 text-white",
  },
];

export function ContinuityStrip({ phase }: { phase: ContinuityPhase }) {
  const currentIndex = PHASES.findIndex((p) => p.id === phase);
  return (
    <nav aria-label="Continuity phase" className="mb-5">
      <ol className="grid grid-cols-4 gap-2">
        {PHASES.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isPast = index < currentIndex;
          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                isCurrent
                  ? `${step.current} shadow-sm`
                  : isPast
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-dashed border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isCurrent ? step.dot : isPast ? "bg-slate-200 text-slate-700" : "bg-white text-slate-400 ring-1 ring-slate-200"
                }`}
                aria-hidden
              >
                {isPast ? "✓" : index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {step.label}
                  {isPast && <span className="sr-only"> (completed)</span>}
                  {isCurrent && <span className="sr-only"> (current)</span>}
                </span>
                <span className={`block text-xs ${isCurrent ? "opacity-80" : ""}`}>{step.description}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
