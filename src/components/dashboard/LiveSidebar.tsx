import type { StateResponse } from "@/lib/shared/api-contract";
import type { Terminal, TerminalPortalStatus } from "@/lib/shared/operational-types";
import { formatTime } from "@/lib/demo/time";
import { formatSnapshotDate } from "./snapshot-display";
import { SidebarBrand } from "./ui";

const PORTAL_LABEL: Record<TerminalPortalStatus, { text: string; dot: string; textClass: string }> = {
  online: { text: "Portal online", dot: "bg-teal-300", textClass: "text-teal-200" },
  outage: { text: "Portal outage", dot: "bg-red-400 animate-pulse", textClass: "text-red-200" },
  reconciling: { text: "Reconciling", dot: "bg-amber-300", textClass: "text-amber-200" },
};

/** Sidebar chrome for a connected session: clock, scenario and terminals from the snapshot. */
export function LiveSidebar({ snapshot }: { snapshot: StateResponse | null }) {
  const now = snapshot?.now ?? null;
  return (
    <aside className="flex w-72 shrink-0 flex-col bg-navy text-slate-200 [--focus-ring:#9fd3de]">
      <SidebarBrand />

      <div className="border-b border-white/10 px-6 py-5">
        <p className="eyebrow text-[#f0a27f]">Simulated clock</p>
        <p className="mt-2 font-mono text-3xl font-medium text-white">{now ? formatTime(now) : "—"}</p>
        <p className="mt-1 text-xs text-slate-300">{now ? formatSnapshotDate(now) : "Clock not set"}</p>
        {snapshot?.scenario && (
          <p className="mt-3 text-xs text-slate-200">
            <span className="eyebrow text-slate-300">Scenario </span>
            <span className="font-mono">{snapshot.scenario.id}</span> v{snapshot.scenario.version}
          </p>
        )}
      </div>

      <div className="border-b border-white/10 px-6 py-5">
        <p className="eyebrow text-[#f0a27f]">Terminals</p>
        {!snapshot && <p className="mt-3 text-xs text-slate-300">Loading the backend snapshot…</p>}
        {snapshot && snapshot.terminals.length === 0 && (
          <p className="mt-3 text-xs text-slate-300">No terminals in the snapshot.</p>
        )}
        {snapshot && snapshot.terminals.length > 0 && (
          <ul className="mt-3 space-y-3">
            {snapshot.terminals.map((terminal) => (
              <TerminalStatus key={terminal.id} terminal={terminal} />
            ))}
          </ul>
        )}
      </div>

      <p className="mt-auto px-6 pb-6 text-xs leading-relaxed text-slate-300">
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
      {terminal.shortName !== terminal.name && <p className="text-xs text-slate-300">{terminal.shortName}</p>}
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
            className="mb-5 rounded-card border border-blocked/30 bg-blocked-soft px-6 py-4 text-sm text-blocked"
          >
            <span className="font-semibold">{terminal.name} appointment portal outage (simulated).</span> {unverified}{" "}
            appointments are unverified. Previous values stay on the jobs for reconciliation.
          </div>
        );
      })}
    </>
  );
}
