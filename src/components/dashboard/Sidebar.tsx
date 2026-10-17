import type { Terminal } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { Button, SyntheticBadge } from "./ui";

const PORTAL_LABEL = {
  online: { text: "Portal online", dot: "bg-teal-400", textClass: "text-teal-300" },
  outage: { text: "Portal outage", dot: "bg-red-500 animate-pulse", textClass: "text-red-300" },
  reconciling: { text: "Reconciling", dot: "bg-amber-400", textClass: "text-amber-300" },
} as const;

export function Sidebar({
  now,
  terminals,
  outageTerminalId,
  onSimulateOutage,
  onRestoreAccess,
  onReset,
}: {
  now: string;
  terminals: Terminal[];
  outageTerminalId: string;
  onSimulateOutage: () => void;
  onRestoreAccess: () => void;
  onReset: () => void;
}) {
  const outageTerminal = terminals.find((t) => t.id === outageTerminalId);
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
        <p className="mt-1 font-mono text-2xl text-white">{formatTime(now)}</p>
        <p className="text-xs text-slate-500">Fri, Oct 17 · advances 1 min per action</p>
      </div>

      <div className="border-b border-white/10 px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Terminals</p>
        <ul className="mt-3 space-y-3">
          {terminals.map((terminal) => {
            const status = PORTAL_LABEL[terminal.portalStatus];
            return (
              <li key={terminal.id}>
                <p className="text-sm font-medium text-white">{terminal.shortName}</p>
                <p className="text-xs text-slate-400">{terminal.name}</p>
                <p className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${status.textClass}`}>
                  <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
                  {status.text}
                </p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Demo controls</p>
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
          <Button variant="ghostDark" onClick={onReset} className="justify-start">
            <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
            Reset demo
          </Button>
        </div>
      </div>

      <p className="mt-auto px-6 pb-6 text-xs leading-relaxed text-slate-500">
        Frontend-only prototype. All data is fictional and every action runs locally in this browser. No terminals,
        drivers or customers are contacted.
      </p>
    </aside>
  );
}
