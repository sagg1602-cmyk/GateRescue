import type { ActivityEvent, ActivityKind, ActivitySeverity } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { Panel } from "./ui";

export const SEVERITY_DOT: Record<ActivitySeverity, string> = {
  info: "bg-ink-muted",
  success: "bg-ready",
  warning: "bg-amber-500",
  critical: "bg-blocked",
};

/** Text for the severity so it is never conveyed by the dot colour alone; info needs no label. */
export const SEVERITY_LABEL: Record<ActivitySeverity, string | null> = {
  info: null,
  success: "Done",
  warning: "Warning",
  critical: "Critical",
};

export const KIND_LABEL: Record<ActivityKind, string> = {
  system: "System",
  terminal: "Terminal",
  driver: "Driver",
  plan: "Plan",
  dispatcher: "Dispatcher",
};

export function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <Panel eyebrow="Incident log" title="Activity" subtitle="Newest first · simulated clock times">
      {events.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-ink-muted">No activity has been recorded.</p>
      ) : (
        <ol className="max-h-[28rem] overflow-y-auto px-6 py-4">
          {events.map((event) => (
            <ActivityItem key={event.id} event={event} />
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function ActivityItem({ event }: { event: ActivityEvent }) {
  const severity = SEVERITY_LABEL[event.severity];
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <time dateTime={event.at} className="w-11 shrink-0 pt-px font-mono text-xs tabular-nums text-ink-muted">
        {formatTime(event.at)}
      </time>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`} aria-hidden />
      <div className="min-w-0">
        <p className="eyebrow text-ink-muted">
          {KIND_LABEL[event.kind]}
          {severity && (
            <span className={event.severity === "critical" ? "text-blocked" : event.severity === "success" ? "text-ready" : "text-awaiting"}>
              {" "}
              · {severity}
            </span>
          )}
        </p>
        <p
          className={`mt-0.5 text-xs leading-relaxed ${event.severity === "critical" ? "font-medium text-blocked" : "text-slate-700"}`}
        >
          {event.message}
        </p>
      </div>
    </li>
  );
}
