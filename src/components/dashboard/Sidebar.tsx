import type { Terminal } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { Button, SidebarBrand } from "./ui";

const PORTAL_LABEL = {
  online: { text: "Portal online", dot: "bg-teal-300", textClass: "text-teal-200" },
  outage: { text: "Portal outage", dot: "bg-red-400 animate-pulse", textClass: "text-red-200" },
  reconciling: { text: "Reconciling", dot: "bg-amber-300", textClass: "text-amber-200" },
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
    <aside className="flex w-72 shrink-0 flex-col bg-navy text-slate-200 [--focus-ring:#9fd3de]">
      <SidebarBrand />

      <div className="border-b border-white/10 px-6 py-5">
        <p className="eyebrow text-[#f0a27f]">Simulated clock</p>
        <p className="mt-2 font-mono text-3xl font-medium text-white">{formatTime(now)}</p>
        <p className="mt-1 text-xs text-slate-300">Fri, Oct 17 · advances 1 min per action</p>
      </div>

      <div className="border-b border-white/10 px-6 py-5">
        <p className="eyebrow text-[#f0a27f]">Terminals</p>
        <ul className="mt-3 space-y-3">
          {terminals.map((terminal) => {
            const status = PORTAL_LABEL[terminal.portalStatus];
            return (
              <li key={terminal.id}>
                <p className="text-sm font-medium text-white">{terminal.shortName}</p>
                <p className="text-xs text-slate-300">{terminal.name}</p>
                <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${status.textClass}`}>
                  <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
                  {status.text}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="demo-controls" className="px-6 py-5">
        <p className="eyebrow text-[#f0a27f]">Demo controls</p>
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
            Reconciliation
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
