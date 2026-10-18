"use client";

import { useState } from "react";
import type { Customer, Job, RecoveryPlan, Terminal } from "@/lib/demo/frontend-types";
import type { StateResponse } from "@/lib/shared/api-contract";
import { humanizeCode, needsDriverReport, RECOVERY_STATUS_LABEL } from "./snapshot-display";

export interface Step {
  title: string;
  detail: string;
  /** Job id and customer, set in mono under the headline. */
  subject?: { id: string; label?: string };
  /** The one dominant button; jumps to the place on the page where the step is done. */
  action?: { href: string; label: string };
  tone: "ready" | "attention" | "neutral";
}

const TONE_CLASSES: Record<
  Step["tone"],
  { box: string; eyebrow: string; rule: string; detail: string; mono: string; button: string; link: string }
> = {
  ready: {
    box: "border-ready bg-ready text-white",
    eyebrow: "text-white/80",
    rule: "bg-rust-light",
    detail: "text-white/85",
    mono: "text-white",
    button: "bg-white text-ready hover:bg-ready-soft",
    link: "text-white/85 hover:text-white",
  },
  attention: {
    box: "border-navy bg-navy text-white",
    eyebrow: "text-rust-light",
    rule: "bg-rust",
    detail: "text-slate-300",
    mono: "text-rust-light",
    button: "bg-white text-navy hover:bg-paper",
    link: "text-slate-300 hover:text-white",
  },
  neutral: {
    box: "border-line bg-white text-navy",
    eyebrow: "text-rust",
    rule: "bg-rust",
    detail: "text-ink-muted",
    mono: "text-rust",
    button: "bg-navy text-white hover:bg-navy-soft",
    link: "text-ink-muted hover:text-navy",
  },
};

/**
 * Answers "what do I do next?" at the top of the dashboard. Display only: the
 * button jumps to existing controls. When the step changes the content slides
 * in and the card glows once; both respect prefers-reduced-motion via globals.css.
 */
export function NextStepBanner({ step }: { step: Step }) {
  const tone = TONE_CLASSES[step.tone];
  const onDark = step.tone !== "neutral";

  // Adjust-state-during-render: remember the first title so the glow only runs on a change, not on load.
  const [seenTitle, setSeenTitle] = useState(step.title);
  const [changed, setChanged] = useState(false);
  if (seenTitle !== step.title) {
    setSeenTitle(step.title);
    setChanged(true);
  }

  return (
    <section
      key={step.title}
      aria-labelledby="next-step-title"
      className={`relative mb-8 overflow-hidden rounded-card border px-6 py-8 shadow-card md:px-10 md:py-10 ${tone.box} ${
        changed ? "hero-glow" : ""
      } ${onDark ? "[--focus-ring:#ffffff]" : ""}`}
    >
      <div className="hero-in flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className={`eyebrow ${tone.eyebrow}`}>Next step</p>
          <span className={`mt-3 block h-px w-14 ${tone.rule}`} aria-hidden />
          <h2
            id="next-step-title"
            className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[0.95] tracking-tight text-balance md:text-6xl"
          >
            {step.title}
          </h2>
          {step.subject && (
            <p className={`mt-4 font-mono text-sm tracking-tight md:text-base ${tone.mono}`}>
              <span className="font-semibold">{step.subject.id}</span>
              {step.subject.label && <span className="opacity-80"> · {step.subject.label}</span>}
            </p>
          )}
          <p className={`mt-3 max-w-2xl text-sm leading-relaxed md:text-base ${tone.detail}`}>{step.detail}</p>
        </div>

        {step.action && (
          <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
            <a
              href={step.action.href}
              className={`inline-flex min-h-12 items-center justify-center rounded-full px-7 text-sm font-semibold shadow-card transition-colors ${tone.button}`}
            >
              {step.action.label}
            </a>
            {step.action.href !== "#driver-report" && (
              <a
                href="#driver-report"
                className={`inline-flex min-h-11 items-center text-xs font-medium underline underline-offset-4 ${tone.link}`}
              >
                Record a driver report instead
              </a>
            )}
          </div>
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
  customers,
}: {
  outageTerminal: Terminal | undefined;
  plan: RecoveryPlan | null;
  jobs: Job[];
  customers: Customer[];
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
  const readyRecs = plan.recommendations.filter((r) => r.category === "ready" && !r.approved);
  if (readyRecs.length > 0) {
    const first = jobs.find((j) => j.id === readyRecs[0].jobId);
    const customer = first && customers.find((c) => c.id === first.customerId);
    return {
      title: `${readyRecs.length} job${readyRecs.length === 1 ? " is" : "s are"} ready for approval`,
      detail: "All checks pass. Review and approve; approval records intent only and dispatches nothing.",
      subject: first ? { id: first.container, label: customer?.name } : undefined,
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
  const customerFor = (jobId: string) => {
    const job = snapshot.jobs.find((j) => j.id === jobId);
    return job ? snapshot.customers.find((c) => c.id === job.customerId)?.name : undefined;
  };
  const ready = entries.filter((e) => e.status === "ready_for_approval");
  if (ready.length > 0) {
    const top = ready[0];
    const driver = top.proposal?.driverId ?? top.proposedDriverId;
    return {
      title: `${top.jobId} is ready for approval${ready.length > 1 ? ` (+${ready.length - 1} more)` : ""}`,
      detail: `${driver ? `Proposed driver ${driver}. ` : ""}Next action: ${humanizeCode(top.nextAction)}. A dispatcher approves every assignment.`,
      subject: { id: top.jobId, label: customerFor(top.jobId) },
      action: { href: `#queue-${top.jobId}`, label: `Review ${top.jobId}` },
      tone: "ready",
    };
  }
  const top = entries[0];
  const waitingOnDriver = needsDriverReport(top.nextAction);
  return {
    title: humanizeCode(top.nextAction),
    detail: `${RECOVERY_STATUS_LABEL[top.status]}${top.blocker ? ` · ${humanizeCode(top.blocker)}` : ""} · resolved by ${humanizeCode(top.owner).toLowerCase()}.`,
    subject: { id: top.jobId, label: customerFor(top.jobId) },
    action: waitingOnDriver
      ? { href: "#driver-report", label: "Record driver report" }
      : { href: `#queue-${top.jobId}`, label: `Review ${top.jobId}` },
    tone: "attention",
  };
}
