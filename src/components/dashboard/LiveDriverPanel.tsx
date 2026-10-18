import type { ReactNode } from "react";
import type { StateResponse } from "@/lib/shared/api-contract";
import type { Driver } from "@/lib/shared/operational-types";
import { formatTime } from "@/lib/demo/time";
import { EQUIPMENT_LABELS } from "@/lib/demo/synthetic-data";
import { AVAILABILITY_LABEL } from "./DriverPanel";
import {
  formatSnapshotDate,
  formatSnapshotDateTime,
  latestDriverReport,
  REPORT_SOURCE_LABEL,
  snapshotDriverReports,
  unknownReason,
  type ListedDriverReport,
} from "./snapshot-display";
import { Badge, Panel } from "./ui";

/** Driver roster from the backend snapshot, including the latest stored report when the response has one. */
export function LiveDriverPanel({ snapshot, children }: { snapshot: StateResponse | null; children?: ReactNode }) {
  const reports = snapshot ? snapshotDriverReports(snapshot) : [];
  return (
    <Panel
      eyebrow="Live roster"
      title="Drivers"
      subtitle="From the live backend snapshot. A report updates status only and stays unverified."
    >
      {children}
      {!snapshot && (
        <p role="status" className="px-6 py-10 text-center text-sm text-ink-muted">
          Loading drivers…
        </p>
      )}
      {snapshot && snapshot.drivers.length === 0 && (
        <p className="px-6 py-10 text-center text-sm text-ink-muted">No drivers in the snapshot.</p>
      )}
      {snapshot && snapshot.drivers.length > 0 && (
        <ul className="divide-y divide-line">
          {snapshot.drivers.map((driver) => (
            <DriverRow
              key={driver.id}
              driver={driver}
              snapshot={snapshot}
              report={latestDriverReport(reports, driver.id)}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DriverRow({
  driver,
  snapshot,
  report,
}: {
  driver: Driver;
  snapshot: StateResponse;
  report: ListedDriverReport | undefined;
}) {
  const availability = AVAILABILITY_LABEL[driver.availability];
  const fromReason = driver.availableFrom === null ? unknownReason(snapshot, "driver", driver.id, "availableFrom") : undefined;
  const locationReason = !driver.location ? unknownReason(snapshot, "driver", driver.id, "location") : undefined;
  const reportReason = driver.lastReport === null ? unknownReason(snapshot, "driver", driver.id, "lastReport") : undefined;
  const note = report?.note || driver.lastNote;

  return (
    <li className="px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium text-navy">
          {driver.name} <span className="font-mono text-xs font-normal text-ink-muted">{driver.id}</span>
        </p>
        <Badge tone={availability.tone}>{availability.label}</Badge>
      </div>
      {driver.equipment.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {driver.equipment.map((equipment) => (
            <span key={equipment} className="rounded bg-paper-deep px-1.5 py-0.5 text-[11px] text-slate-600">
              {EQUIPMENT_LABELS[equipment]}
            </span>
          ))}
        </div>
      )}
      <dl className="mt-1.5 space-y-0.5 text-xs text-slate-600">
        <div>
          <dt className="inline text-ink-muted">Available from </dt>
          <dd className="inline">
            {driver.availableFrom ? formatSnapshotDateTime(driver.availableFrom) : "Unknown"}
            {fromReason && <span className="text-ink-muted"> · {fromReason}</span>}
          </dd>
        </div>
        <div>
          <dt className="inline text-ink-muted">Location </dt>
          <dd className="inline">
            {driver.location || "Unknown"}
            {locationReason && <span className="text-ink-muted"> · {locationReason}</span>}
          </dd>
        </div>
        <div>
          <dt className="inline text-ink-muted">Last report </dt>
          <dd className="inline">
            {driver.lastReport ? (
              <>
                <span className="font-mono tabular-nums">{formatTime(driver.lastReport)}</span>
                <span className="text-ink-muted"> · {formatSnapshotDate(driver.lastReport)}</span>
              </>
            ) : (
              "Not reported"
            )}
            {reportReason && <span className="text-ink-muted"> · {reportReason}</span>}
          </dd>
        </div>
      </dl>
      {(report || driver.lastReport) && (
        <div className="mt-2 rounded-md bg-awaiting-soft px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="amber">Driver-reported, unverified</Badge>
            {report && <span className="text-[11px] text-slate-600">{REPORT_SOURCE_LABEL[report.source]}</span>}
          </div>
          {report && (
            <p className="mt-1 text-[11px] text-ink-muted">Reported {formatSnapshotDateTime(report.reportedAt)}</p>
          )}
          <p className="mt-1 text-xs text-slate-700">{note || "No note"}</p>
        </div>
      )}
    </li>
  );
}
