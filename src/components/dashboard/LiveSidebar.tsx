import type { StateResponse } from "@/lib/shared/api-contract";
import type { Terminal, TerminalPortalStatus } from "@/lib/shared/operational-types";
import { formatTime } from "@/lib/demo/time";
import { formatSnapshotDate } from "./snapshot-display";
import { SidebarBrand, Skeleton, StatusLight } from "./ui";

const PORTAL_LABEL: Record<TerminalPortalStatus, { text: string; tone: "ready" | "awaiting" | "blocked" }> = {
  online: { text: "Portal online", tone: "ready" },
  outage: { text: "Portal outage", tone: "blocked" },
  reconciling: { text: "Reconciling", tone: "awaiting" },
};

/** Sidebar chrome for a connected session: clock, scenario and terminals from the snapshot. */
export function LiveSidebar({ snapshot }: { snapshot: StateResponse | null }) {
  const now = snapshot?.now ?? null;
  return (
    <aside className="flex w-full shrink-0 flex-col bg-navy text-slate-200 [--focus-ring:#9fd3de] lg:min-h-screen lg:w-72">
      <SidebarBrand />

      <div className="border-b border-white/10 px-6 py-8">
        <p className="eyebrow text-rust-light">Simulated clock</p>
        {now ? (
          <p className="mt-4 font-mono text-6xl font-medium leading-none tracking-[-0.04em] tabular-nums text-white">
            {formatTime(now)}
          </p>
        ) : (
          <Skeleton className="mt-4 h-14 w-40 bg-white/10" />
        )}
        <span className="mt-5 block h-px w-12 bg-rust" aria-hidden />
        <p className="mt-4 text-xs text-slate-300">{now ? formatSnapshotDate(now) : "Clock not set"}</p>
        {snapshot?.scenario && (
          <p className="mt-3 text-xs text-slate-200">
            <span className="eyebrow text-slate-300">Scenario </span>
            <span className="font-mono">{snapshot.scenario.id}</span> v{snapshot.scenario.version}
          </p>
        )}
      </div>

      <div className="border-b border-white/10 px-6 py-6">
        <p className="eyebrow text-rust-light">Terminals</p>
        {!snapshot && (
          <div className="mt-4 space-y-3" role="status">
            <span className="sr-only">Loading the backend snapshot…</span>
            <Skeleton className="h-4 w-28 bg-white/10" />
            <Skeleton className="h-3 w-40 bg-white/10" />
          </div>
        )}
        {snapshot && snapshot.terminals.length === 0 && (
          <p className="mt-4 text-xs text-slate-300">No terminals in the snapshot.</p>
        )}
        {snapshot && snapshot.terminals.length > 0 && (
          <ul className="mt-4 space-y-4">
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
      <p className="text-sm font-semibold text-white">{terminal.name}</p>
      {terminal.shortName !== terminal.name && <p className="text-xs text-slate-300">{terminal.shortName}</p>}
      <p className="mt-2">
        <StatusLight tone={status.tone} label={status.text} pulse={terminal.portalStatus === "outage"} />
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
