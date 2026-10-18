import type { Job, RecoveryPlan, Terminal } from "@/lib/demo/frontend-types";
import type { StateResponse } from "@/lib/shared/api-contract";
import { humanizeCode, needsDriverReport, RECOVERY_STATUS_LABEL } from "./snapshot-display";
import { JumpLink } from "./ui";

interface Step {
  title: string;
  detail: string;
  /** Primary jump link to the place on the page where the step is done. */
  action?: { href: string; label: string };
  tone: "ready" | "attention" | "neutral";
}

const TONE_CLASSES: Record<Step["tone"], { box: string; eyebrow: string }> = {
  ready: { box: "border-ready bg-ready text-white", eyebrow: "text-white" },
  attention: { box: "border-line bg-navy text-white", eyebrow: "text-[#f0a27f]" },
  neutral: { box: "border-line bg-white text-navy", eyebrow: "text-rust" },
};

/** Answers "what do I do next?" at the top of the dashboard. Display only: links jump to existing controls. */
export function NextStepBanner({ step }: { step: Step }) {
  const tone = TONE_CLASSES[step.tone];
  const onDark = step.tone !== "neutral";
  return (
    <section
      aria-labelledby="next-step-title"
      className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-card border px-6 py-5 [--focus-ring:#ffffff] ${tone.box}`}
    >
      <div className="min-w-0 flex-1">
        <p className={`eyebrow ${tone.eyebrow}`}>Next step</p>
        <h2 id="next-step-title" className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-tight">
          {step.title}
        </h2>
        <p className={`mt-1 text-sm ${onDark ? "text-white/90" : "text-ink-muted"}`}>{step.detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {step.action && (
          <JumpLink href={step.action.href} onDark={onDark}>
            {step.action.label}
          </JumpLink>
        )}
        {step.action && step.action.href !== "#driver-report" && (
          <JumpLink href="#driver-report" onDark={onDark}>
            Record driver report
          </JumpLink>
        )}
      </div>
    </section>
  );
}

/** Local demo: follows the outage → plan → approve → reconcile flow from the reducer state. */
export function localNextStep({
  outageTerminal,
  plan,
  jobs,
}: {
  outageTerminal: Terminal | undefined;
  plan: RecoveryPlan | null;
  jobs: Job[];
}): Step {
  const name = outageTerminal?.shortName ?? "Terminal A";
  const unverified = jobs.filter(
    (j) => j.terminalId === outageTerminal?.id && j.appointment.status === "unverified",
  ).length;
  const hadOutage = jobs.some((j) => j.appointment.preOutage !== null);

  if (outageTerminal?.portalStatus === "reconciling" && unverified > 0) {
    return {
      title: `Reconfirm ${unverified} ${name} appointment${unverified === 1 ? "" : "s"}`,
      detail: "Access is back, but nothing is confirmed automatically. Reconfirm or mark each one lost.",
      action: { href: "#shipments", label: "Go to shipments" },
      tone: "attention",
    };
  }
  if (!plan && outageTerminal?.portalStatus === "online" && !hadOutage) {
    return {
      title: `Start the demo: simulate a ${name} outage`,
      detail: "Use Demo controls in the sidebar. Everything runs locally on synthetic data.",
      action: { href: "#demo-controls", label: "Go to demo controls" },
      tone: "neutral",
    };
  }
  if (!plan) {
    return {
      title: "Generate a recovery plan",
      detail: "Checks appointments, holds, equipment and driver time for every unapproved job.",
      action: { href: "#recovery-plan", label: "Go to recovery plan" },
      tone: "attention",
    };
  }
  if (plan.status === "invalidated") {
    return {
      title: "Inputs changed: regenerate the recovery plan",
      detail: `${plan.invalidatedReason ?? "An operational input changed"}. Approvals are paused until you regenerate.`,
      action: { href: "#recovery-plan", label: "Go to recovery plan" },
      tone: "attention",
    };
  }
  const ready = plan.recommendations.filter((r) => r.category === "ready" && !r.approved).length;
  if (ready > 0) {
    return {
      title: `${ready} job${ready === 1 ? " is" : "s are"} ready for approval`,
      detail: "All checks pass. Review and approve; approval records intent only and dispatches nothing.",
      action: { href: "#recovery-plan", label: "Review ready jobs" },
      tone: "ready",
    };
  }
  return {
    title: "No job is ready for approval",
    detail: "Resolve blockers or record driver reports as they come in, then regenerate the plan.",
    action: { href: "#recovery-plan", label: "Go to recovery plan" },
    tone: "neutral",
  };
}

/** Connected session: the first ready entry, otherwise the top-ranked entry's next action. */
export function liveNextStep(snapshot: StateResponse | null): Step {
  if (!snapshot) {
    return { title: "Loading the live recovery queue…", detail: "Fetching the backend snapshot.", tone: "neutral" };
  }
  const entries = [...(snapshot.recoveryQueue?.entries ?? [])].sort((a, b) => a.rank - b.rank);
  if (!snapshot.recoveryQueue) {
    return {
      title: "The backend has no recovery queue yet",
      detail: "The simulated clock or scenario configuration is missing on the backend.",
      tone: "neutral",
    };
  }
  if (entries.length === 0) {
    return {
      title: "No jobs need recovery",
      detail: "Record driver reports as they come in; the queue refreshes every 5 seconds.",
      action: { href: "#driver-report", label: "Record driver report" },
      tone: "neutral",
    };
  }
  const ready = entries.filter((e) => e.status === "ready_for_approval");
  if (ready.length > 0) {
    const top = ready[0];
    const driver = top.proposal?.driverId ?? top.proposedDriverId;
    return {
      title: `${top.jobId} is ready for approval${ready.length > 1 ? ` (+${ready.length - 1} more)` : ""}`,
      detail: `${driver ? `Proposed driver ${driver}. ` : ""}Next action: ${humanizeCode(top.nextAction)}. A dispatcher approves every assignment.`,
      action: { href: `#queue-${top.jobId}`, label: `Review ${top.jobId}` },
      tone: "ready",
    };
  }
  const top = entries[0];
  const waitingOnDriver = needsDriverReport(top.nextAction);
  return {
    title: `${top.jobId}: ${humanizeCode(top.nextAction)}`,
    detail: `${RECOVERY_STATUS_LABEL[top.status]}${top.blocker ? ` · ${humanizeCode(top.blocker)}` : ""} · resolved by ${humanizeCode(top.owner).toLowerCase()}.`,
    action: waitingOnDriver
      ? { href: "#driver-report", label: "Record driver report" }
      : { href: `#queue-${top.jobId}`, label: `Review ${top.jobId}` },
    tone: "attention",
  };
}
