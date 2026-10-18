import type { ReactNode } from "react";
import { OUTAGE_TERMINAL_ID } from "@/lib/demo/demo-state";
import type {
  ActivityEvent,
  Customer,
  Driver,
  Job,
  Priority,
  Terminal,
  TerminalPortalStatus,
} from "@/lib/demo/frontend-types";
import { getJobStatus, type Tone } from "@/lib/demo/job-status";
import { sortJobsForPlanning } from "@/lib/demo/recovery-heuristic";
import { compareIso } from "@/lib/shared/datetime";
import { formatTime } from "@/lib/demo/time";
import { ActivityItem } from "./ActivityLog";
import { Badge, Button, Panel, SyntheticBadge } from "./ui";

const PRIORITY_TONE: Record<Priority, Tone> = { critical: "red", high: "amber", normal: "neutral" };

interface JobRow {
  id: string;
  container: string;
  customer: string;
  priority: Priority;
  reason: ReactNode;
}

/**
 * One-sentence situation for the outage terminal. Works before any outage,
 * while the portal is down, and after access returns.
 */
export function situationSentence(terminal: Terminal | undefined, unresolvedCount: number, hadOutage: boolean): string {
  const name = terminal?.shortName ?? "Terminal A";
  const remaining =
    unresolvedCount === 1 ? "1 appointment still unresolved" : `${unresolvedCount} appointments still unresolved`;
  const status: TerminalPortalStatus | "missing" = terminal?.portalStatus ?? "missing";

  if (status === "outage") return `${name} appointment portal is in outage. ${remaining}.`;
  if (status === "reconciling") return `${name} access restored. ${remaining}.`;
  if (hadOutage) return `${name} reconciliation is complete. ${remaining}.`;
  return `${name} portal is online and no outage has been simulated. ${remaining}.`;
}

/**
 * Affected jobs with no approval that are still unverified, lost, or blocked.
 * A job counts as affected once the outage terminal has a pre-outage snapshot,
 * or — after an outage has started — when it still sits blocked at that terminal.
 */
export function isUnresolvedJob(job: Job, terminals: Terminal[], drivers: Driver[], hadOutage: boolean): boolean {
  if (job.approval !== null) return false;
  const terminal = terminals.find((item) => item.id === job.terminalId);
  const appointmentOpen = job.appointment.status === "unverified" || job.appointment.status === "lost";
  const blocked = getJobStatus(job, terminal, drivers).blocker !== null;
  if (!appointmentOpen && !blocked) return false;
  if (job.appointment.preOutage !== null) return true;
  return hadOutage && job.terminalId === OUTAGE_TERMINAL_ID;
}

/** Same priority as getJobStatus, so the person matches the blocker shown. */
export function whoMustResolve(job: Job, terminal: Terminal | undefined): string {
  if (job.holds.length > 0) return "Broker";
  if (!job.containerAvailable) return "Terminal";
  if (job.appointment.status === "unverified" && terminal?.portalStatus !== "reconciling") return "Terminal";
  return "Dispatcher";
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Oldest activity first, then each job's final state. No network call. */
export function buildEvidenceCsv(events: ActivityEvent[], jobs: Job[], drivers: Driver[]): string {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver.name]));
  const chronological = [...events].sort((a, b) => compareIso(a.at, b.at) || a.id - b.id);
  const eventRows = chronological.map((event) =>
    [formatTime(event.at), event.kind, event.severity, event.message].map(csvField).join(","),
  );
  const jobRows = [...jobs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((job) => {
      const approvedDriver = job.approval ? (driversById.get(job.approval.driverId) ?? "") : "";
      return [job.id, job.container, approvedDriver, job.appointment.status].map(csvField).join(",");
    });

  return [
    ["time", "kind", "severity", "message"].map(csvField).join(","),
    ...eventRows,
    "",
    ["job", "container", "approved driver", "appointment status"].map(csvField).join(","),
    ...jobRows,
  ].join("\n");
}

function downloadEvidenceLog(events: ActivityEvent[], jobs: Job[], drivers: Driver[]) {
  const csv = buildEvidenceCsv(events, jobs, drivers);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "gaterescue-evidence-log.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function JobSection({ title, subtitle, empty, rows }: { title: string; subtitle: string; empty: string; rows: JobRow[] }) {
  return (
    <Panel title={title} subtitle={subtitle}>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm italic text-ink-muted">{empty}</p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs font-semibold whitespace-nowrap text-navy">{row.container}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{row.customer}</p>
                </div>
                <Badge tone={PRIORITY_TONE[row.priority]}>{row.priority}</Badge>
              </div>
              <div className="mt-2 text-xs leading-relaxed text-slate-700">{row.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ReconciliationView({
  terminals,
  jobs,
  drivers,
  customers,
  events,
  onBack,
}: {
  terminals: Terminal[];
  jobs: Job[];
  drivers: Driver[];
  customers: Customer[];
  events: ActivityEvent[];
  onBack: () => void;
}) {
  const terminal = terminals.find((item) => item.id === OUTAGE_TERMINAL_ID);
  const driversById = new Map(drivers.map((driver) => [driver.id, driver.name]));
  const customersById = new Map(customers.map((customer) => [customer.id, customer.name]));
  const hadOutage = jobs.some((job) => job.appointment.preOutage !== null);
  const nameFor = (customerId: string) => customersById.get(customerId) ?? "Unknown customer";

  const approved = sortJobsForPlanning(jobs.filter((job) => job.approval !== null)).map((job) => {
    const approval = job.approval;
    const driverName = approval ? (driversById.get(approval.driverId) ?? "Unknown driver") : "Unknown driver";
    const approvedAt = approval ? formatTime(approval.approvedAt) : "—";
    return {
      id: job.id,
      container: job.container,
      customer: nameFor(job.customerId),
      priority: job.priority,
      reason: `Approved for ${driverName} at ${approvedAt} (simulated).`,
    };
  });

  const changed = sortJobsForPlanning(
    jobs.filter((job) => job.appointment.preOutage !== null && job.appointment.preOutage.status !== job.appointment.status),
  ).map((job) => ({
    id: job.id,
    container: job.container,
    customer: nameFor(job.customerId),
    priority: job.priority,
    reason: `was ${job.appointment.preOutage?.status}, now ${job.appointment.status}`,
  }));

  const unresolved = sortJobsForPlanning(jobs.filter((job) => isUnresolvedJob(job, terminals, drivers, hadOutage))).map(
    (job) => {
      const jobTerminal = terminals.find((item) => item.id === job.terminalId);
      const status = getJobStatus(job, jobTerminal, drivers);
      const blocker = status.blocker?.label ?? "Unresolved";
      return {
        id: job.id,
        container: job.container,
        customer: nameFor(job.customerId),
        priority: job.priority,
        reason: (
          <>
            <p>
              <span className="text-ink-muted">Blocker:</span> {blocker}
            </p>
            <p>
              <span className="text-ink-muted">Who resolves it:</span> {whoMustResolve(job, jobTerminal)}
            </p>
            <p>
              <span className="text-ink-muted">Next:</span> {status.nextAction}
            </p>
          </>
        ),
      };
    },
  );

  const chronological = [...events].sort((a, b) => compareIso(a.at, b.at) || a.id - b.id);
  const situation = situationSentence(terminal, unresolved.length, hadOutage);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow text-rust">Back to normal</p>
          <h1 className="mt-2 font-display text-4xl font-semibold leading-tight tracking-tight text-navy">{situation}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Fictional terminals, customers and drivers. Restored access leaves every job open for review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyntheticBadge />
          <Button onClick={onBack}>Back to dashboard</Button>
          <Button variant="primary" onClick={() => downloadEvidenceLog(events, jobs, drivers)}>
            Download evidence log
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <JobSection
          title={`Approved (${approved.length})`}
          subtitle="Jobs with a dispatcher approval"
          empty="No jobs have a dispatcher approval yet."
          rows={approved}
        />
        <JobSection
          title={`Changed (${changed.length})`}
          subtitle="Appointment status differs from the pre-outage value"
          empty="No appointment statuses have changed since the outage."
          rows={changed}
        />
        <JobSection
          title={`Unresolved (${unresolved.length})`}
          subtitle="Affected jobs still unverified, lost, or blocked"
          empty="No affected jobs are still unverified, lost, or blocked."
          rows={unresolved}
        />
      </div>

      <div className="mt-6">
        <Panel title="Activity timeline" subtitle="Oldest first · simulated clock times">
          {chronological.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm italic text-ink-muted">No activity has been recorded.</p>
          ) : (
            <ol className="max-h-[28rem] overflow-y-auto px-6 py-4">
              {chronological.map((event) => (
                <ActivityItem key={event.id} event={event} />
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
