import type { ActivityEvent, ActivityKind, ActivitySeverity } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { Panel } from "./ui";

const SEVERITY_DOT: Record<ActivitySeverity, string> = {
  info: "bg-slate-400",
  success: "bg-teal-500",
  warning: "bg-amber-500",
  critical: "bg-red-600",
};

const KIND_LABEL: Record<ActivityKind, string> = {
  system: "System",
  terminal: "Terminal",
  driver: "Driver",
  plan: "Plan",
  dispatcher: "Dispatcher",
};

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <Panel title="Incident activity" subtitle="Newest first · simulated clock times">
      <ol className="max-h-[28rem] overflow-y-auto px-5 py-3">
        {events.map((event) => (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            <span className="w-11 shrink-0 pt-px font-mono text-xs tabular-nums text-slate-500">{formatTime(event.at)}</span>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{KIND_LABEL[event.kind]}</p>
              <p className={`text-xs leading-relaxed ${event.severity === "critical" ? "font-medium text-red-700" : "text-slate-700"}`}>
                {event.message}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
