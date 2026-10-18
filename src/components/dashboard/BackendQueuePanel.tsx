"use client";

import { useEffect, useState } from "react";
import type { Tone } from "@/lib/demo/job-status";
import { formatTime } from "@/lib/demo/time";
import type { StateResponse } from "@/lib/shared/api-contract";
import type {
  DriverReport,
  DriverReportSource,
  RecoveryCheck,
  RecoveryQueueEntry,
  RecoveryStatus,
} from "@/lib/shared/operational-types";
import { TierBadge } from "./JobBadges";
import { useLiveBackend } from "./LiveBackendContext";
import { Badge, Button, Panel } from "./ui";

const STATUS_CHIP: Record<RecoveryStatus, { label: string; tone: Tone }> = {
  ready_for_approval: { label: "Ready for approval", tone: "teal" },
  awaiting_verification: { label: "Awaiting verification", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
};

const CHECK_ICON: Record<RecoveryCheck["result"], { symbol: string; className: string }> = {
  pass: { symbol: "✓", className: "text-teal-600" },
  fail: { symbol: "✕", className: "text-red-600" },
  skip: { symbol: "–", className: "text-slate-400" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 20 · 08:00" in the timestamp's own offset; harm deadlines can fall on later days. */
function formatDateTime(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))} · ${formatTime(iso)}`;
}

/** Backend codes such as "call_terminal_to_reconfirm" → "Call terminal to reconfirm". */
function humanize(code: string): string {
  const words = code.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const POLL_INTERVAL_MS = 5_000;
const HIGHLIGHT_MS = 6_000;
const RECENT_REPORT_LIMIT = 5;

const isTabVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

interface StatusChange {
  from: RecoveryStatus;
  to: RecoveryStatus;
}

/** Queue entries whose status differs between two consecutive snapshots, keyed by job id. */
function statusChanges(prev: StateResponse | null, next: StateResponse | null): Map<string, StatusChange> {
  const changes = new Map<string, StatusChange>();
  if (!prev?.recoveryQueue || !next?.recoveryQueue) return changes;
  const before = new Map(prev.recoveryQueue.entries.map((e) => [e.jobId, e.status]));
  for (const entry of next.recoveryQueue.entries) {
    const from = before.get(entry.jobId);
    if (from && from !== entry.status) changes.set(entry.jobId, { from, to: entry.status });
  }
  return changes;
}

const REPORT_SOURCE_LABEL: Record<DriverReportSource, string> = {
  dispatcher: "Dispatcher entry",
  retell: "Phone call (Retell)",
  scenario: "Scenario data",
};

/** StateResponse does not declare driver reports; show them only when the response carries a `driverReports` array. */
function recentDriverReports(snapshot: StateResponse): DriverReport[] {
  const reports = (snapshot as StateResponse & { driverReports?: unknown }).driverReports;
  if (!Array.isArray(reports)) return [];
  return reports
    .filter(
      (r): r is DriverReport =>
        typeof r?.driverId === "string" && typeof r.reportedAt === "string" && typeof r.source === "string",
    )
    .sort((a, b) => Date.parse(b.reportedAt) - Date.parse(a.reportedAt))
    .slice(0, RECENT_REPORT_LIMIT);
}

/** Read-only view of the backend's ranked recovery queue from GET /api/state. */
export function BackendQueuePanel() {
  const { snapshot, updatedAt, loading, error, refresh } = useLiveBackend();
  const [visible, setVisible] = useState(isTabVisible);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => void refresh({ quiet: true }), POLL_INTERVAL_MS);
    };
    const onVisibilityChange = () => {
      const nowVisible = isTabVisible();
      setVisible(nowVisible);
      if (nowVisible) {
        void refresh({ quiet: true });
        start();
      } else {
        clearInterval(timer);
      }
    };

    void refresh();
    if (isTabVisible()) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  const [comparedSnapshot, setComparedSnapshot] = useState(snapshot);
  const [changes, setChanges] = useState<Map<string, StatusChange>>(() => new Map());
  if (snapshot !== comparedSnapshot) {
    setComparedSnapshot(snapshot);
    const next = statusChanges(comparedSnapshot, snapshot);
    if (next.size > 0 || !snapshot) setChanges(next);
  }

  useEffect(() => {
    if (changes.size === 0) return;
    const timer = setTimeout(() => setChanges(new Map()), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [changes]);

  const queue = snapshot?.recoveryQueue ?? null;
  const reports = snapshot ? recentDriverReports(snapshot) : [];
  const announcement = [...changes].map(
    ([jobId, { from, to }]) => `${jobId} changed from ${STATUS_CHIP[from].label} to ${STATUS_CHIP[to].label}.`,
  );

  return (
    <Panel
      className="mb-5"
      title="Live recovery queue (backend)"
      subtitle={
        snapshot ? (
          <>
            Ranked by the backend engine from synthetic scenario data
            {snapshot.scenario && ` (${snapshot.scenario.id} v${snapshot.scenario.version})`}. Read-only: a
            dispatcher must approve every assignment, and nothing is dispatched from here.
            {queue && ` Computed ${formatDateTime(queue.computedAt)} (sim) · inputs v${snapshot.inputsVersion ?? "?"}.`}
          </>
        ) : (
          "Ranked by the backend engine from synthetic scenario data."
        )
      }
      actions={
        <>
          <LiveIndicator visible={visible} failing={error !== null} updatedAt={updatedAt} />
          <Button onClick={() => void refresh()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          Could not load the recovery queue: {error}
        </p>
      )}

      {!snapshot && loading && <p className="px-5 py-8 text-center text-sm text-slate-500">Loading recovery queue…</p>}

      {snapshot && !queue && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">
          The backend could not compute a queue yet: the simulated clock or scenario configuration is missing.
          {snapshot.unknowns.length > 0 && ` ${snapshot.unknowns.length} values are reported as unknown.`}
        </p>
      )}

      {queue && queue.entries.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No jobs in the recovery queue.</p>
      )}

      {queue && queue.entries.length > 0 && (
        <ol className={`max-h-[32rem] divide-y divide-slate-100 overflow-y-auto ${loading ? "opacity-60" : ""}`}>
          {[...queue.entries]
            .sort((a, b) => a.rank - b.rank)
            .map((entry) => (
              <QueueEntry
                key={entry.jobId}
                entry={entry}
                snapshot={snapshot!}
                estimatesLabel={queue.estimatesLabel}
                change={changes.get(entry.jobId)}
              />
            ))}
        </ol>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement.join(" ")}
      </p>

      {snapshot && reports.length > 0 && <RecentDriverReports reports={reports} snapshot={snapshot} />}
    </Panel>
  );
}

function RecentDriverReports({ reports, snapshot }: { reports: DriverReport[]; snapshot: StateResponse }) {
  return (
    <section className="border-t border-slate-200 bg-slate-50/70 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Recent driver reports</h3>
        <Badge tone="amber">Driver-reported, unverified</Badge>
      </div>
      <ul className="mt-2 divide-y divide-slate-100 text-xs">
        {reports.map((report) => {
          const driver = snapshot.drivers.find((d) => d.id === report.driverId);
          return (
            <li key={report.id ?? `${report.driverId}-${report.reportedAt}`} className="flex gap-3 py-1.5">
              <span className="w-12 shrink-0 font-mono tabular-nums text-slate-500">{formatTime(report.reportedAt)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">
                  {driver ? `${driver.name} (${report.driverId})` : report.driverId}
                </span>
                <span className="text-slate-400"> · </span>
                <span className="text-slate-500">{REPORT_SOURCE_LABEL[report.source] ?? report.source}</span>
                <span className="block text-slate-600">{report.note || "No note"}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

/** Polling status; "Updated" is the browser's real clock, unlike the simulated times elsewhere. */
function LiveIndicator({ visible, failing, updatedAt }: { visible: boolean; failing: boolean; updatedAt: Date | null }) {
  const state = failing
    ? { label: "Update failed", dot: "bg-amber-500", text: "text-amber-800" }
    : visible
      ? { label: "Live", dot: "bg-teal-500 animate-pulse", text: "text-teal-800" }
      : { label: "Paused", dot: "bg-slate-400", text: "text-slate-500" };
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`flex items-center gap-1.5 font-medium ${state.text}`}>
        <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden />
        {state.label}
      </span>
      {updatedAt && <span className="tabular-nums text-slate-500">Updated {CLOCK.format(updatedAt)}</span>}
    </span>
  );
}

function QueueEntry({
  entry,
  snapshot,
  estimatesLabel,
  change,
}: {
  entry: RecoveryQueueEntry;
  snapshot: StateResponse;
  estimatesLabel: string;
  /** Set briefly after a refresh in which this entry's status changed. */
  change?: StatusChange;
}) {
  const job = snapshot.jobs.find((j) => j.id === entry.jobId);
  const customer = job && snapshot.customers.find((c) => c.id === job.customerId);
  const driverId = entry.proposal?.driverId ?? entry.proposedDriverId;
  const driver = driverId ? snapshot.drivers.find((d) => d.id === driverId) : undefined;
  const chip = STATUS_CHIP[entry.status];
  const failed = entry.checks.filter((c) => c.result === "fail").length;

  return (
    <li
      className={`px-5 py-3 transition-colors duration-700 ${
        change ? "bg-amber-50 shadow-[inset_3px_0_0_0_var(--color-amber-400)]" : ""
      }`}
    >
      {change && (
        <p className="mb-1.5 ml-10 text-xs font-medium text-amber-800">
          Status changed: {STATUS_CHIP[change.from].label} → {STATUS_CHIP[change.to].label}
        </p>
      )}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-7 shrink-0 text-right font-mono text-sm font-semibold text-slate-400">
          #{entry.rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-slate-900">
              <span className="font-mono font-semibold">{entry.jobId}</span>
              {job && <span className="ml-2 font-mono text-xs text-slate-500">{job.container}</span>}
              <span className="ml-2 text-slate-700">
                {job?.cargoDescription ?? "Cargo not stated"}
                <span className="text-slate-400"> · </span>
                {customer?.name ?? job?.customerId ?? "Unknown customer"}
              </span>
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              {entry.criticalityTier === null ? (
                <Badge>Tier unknown</Badge>
              ) : (
                <TierBadge tier={entry.criticalityTier} />
              )}
              <span title={entry.status}>
                <Badge tone={chip.tone}>{chip.label}</Badge>
              </span>
            </div>
          </div>

          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs xl:grid-cols-4">
            <Field label="Harm deadline" value={formatDateTime(entry.harmDeadline)} />
            <Field
              label="Blocker"
              value={entry.blocker ? humanize(entry.blocker) : "None"}
              tone={entry.blocker ? "text-red-700" : undefined}
            />
            <Field label="Owner" value={humanize(entry.owner)} />
            <Field label="Next action" value={humanize(entry.nextAction)} />
          </dl>

          {(driverId || entry.proposal) && (
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>
                <span className="text-slate-500">Proposed driver:</span>{" "}
                <span className="font-medium">{driver ? `${driver.name} (${driverId})` : driverId}</span>
                {entry.proposal && (
                  <>
                    <span className="text-slate-400"> · </span>
                    Depart {formatTime(entry.proposal.departAt)} · Pickup {formatTime(entry.proposal.pickupAt)} ·
                    Complete by {formatTime(entry.proposal.completeBy)} · {entry.proposal.travelMinutes} min travel
                  </>
                )}
              </p>
              {entry.proposal && <p className="mt-0.5 text-[11px] text-slate-500">{estimatesLabel}</p>}
            </div>
          )}

          <details className="mt-2 text-xs">
            <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">
              Checks ({entry.checks.length}
              {failed > 0 && `, ${failed} failed`})
            </summary>
            {entry.checks.length === 0 ? (
              <p className="mt-1.5 italic text-slate-400">No checks reported.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {entry.checks.map((check, i) => (
                  <li key={`${check.label}-${i}`} className="flex gap-1.5">
                    <span className={`w-3 shrink-0 font-semibold ${CHECK_ICON[check.result].className}`}>
                      {CHECK_ICON[check.result].symbol}
                    </span>
                    <span>
                      <span className="font-medium text-slate-700">{check.label}:</span>{" "}
                      <span className="text-slate-500">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      </div>
    </li>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium ${tone ?? "text-slate-800"}`}>{value}</dd>
    </div>
  );
}
