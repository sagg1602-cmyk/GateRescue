import type {
  Customer,
  Driver,
  Job,
  Recommendation,
  RecommendationCategory,
  RecoveryCheck,
  RecoveryPlan,
} from "@/lib/demo/frontend-types";
import { formatTime, formatWindow } from "@/lib/demo/time";
import { Badge, Button, Panel } from "./ui";

const GROUPS: { category: RecommendationCategory; title: string; description: string; header: string; dot: string }[] = [
  {
    category: "ready",
    title: "Ready",
    description: "All checks pass. Approve to record dispatcher intent.",
    header: "text-teal-800",
    dot: "bg-teal-500",
  },
  {
    category: "awaiting-verification",
    title: "Awaiting verification",
    description: "Driver tentatively held; appointment must be reconfirmed first.",
    header: "text-amber-800",
    dot: "bg-amber-500",
  },
  {
    category: "blocked",
    title: "Blocked",
    description: "At least one check failed. Resolve the blocker, then regenerate.",
    header: "text-red-700",
    dot: "bg-red-500",
  },
];

const CHECK_ICON: Record<RecoveryCheck["result"], { symbol: string; className: string }> = {
  pass: { symbol: "✓", className: "text-teal-600" },
  fail: { symbol: "✕", className: "text-red-600" },
  skip: { symbol: "–", className: "text-slate-400" },
};

export function RecoveryPanel({
  plan,
  jobs,
  drivers,
  customers,
  inputsVersion,
  onGenerate,
  onApprove,
}: {
  plan: RecoveryPlan | null;
  jobs: Job[];
  drivers: Driver[];
  customers: Customer[];
  inputsVersion: number;
  onGenerate: () => void;
  onApprove: (jobId: string) => void;
}) {
  const invalidated = plan?.status === "invalidated";
  const upToDate = plan?.status === "current" && plan.inputsVersion === inputsVersion;

  return (
    <Panel
      title="Recovery plan"
      subtitle="Simulated locally with a simple deterministic heuristic. Not an optimizer; approvals do not notify drivers or move cargo."
      actions={
        <Button variant="primary" onClick={onGenerate}>
          {plan ? "Regenerate plan" : "Generate recovery plan"}
        </Button>
      }
    >
      {!plan && (
        <div className="px-5 py-10 text-center text-sm text-slate-500">
          No recommendations yet. Generate a plan to check appointments, container availability, holds, equipment and
          driver time conflicts for every unapproved job.
        </div>
      )}

      {plan && (
        <div className="px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>
              Plan #{plan.id} · generated {formatTime(plan.generatedAt)} (sim) · inputs v{plan.inputsVersion}
            </span>
            {upToDate && <Badge tone="teal">Current</Badge>}
          </div>

          {invalidated && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">Recommendations invalidated</p>
              <p className="mt-0.5 text-xs">
                Operational inputs changed ({plan.invalidatedReason}). Approvals are disabled until you regenerate the
                plan. Approvals already recorded are kept.
              </p>
            </div>
          )}

          <div className={`grid grid-cols-3 gap-4 ${invalidated ? "opacity-60" : ""}`}>
            {GROUPS.map((group) => {
              const recs = plan.recommendations.filter((r) => r.category === group.category);
              return (
                <div key={group.category} className="min-w-0">
                  <div className="mb-2">
                    <p className={`flex items-center gap-1.5 text-sm font-semibold ${group.header}`}>
                      <span className={`h-2 w-2 rounded-full ${group.dot}`} aria-hidden />
                      {group.title}
                      <span className="font-normal text-slate-500">({recs.length})</span>
                    </p>
                    <p className="text-xs text-slate-500">{group.description}</p>
                  </div>
                  <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                    {recs.length === 0 && <p className="text-xs italic text-slate-400">None</p>}
                    {recs.map((rec) => (
                      <RecommendationCard
                        key={rec.jobId}
                        rec={rec}
                        job={jobs.find((j) => j.id === rec.jobId)}
                        driver={drivers.find((d) => d.id === rec.driverId)}
                        customers={customers}
                        canApprove={!invalidated}
                        onApprove={onApprove}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}

function RecommendationCard({
  rec,
  job,
  driver,
  customers,
  canApprove,
  onApprove,
}: {
  rec: Recommendation;
  job: Job | undefined;
  driver: Driver | undefined;
  customers: Customer[];
  canApprove: boolean;
  onApprove: (jobId: string) => void;
}) {
  if (!job) return null;
  const border =
    rec.category === "ready" ? "border-teal-200" : rec.category === "blocked" ? "border-red-200" : "border-amber-300";
  return (
    <article className={`rounded-lg border bg-white p-3 ${border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-900">{job.container}</p>
          <p className="truncate text-xs text-slate-500">
            {customers.find((c) => c.id === job.customerId)?.name} · {formatWindow(job.appointment.window)}
          </p>
        </div>
        <Badge tone={job.priority === "critical" ? "red" : job.priority === "high" ? "amber" : "neutral"}>
          {job.priority}
        </Badge>
      </div>
      {driver && (
        <p className="mt-2 text-xs text-slate-800">
          <span className="text-slate-500">{rec.category === "ready" ? "Proposed:" : "Tentative:"}</span>{" "}
          <span className="font-medium">{driver.name}</span>
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{rec.explanation}</p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">Checks</summary>
        <ul className="mt-1.5 space-y-1">
          {rec.checks.map((check) => (
            <li key={check.label} className="flex gap-1.5">
              <span className={`w-3 shrink-0 font-semibold ${CHECK_ICON[check.result].className}`}>
                {CHECK_ICON[check.result].symbol}
              </span>
              <span>
                <span className="font-medium text-slate-700">{check.label}:</span>{" "}
                <span className="text-slate-500">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
      {rec.category === "ready" &&
        (rec.approved ? (
          <p className="mt-2 rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">
            ✓ Dispatcher approved {job.approval ? `at ${formatTime(job.approval.approvedAt)}` : ""} (simulated) — not
            dispatched, not delivered
          </p>
        ) : (
          <Button
            size="sm"
            variant="primary"
            className="mt-2 w-full"
            disabled={!canApprove}
            onClick={() => onApprove(rec.jobId)}
          >
            Approve assignment (simulated)
          </Button>
        ))}
    </article>
  );
}
