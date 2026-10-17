/**
 * Local demo state + reducer. All interactions are simulated in the browser;
 * no API, database or telephony calls happen here. Each action that changes an
 * operational input (terminal access, appointments, driver status) invalidates
 * any pending recovery recommendations.
 */

import type {
  ActivityEvent,
  ActivityKind,
  ActivitySeverity,
  Driver,
  DriverAvailability,
  Job,
  RecoveryPlan,
  Terminal,
  TerminalId,
} from "./frontend-types";
import { DRIVER_BLOCK_MINUTES, generateRecoveryPlan } from "./recovery-heuristic";
import { createSyntheticDataset, DEMO_START_TIME } from "./synthetic-data";
import { addMinutes, formatTime, withTime } from "./time";

export const OUTAGE_TERMINAL_ID: TerminalId = "term-a";

export interface DemoState {
  /** Simulated clock; advances one minute per recorded action. */
  now: string;
  terminals: Terminal[];
  jobs: Job[];
  drivers: Driver[];
  events: ActivityEvent[];
  inputsVersion: number;
  plan: RecoveryPlan | null;
  nextEventId: number;
  nextPlanId: number;
}

export type DemoAction =
  | { type: "simulate-outage" }
  | { type: "restore-access" }
  | { type: "reconfirm-appointment"; jobId: string }
  | { type: "mark-appointment-lost"; jobId: string }
  | {
      type: "driver-check-in";
      driverId: string;
      availability: DriverAvailability;
      availableFrom: string; // "HH:MM"
      note: string;
    }
  | { type: "generate-plan" }
  | { type: "approve-assignment"; jobId: string }
  | { type: "reset" };

export function createInitialDemoState(): DemoState {
  const data = createSyntheticDataset();
  return {
    now: DEMO_START_TIME,
    ...data,
    inputsVersion: 1,
    plan: null,
    nextEventId: data.events.length + 1,
    nextPlanId: 1,
  };
}

function log(state: DemoState, kind: ActivityKind, severity: ActivitySeverity, message: string): DemoState {
  return {
    ...state,
    events: [{ id: state.nextEventId, at: state.now, kind, severity, message }, ...state.events],
    nextEventId: state.nextEventId + 1,
  };
}

function tick(state: DemoState): DemoState {
  return { ...state, now: addMinutes(state.now, 1) };
}

/** Bump the input version and mark a pending plan as invalidated. */
function invalidate(state: DemoState, reason: string): DemoState {
  const next = { ...state, inputsVersion: state.inputsVersion + 1 };
  if (!state.plan || state.plan.status !== "current") return next;
  const pending = state.plan.recommendations.filter((r) => !r.approved && r.category !== "blocked").length;
  return log(
    { ...next, plan: { ...state.plan, status: "invalidated", invalidatedReason: reason } },
    "plan",
    "warning",
    `Pending recommendations invalidated (${pending} unapproved): ${reason}. Regenerate the plan.`,
  );
}

function updateTerminal(state: DemoState, id: TerminalId, patch: Partial<Terminal>): DemoState {
  return { ...state, terminals: state.terminals.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

function updateJob(state: DemoState, jobId: string, update: (job: Job) => Job): DemoState {
  return { ...state, jobs: state.jobs.map((j) => (j.id === jobId ? update(j) : j)) };
}

/** Return the terminal to online once every outage-affected appointment is resolved. */
function maybeCompleteReconciliation(state: DemoState, terminalId: TerminalId): DemoState {
  const terminal = state.terminals.find((t) => t.id === terminalId);
  if (terminal?.portalStatus !== "reconciling") return state;
  const remaining = state.jobs.some((j) => j.terminalId === terminalId && j.appointment.status === "unverified");
  if (remaining) return state;
  return log(
    updateTerminal(state, terminalId, { portalStatus: "online" }),
    "terminal",
    "success",
    `${terminal.shortName} reconciliation complete — every affected appointment was reviewed by the dispatcher.`,
  );
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "simulate-outage": {
      const terminal = state.terminals.find((t) => t.id === OUTAGE_TERMINAL_ID);
      if (!terminal || terminal.portalStatus !== "online") return state;
      let affected = 0;
      let next = tick(state);
      next = updateTerminal(next, terminal.id, { portalStatus: "outage" });
      next = {
        ...next,
        jobs: next.jobs.map((job) => {
          if (job.terminalId !== terminal.id || job.appointment.status !== "confirmed") return job;
          affected += 1;
          const { status, window } = job.appointment;
          return { ...job, appointment: { status: "unverified", window, preOutage: { status, window } } };
        }),
      };
      next = log(
        next,
        "terminal",
        "critical",
        `${terminal.shortName} appointment portal unreachable (simulated). ${affected} confirmed appointments marked unverified; previous values preserved.`,
      );
      return invalidate(next, `${terminal.shortName} outage`);
    }

    case "restore-access": {
      const terminal = state.terminals.find((t) => t.id === OUTAGE_TERMINAL_ID);
      if (!terminal || terminal.portalStatus !== "outage") return state;
      const unverified = state.jobs.filter(
        (j) => j.terminalId === terminal.id && j.appointment.status === "unverified",
      ).length;
      let next = updateTerminal(tick(state), terminal.id, { portalStatus: "reconciling" });
      next = log(
        next,
        "terminal",
        "warning",
        `${terminal.shortName} access restored — reconciliation mode. ${unverified} appointments stay unverified until the dispatcher reconfirms each one.`,
      );
      next = invalidate(next, `${terminal.shortName} access restored`);
      return maybeCompleteReconciliation(next, terminal.id);
    }

    case "reconfirm-appointment":
    case "mark-appointment-lost": {
      const job = state.jobs.find((j) => j.id === action.jobId);
      const terminal = state.terminals.find((t) => t.id === job?.terminalId);
      if (!job || !terminal || job.appointment.status !== "unverified" || terminal.portalStatus !== "reconciling") {
        return state;
      }
      const confirm = action.type === "reconfirm-appointment";
      let next = updateJob(tick(state), job.id, (j) => ({
        ...j,
        appointment: confirm
          ? { ...j.appointment, status: "confirmed" }
          : { ...j.appointment, status: "lost", window: null },
      }));
      next = log(
        next,
        "dispatcher",
        confirm ? "success" : "warning",
        confirm
          ? `Dispatcher reconfirmed ${job.container} at ${terminal.shortName} for ${formatTime(job.appointment.window?.start ?? state.now)}.`
          : `Dispatcher marked ${job.container} appointment as lost — rebooking required.`,
      );
      next = invalidate(next, `${job.container} appointment ${confirm ? "reconfirmed" : "marked lost"}`);
      return maybeCompleteReconciliation(next, terminal.id);
    }

    case "driver-check-in": {
      const driver = state.drivers.find((d) => d.id === action.driverId);
      if (!driver) return state;
      let next = tick(state);
      const availableFrom = withTime(next.now, action.availableFrom);
      next = {
        ...next,
        drivers: next.drivers.map((d) =>
          d.id === driver.id
            ? {
                ...d,
                availability: action.availability,
                availableFrom,
                lastReport: next.now,
                lastNote: action.note.trim() || d.lastNote,
              }
            : d,
        ),
      };
      const note = action.note.trim() ? ` “${action.note.trim()}”` : "";
      next = log(
        next,
        "driver",
        action.availability === "available" ? "success" : "info",
        `${driver.name} checked in: ${action.availability.replace("-", " ")}, free from ${action.availableFrom}.${note}`,
      );
      return invalidate(next, `${driver.name} check-in`);
    }

    case "generate-plan": {
      const next = tick(state);
      const recommendations = generateRecoveryPlan(next.jobs, next.drivers, next.terminals, next.now);
      const count = (c: string) => recommendations.filter((r) => r.category === c).length;
      const plan: RecoveryPlan = {
        id: next.nextPlanId,
        generatedAt: next.now,
        inputsVersion: next.inputsVersion,
        status: "current",
        invalidatedReason: null,
        recommendations,
      };
      return log(
        { ...next, plan, nextPlanId: next.nextPlanId + 1 },
        "plan",
        "info",
        `Recovery plan #${plan.id} generated locally: ${count("ready")} ready, ${count("awaiting-verification")} awaiting verification, ${count("blocked")} blocked.`,
      );
    }

    case "approve-assignment": {
      const plan = state.plan;
      const rec = plan?.recommendations.find((r) => r.jobId === action.jobId);
      const job = state.jobs.find((j) => j.id === action.jobId);
      const driver = state.drivers.find((d) => d.id === rec?.driverId);
      if (!plan || plan.status !== "current" || !rec || rec.approved || rec.category !== "ready" || !job || !driver || !job.appointment.window) {
        return state;
      }
      const start = job.appointment.window.start;
      let next = tick(state);
      const approvedAt = next.now;
      next = updateJob(next, job.id, (j) => ({
        ...j,
        approval: { driverId: driver.id, approvedAt, simulated: true },
      }));
      next = {
        ...next,
        drivers: next.drivers.map((d) =>
          d.id === driver.id
            ? { ...d, busy: [...d.busy, { start, end: addMinutes(start, DRIVER_BLOCK_MINUTES), label: job.container, jobId: job.id }] }
            : d,
        ),
        // Approval matches the plan's own reservation, so the plan stays current.
        plan: {
          ...plan,
          recommendations: plan.recommendations.map((r) => (r.jobId === job.id ? { ...r, approved: true } : r)),
        },
      };
      return log(
        next,
        "dispatcher",
        "success",
        `Dispatcher approved ${job.container} → ${driver.name} (simulated locally). Driver not notified; cargo not delivered.`,
      );
    }

    case "reset":
      return createInitialDemoState();
  }
}
