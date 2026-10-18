import type { StateResponse } from "@/lib/shared/api-contract";
import type { Terminal, TerminalPortalStatus } from "@/lib/shared/operational-types";
import { formatTime } from "@/lib/demo/time";
import { formatSnapshotDate } from "./snapshot-display";
import { SyntheticBadge } from "./ui";

const PORTAL_LABEL: Record<TerminalPortalStatus, { text: string; dot: string; textClass: string }> = {
  online: { text: "Portal online", dot: "bg-teal-400", textClass: "text-teal-300" },
  outage: { text: "Portal outage", dot: "bg-red-500 animate-pulse", textClass: "text-red-300" },
  reconciling: { text: "Reconciling", dot: "bg-amber-400", textClass: "text-amber-300" },
};

/** Sidebar chrome for a connected session: clock, scenario and terminals from the snapshot. */
export function LiveSidebar({ snapshot }: { snapshot: StateResponse | null }) {
  const now = snapshot?.now ?? null;
  return (
    <aside className="flex w-72 shrink-0 flex-col bg-[#0b1a33] text-slate-200">
      <div className="border-b border-white/10 px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500 text-[#0b1a33]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path d="M4 20V9l8-5 8 5v11" />
              <path d="M8 20v-6h8v6" />
              <path d="M8 17h8" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight text-white">GateRescue</p>
            <p className="text-xs text-slate-400">Drayage disruption desk</p>
          </div>
        </div>
        <div className="mt-4">
          <SyntheticBadge onDark />
        </div>
      </div>

      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Simulated clock</p>
        <p className="mt-1 font-mono text-2xl text-white">{now ? formatTime(now) : "—"}</p>
        <p className="text-xs text-slate-500">{now ? formatSnapshotDate(now) : "Clock not set"}</p>
        {snapshot?.scenario && (
          <p className="mt-3 text-xs text-slate-300">
            <span className="font-medium uppercase tracking-wider text-slate-400">Scenario </span>
            {snapshot.scenario.id} v{snapshot.scenario.version}
          </p>
        )}
      </div>

      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Terminals</p>
        {!snapshot && <p className="mt-3 text-xs text-slate-500">Loading the backend snapshot…</p>}
        {snapshot && snapshot.terminals.length === 0 && (
          <p className="mt-3 text-xs text-slate-500">No terminals in the snapshot.</p>
        )}
        {snapshot && snapshot.terminals.length > 0 && (
          <ul className="mt-3 space-y-3">
            {snapshot.terminals.map((terminal) => (
              <TerminalStatus key={terminal.id} terminal={terminal} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-auto px-6 pb-6 text-xs leading-relaxed text-slate-500">
        Connected to the live backend. Every record is synthetic. A driver report never dispatches a job.
      </p>
    </aside>
  );
}

function TerminalStatus({ terminal }: { terminal: Terminal }) {
  const status = PORTAL_LABEL[terminal.portalStatus];
  return (
    <li>
      <p className="text-sm font-medium text-white">{terminal.name}</p>
      {terminal.shortName !== terminal.name && <p className="text-xs text-slate-400">{terminal.shortName}</p>}
      <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${status.textClass}`}>
        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
        {status.text}
      </p>
    </li>
  );
}

/** Outage notice derived only from the snapshot, so the local demo banner stays off this view. */
export function LivePortalAlerts({ snapshot }: { snapshot: StateResponse }) {
  const outages = snapshot.terminals.filter((terminal) => terminal.portalStatus === "outage");
  if (outages.length === 0) return null;
  return (
    <>
      {outages.map((terminal) => {
        const unverified = snapshot.jobs.filter(
          (job) => job.terminalId === terminal.id && job.appointment.status === "unverified",
        ).length;
        return (
          <div
            key={terminal.id}
            role="alert"
            className="mb-5 rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm text-red-800"
          >
            <span className="font-semibold">{terminal.name} appointment portal outage (simulated).</span> {unverified}{" "}
            appointments are unverified. Previous values stay on the jobs for reconciliation.
          </div>
        );
      })}
    </>
  );
}
