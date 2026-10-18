"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, getState } from "@/lib/api/client";
import type { Tone } from "@/lib/demo/job-status";
import { formatTime } from "@/lib/demo/time";
import type { StateResponse } from "@/lib/shared/api-contract";
import type { RecoveryCheck, RecoveryQueueEntry, RecoveryStatus } from "@/lib/shared/operational-types";
import { useAccessGate } from "./AccessGate";
import { TierBadge } from "./JobBadges";
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

/** Read-only view of the backend's ranked recovery queue from GET /api/state. */
export function BackendQueuePanel() {
  const { onSessionExpired, onBackendUnavailable } = useAccessGate();
  const [snapshot, setSnapshot] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getState(controller.signal).then(
      (next) => {
        setSnapshot(next);
        setError(null);
        setLoading(false);
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiRequestError && err.status === 401) return onSessionExpired();
        if (err instanceof ApiRequestError && err.backendUnavailable) return onBackendUnavailable();
        setError(err instanceof Error ? err.message : "Could not load the recovery queue.");
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [refreshCount, onSessionExpired, onBackendUnavailable]);

  const refresh = () => {
    setLoading(true);
    setRefreshCount((n) => n + 1);
  };

  const queue = snapshot?.recoveryQueue ?? null;

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
        <Button onClick={refresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
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
              <QueueEntry key={entry.jobId} entry={entry} snapshot={snapshot!} estimatesLabel={queue.estimatesLabel} />
            ))}
        </ol>
      )}
    </Panel>
  );
}

function QueueEntry({
  entry,
  snapshot,
  estimatesLabel,
}: {
  entry: RecoveryQueueEntry;
  snapshot: StateResponse;
  estimatesLabel: string;
}) {
  const job = snapshot.jobs.find((j) => j.id === entry.jobId);
  const customer = job && snapshot.customers.find((c) => c.id === job.customerId);
  const driverId = entry.proposal?.driverId ?? entry.proposedDriverId;
  const driver = driverId ? snapshot.drivers.find((d) => d.id === driverId) : undefined;
  const chip = STATUS_CHIP[entry.status];
  const failed = entry.checks.filter((c) => c.result === "fail").length;

  return (
    <li className="px-5 py-3">
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
