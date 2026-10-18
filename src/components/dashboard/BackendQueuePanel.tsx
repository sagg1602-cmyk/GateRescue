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
import { humanizeCode, needsDriverReport } from "./snapshot-display";
import { Badge, Button, JumpLink, Panel, Skeleton } from "./ui";

const STATUS_CHIP: Record<RecoveryStatus, { label: string; tone: Tone }> = {
  ready_for_approval: { label: "Ready for approval", tone: "teal" },
  awaiting_verification: { label: "Awaiting verification", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
};

const CHECK_ICON: Record<RecoveryCheck["result"], { symbol: string; className: string }> = {
  pass: { symbol: "✓", className: "text-ready" },
  fail: { symbol: "✕", className: "text-blocked" },
  skip: { symbol: "–", className: "text-ink-muted" },
};

const CHECK_RESULT_LABEL: Record<RecoveryCheck["result"], string> = { pass: "Pass", fail: "Fail", skip: "Skipped" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 20" in the timestamp's own offset; harm deadlines can fall on later days. */
function formatDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** "Oct 20 · 08:00". */
function formatDateTime(iso: string): string {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

/** Slim vertical urgency bar beside the rank numeral. The status badge in the row carries the text label. */
const STATUS_BAR: Record<RecoveryStatus, string> = {
  ready_for_approval: "bg-ready",
  awaiting_verification: "bg-awaiting",
  blocked: "bg-blocked",
};

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
      id="live-queue"
      eyebrow="Ranked by the backend"
      title="Live recovery queue"
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
        <p role="alert" className="mx-6 mt-4 rounded-lg border border-blocked/30 bg-blocked-soft px-4 py-3 text-sm text-blocked">
          Could not load the recovery queue: {error}. Use Refresh to try again.
        </p>
      )}

      {!snapshot && loading && <QueueSkeleton />}

      {snapshot && !queue && (
        <p className="px-6 py-10 text-center text-sm text-ink-muted">
          The backend could not compute a queue yet: the simulated clock or scenario configuration is missing.
          {snapshot.unknowns.length > 0 && ` ${snapshot.unknowns.length} values are reported as unknown.`}
        </p>
      )}

      {queue && queue.entries.length === 0 && (
        <div className="px-6 py-14 text-center">
          <p className="font-display text-2xl font-semibold tracking-tight text-navy">Nothing needs recovery right now</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            New driver reports and terminal changes show up here within 5 seconds. Nothing is dispatched from this screen.
          </p>
        </div>
      )}

      {queue && queue.entries.length > 0 && (
        <ol className={`divide-y divide-line transition-opacity ${loading ? "opacity-60" : ""}`}>
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
    <section className="border-t border-line bg-paper px-6 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="eyebrow text-rust">Recent driver reports</h3>
        <Badge tone="amber">Driver-reported, unverified</Badge>
      </div>
      <ul className="mt-2 divide-y divide-line text-xs">
        {reports.map((report) => {
          const driver = snapshot.drivers.find((d) => d.id === report.driverId);
          return (
            <li key={report.id ?? `${report.driverId}-${report.reportedAt}`} className="flex gap-3 py-1.5">
              <span className="w-12 shrink-0 font-mono tabular-nums text-ink-muted">{formatTime(report.reportedAt)}</span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">
                  {driver ? `${driver.name} (${report.driverId})` : report.driverId}
                </span>
                <span className="text-ink-muted"> · </span>
                <span className="text-ink-muted">{REPORT_SOURCE_LABEL[report.source] ?? report.source}</span>
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
    ? { label: "Update failed", dot: "bg-amber-500", text: "text-awaiting" }
    : visible
      ? { label: "Live", dot: "bg-ready live-pulse", text: "text-ready" }
      : { label: "Paused", dot: "bg-ink-muted", text: "text-ink-muted" };
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className={`flex items-center gap-1.5 font-medium ${state.text}`}>
        <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden />
        {state.label}
      </span>
      {updatedAt && (
        <span className="text-ink-muted">
          Updated <span className="font-mono tabular-nums">{CLOCK.format(updatedAt)}</span>
        </span>
      )}
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
  const ready = entry.status === "ready_for_approval";

  return (
    <li
      id={`queue-${entry.jobId}`}
      className={`px-4 py-6 transition-colors duration-500 md:px-6 ${
        change
          ? "bg-awaiting-soft shadow-[inset_4px_0_0_0_var(--color-awaiting)]"
          : ready
            ? "bg-ready-soft shadow-[inset_4px_0_0_0_var(--color-ready)]"
            : "hover:bg-paper/70"
      }`}
    >
      {change && (
        <p className="mb-3 text-xs font-semibold text-awaiting">
          Status changed: {STATUS_CHIP[change.from].label} → {STATUS_CHIP[change.to].label}
        </p>
      )}
      <div className="flex gap-4 md:gap-6">
        {/* Rank numeral and a slim urgency bar coloured by status. The status badge beside the id carries the text. */}
        <div className="flex shrink-0 flex-col items-center gap-3">
          <span className="font-display text-3xl font-semibold leading-none tracking-tight tabular-nums text-rust md:text-4xl">
            #{entry.rank}
          </span>
          <span className={`w-1 flex-1 rounded-full ${STATUS_BAR[entry.status]}`} aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-lg font-semibold tracking-tight text-navy">{entry.jobId}</span>
                <span title={entry.status}>
                  <Badge tone={chip.tone} solid={ready}>
                    {ready && <span aria-hidden>✓</span>}
                    {chip.label}
                  </Badge>
                </span>
                {entry.criticalityTier === null ? (
                  <Badge>Tier unknown</Badge>
                ) : (
                  <TierBadge tier={entry.criticalityTier} />
                )}
              </div>

              <p className="mt-3 text-base text-navy">
                <span className="eyebrow mr-2 text-rust">Next action</span>
                <span className="font-semibold">{humanizeCode(entry.nextAction)}</span>
              </p>

              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                {job && <span className="font-mono">{job.container}</span>}
                {job && <span> · </span>}
                {job?.cargoDescription ?? "Cargo not stated"}
                <span> · </span>
                {customer?.name ?? job?.customerId ?? "Unknown customer"}
                <span> · </span>
                Blocker:{" "}
                <span className={entry.blocker ? "font-semibold text-blocked" : "text-navy"}>
                  {entry.blocker ? humanizeCode(entry.blocker) : "none"}
                </span>
                <span> · </span>
                Resolved by <span className="text-navy">{humanizeCode(entry.owner).toLowerCase()}</span>
              </p>
            </div>

            {/* Harm deadline: the most prominent data point in the row. */}
            <div className="shrink-0 sm:text-right">
              <p className="eyebrow text-ink-muted">Harm deadline</p>
              <p className="mt-1 font-mono text-3xl font-medium leading-none tracking-tight tabular-nums text-navy md:text-4xl">
                {formatTime(entry.harmDeadline)}
              </p>
              <p className="mt-1.5 font-mono text-xs text-ink-muted">{formatDate(entry.harmDeadline)}</p>
            </div>
          </div>

          {needsDriverReport(entry.nextAction) && (
            <div className="mt-3">
              <JumpLink href="#driver-report">Record driver report →</JumpLink>
            </div>
          )}

          {(driverId || entry.proposal) && (
            <div className={`mt-3 rounded-md px-3 py-2 text-xs text-slate-700 ${ready ? "bg-white" : "bg-paper"}`}>
              <p>
                <span className="text-ink-muted">Proposed driver:</span>{" "}
                <span className="font-semibold text-navy">{driver ? `${driver.name} (${driverId})` : driverId}</span>
                {entry.proposal && (
                  <>
                    <span className="text-ink-muted"> · </span>
                    <span className="font-mono">
                      Depart {formatTime(entry.proposal.departAt)} · Pickup {formatTime(entry.proposal.pickupAt)} ·
                      Complete by {formatTime(entry.proposal.completeBy)}
                    </span>{" "}
                    · {entry.proposal.travelMinutes} min travel
                  </>
                )}
              </p>
              {entry.proposal && <p className="mt-0.5 text-[11px] text-ink-muted">{estimatesLabel}</p>}
            </div>
          )}

          <details className="mt-1 text-xs">
            <summary className="inline-flex min-h-11 cursor-pointer select-none items-center text-ink-muted hover:text-navy">
              Checks ({entry.checks.length}
              {failed > 0 && `, ${failed} failed`})
            </summary>
            {entry.checks.length === 0 ? (
              <p className="mt-1.5 italic text-ink-muted">No checks reported.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {entry.checks.map((check, i) => (
                  <li key={`${check.label}-${i}`} className="flex gap-1.5">
                    <span className={`w-3 shrink-0 font-semibold ${CHECK_ICON[check.result].className}`} aria-hidden>
                      {CHECK_ICON[check.result].symbol}
                    </span>
                    <span className="sr-only">{CHECK_RESULT_LABEL[check.result]}:</span>
                    <span>
                      <span className="font-medium text-slate-700">{check.label}:</span>{" "}
                      <span className="text-ink-muted">{check.detail}</span>
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

/** Placeholder rows shown before the first snapshot arrives. */
function QueueSkeleton() {
  return (
    <div role="status" className="divide-y divide-line">
      <span className="sr-only">Loading recovery queue…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-6 px-6 py-6">
          <Skeleton className="h-9 w-10" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3 w-full max-w-xl" />
          </div>
          <Skeleton className="hidden h-10 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
