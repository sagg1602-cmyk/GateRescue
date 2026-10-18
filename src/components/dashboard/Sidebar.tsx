import type { Terminal } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { Button, SidebarBrand, StatusLight } from "./ui";

const PORTAL_LABEL = {
  online: { text: "Portal online", tone: "ready" },
  outage: { text: "Portal outage", tone: "blocked" },
  reconciling: { text: "Reconciling", tone: "awaiting" },
} as const;

export function Sidebar({
  now,
  terminals,
  outageTerminalId,
  onSimulateOutage,
  onRestoreAccess,
  onOpenReconciliation,
  reconciliationOpen,
  onReset,
}: {
  now: string;
  terminals: Terminal[];
  outageTerminalId: string;
  onSimulateOutage: () => void;
  onRestoreAccess: () => void;
  onOpenReconciliation: () => void;
  reconciliationOpen: boolean;
  onReset: () => void;
}) {
  const outageTerminal = terminals.find((t) => t.id === outageTerminalId);
  return (
    <aside className="flex w-full shrink-0 flex-col bg-navy text-slate-200 [--focus-ring:#9fd3de] lg:min-h-screen lg:w-72">
      <SidebarBrand />

      <div className="border-b border-white/10 px-6 py-8">
        <p className="eyebrow text-rust-light">Simulated clock</p>
        <p className="mt-4 font-mono text-6xl font-medium leading-none tracking-[-0.04em] tabular-nums text-white">
          {formatTime(now)}
        </p>
        <span className="mt-5 block h-px w-12 bg-rust" aria-hidden />
        <p className="mt-4 text-xs text-slate-300">Fri, Oct 17 · advances 1 min per action</p>
      </div>

      <div className="border-b border-white/10 px-6 py-6">
        <p className="eyebrow text-rust-light">Terminals</p>
        <ul className="mt-4 space-y-4">
          {terminals.map((terminal) => {
            const status = PORTAL_LABEL[terminal.portalStatus];
            return (
              <li key={terminal.id}>
                <p className="text-sm font-semibold text-white">{terminal.shortName}</p>
                <p className="text-xs text-slate-300">{terminal.name}</p>
                <p className="mt-2">
                  <StatusLight tone={status.tone} label={status.text} pulse={terminal.portalStatus === "outage"} />
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="demo-controls" className="px-6 py-6">
        <p className="eyebrow text-rust-light">Demo controls</p>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="ghostDark"
            onClick={onSimulateOutage}
            disabled={outageTerminal?.portalStatus !== "online"}
            className="justify-start"
          >
            <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
            Simulate {outageTerminal?.shortName} outage
          </Button>
          <Button
            variant="ghostDark"
            onClick={onRestoreAccess}
            disabled={outageTerminal?.portalStatus !== "outage"}
            className="justify-start"
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden />
            Restore {outageTerminal?.shortName} access
          </Button>
          <Button
            variant="ghostDark"
            onClick={onOpenReconciliation}
            aria-pressed={reconciliationOpen}
            className="justify-start"
          >
            <span className="h-2 w-2 rounded-full bg-teal-400" aria-hidden />
            Open reconciliation
          </Button>
          <Button variant="ghostDark" onClick={onReset} className="justify-start">
            <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
            Reset demo
          </Button>
        </div>
      </div>

      <p className="mt-auto px-6 pb-6 text-xs leading-relaxed text-slate-300">
        Frontend-only prototype. All data is fictional and every action runs locally in this browser. No terminals,
        drivers or customers are contacted.
      </p>
    </aside>
  );
}
