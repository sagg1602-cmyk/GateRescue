import type {
  Customer,
  Driver,
  Job,
  Recommendation,
  RecommendationCategory,
  RecoveryCheck,
  RecoveryPlan,
} from "@/lib/demo/frontend-types";
import { getJobExtras } from "@/lib/demo/job-extras";
import { formatTime, formatWindow } from "@/lib/demo/time";
import { HarmSoonBadge, TierBadge } from "./JobBadges";
import { Badge, Button, Panel } from "./ui";

const GROUPS: { category: RecommendationCategory; title: string; description: string; header: string; dot: string }[] = [
  {
    category: "ready",
    title: "Ready for approval",
    description: "All checks pass. Approve to record dispatcher intent.",
    header: "text-ready",
    dot: "bg-ready",
  },
  {
    category: "awaiting-verification",
    title: "Awaiting verification",
    description: "Driver tentatively held; appointment must be reconfirmed first.",
    header: "text-awaiting",
    dot: "bg-amber-500",
  },
  {
    category: "blocked",
    title: "Blocked",
    description: "At least one check failed. Resolve the blocker, then regenerate.",
    header: "text-blocked",
    dot: "bg-blocked",
  },
];

const CHECK_ICON: Record<RecoveryCheck["result"], { symbol: string; className: string }> = {
  pass: { symbol: "✓", className: "text-ready" },
  fail: { symbol: "✕", className: "text-blocked" },
  skip: { symbol: "–", className: "text-ink-muted" },
};

const CHECK_RESULT_LABEL: Record<RecoveryCheck["result"], string> = { pass: "Pass", fail: "Fail", skip: "Skipped" };

export function RecoveryPanel({
  plan,
  jobs,
  drivers,
  customers,
  inputsVersion,
  now,
  onGenerate,
  onApprove,
}: {
  plan: RecoveryPlan | null;
  jobs: Job[];
  drivers: Driver[];
  customers: Customer[];
  inputsVersion: number;
  now: string;
  onGenerate: () => void;
  onApprove: (jobId: string) => void;
}) {
  const invalidated = plan?.status === "invalidated";
  const upToDate = plan?.status === "current" && plan.inputsVersion === inputsVersion;

  return (
    <Panel
      id="recovery-plan"
      eyebrow="Local simulation"
      title="Recovery plan"
      subtitle="Simulated locally with a simple deterministic heuristic. Not an optimizer; approvals do not notify drivers or move cargo."
      actions={
        <Button variant={plan?.status === "current" ? "secondary" : "primary"} onClick={onGenerate}>
          {plan ? "Regenerate plan" : "Generate recovery plan"}
        </Button>
      }
    >
      {!plan && (
        <div className="px-6 py-12 text-center text-sm text-ink-muted">
          No recommendations yet. Generate a plan to check appointments, container availability, holds, equipment and
          driver time conflicts for every unapproved job.
        </div>
      )}

      {plan && (
        <div className="px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <span>
              Plan <span className="font-mono">#{plan.id}</span> · generated{" "}
              <span className="font-mono">{formatTime(plan.generatedAt)}</span> (sim) · inputs v{plan.inputsVersion}
            </span>
            {upToDate && <Badge tone="teal">Current</Badge>}
          </div>

          {invalidated && (
            <div className="mb-4 rounded-lg border border-awaiting/30 bg-awaiting-soft px-4 py-3 text-sm text-awaiting">
              <p className="font-semibold">Recommendations invalidated</p>
              <p className="mt-0.5 text-xs">
                Operational inputs changed ({plan.invalidatedReason}). Approvals are disabled until you regenerate the
                plan. Approvals already recorded are kept.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {GROUPS.map((group) => {
              const recs = plan.recommendations.filter((r) => r.category === group.category);
              const ready = group.category === "ready";
              return (
                <div
                  key={group.category}
                  className={`min-w-0 rounded-card p-3 ${ready ? "bg-ready-soft ring-1 ring-inset ring-ready/40" : "bg-paper"}`}
                >
                  <div className="mb-3">
                    <p className={`flex items-center gap-1.5 text-sm font-semibold ${group.header}`}>
                      <span className={`h-2 w-2 rounded-full ${group.dot}`} aria-hidden />
                      {group.title}
                      <span className="font-normal text-ink-muted">({recs.length})</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{group.description}</p>
                  </div>
                  <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                    {recs.length === 0 && <p className="text-xs italic text-ink-muted">None</p>}
                    {recs.map((rec) => (
                      <RecommendationCard
                        key={rec.jobId}
                        rec={rec}
                        job={jobs.find((j) => j.id === rec.jobId)}
                        driver={drivers.find((d) => d.id === rec.driverId)}
                        customers={customers}
                        now={now}
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
  now,
  canApprove,
  onApprove,
}: {
  rec: Recommendation;
  job: Job | undefined;
  driver: Driver | undefined;
  customers: Customer[];
  now: string;
  canApprove: boolean;
  onApprove: (jobId: string) => void;
}) {
  if (!job) return null;
  const ready = rec.category === "ready";
  const border = ready ? "border-2 border-ready" : rec.category === "blocked" ? "border-blocked/30" : "border-awaiting/30";
  return (
    <article className={`rounded-lg border bg-white p-3 ${border}`}>
      {ready && !rec.approved && (
        <p className="mb-2">
          <Badge tone="teal" solid>
            <span aria-hidden>✓</span> Ready for approval
          </Badge>
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-navy">{job.container}</p>
          <p className="truncate text-xs text-ink-muted">
            {customers.find((c) => c.id === job.customerId)?.name} · {formatWindow(job.appointment.window)}
          </p>
        </div>
        <Badge tone={job.priority === "critical" ? "red" : job.priority === "high" ? "amber" : "neutral"}>
          {job.priority}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <TierBadge tier={getJobExtras(job).tier} />
        <HarmSoonBadge job={job} now={now} />
      </div>
      {driver && (
        <p className="mt-2 text-xs text-slate-800">
          <span className="text-ink-muted">{rec.category === "ready" ? "Proposed:" : "Tentative:"}</span>{" "}
          <span className="font-medium">{driver.name}</span>
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{rec.explanation}</p>
      <details className="mt-2 text-xs">
        <summary className="inline-flex min-h-11 cursor-pointer select-none items-center text-ink-muted hover:text-navy">
          Checks
        </summary>
        <ul className="space-y-1">
          {rec.checks.map((check) => (
            <li key={check.label} className="flex gap-1.5">
              <span className={`w-3 shrink-0 font-semibold ${CHECK_ICON[check.result].className}`} aria-hidden>
                {CHECK_ICON[check.result].symbol}
              </span>
              <span className="sr-only">{CHECK_RESULT_LABEL[check.result]}:</span>
              <span>
                <span className="font-medium text-slate-700">{check.label}:</span>{" "}
                <span className="text-ink-muted">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>
      {rec.category === "ready" &&
        (rec.approved ? (
          <p className="mt-2 rounded bg-ready-soft px-2 py-1.5 text-xs font-semibold text-ready">
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
