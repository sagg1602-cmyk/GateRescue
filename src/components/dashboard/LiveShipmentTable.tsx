import type { AppointmentStatus } from "@/lib/shared/operational-types";
import type { Tone } from "@/lib/demo/job-status";
import type { StateResponse } from "@/lib/shared/api-contract";
import { TierBadge } from "./JobBadges";
import { BASIS_LABEL, formatAppointmentWindow, formatSnapshotDateTime, unknownReason } from "./snapshot-display";
import { Badge, Panel } from "./ui";

const APPOINTMENT_BADGE: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "teal" },
  unverified: { label: "Unverified", tone: "amber" },
  none: { label: "Not booked", tone: "red" },
  lost: { label: "Lost", tone: "red" },
};

/** Read-only shipment list from the backend snapshot. Reconciliation actions stay on the local demo. */
export function LiveShipmentTable({ snapshot }: { snapshot: StateResponse | null }) {
  const jobs = snapshot?.jobs ?? [];
  return (
    <Panel
      title="Shipments"
      subtitle={
        snapshot
          ? `${jobs.length} jobs from the backend snapshot. Harm deadline is the time delay starts causing harm.`
          : "Loading jobs from the backend snapshot."
      }
    >
      {!snapshot && <p className="px-5 py-8 text-center text-sm text-slate-500">Loading shipments…</p>}
      {snapshot && jobs.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No jobs in the snapshot.</p>
      )}
      {snapshot && jobs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Job</th>
                <th className="px-3 py-2.5 font-medium">Cargo</th>
                <th className="px-3 py-2.5 font-medium">Customer</th>
                <th className="px-3 py-2.5 font-medium">Terminal</th>
                <th className="px-3 py-2.5 font-medium">Appointment window</th>
                <th className="px-3 py-2.5 font-medium">Appointment</th>
                <th className="px-3 py-2.5 font-medium">Tier · basis</th>
                <th className="px-3 py-2.5 font-medium">Harm deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((job) => {
                const customer = snapshot.customers.find((item) => item.id === job.customerId);
                const terminal = snapshot.terminals.find((item) => item.id === job.terminalId);
                const badge = APPOINTMENT_BADGE[job.appointment.status];
                const harm = job.harmDeadline ?? job.deadline;
                const tierReason = job.tier === undefined ? unknownReason(snapshot, "job", job.id, "tier") : undefined;
                return (
                  <tr key={job.id} className={job.appointment.status === "unverified" ? "bg-amber-50/40" : undefined}>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-900">{job.id}</td>
                    <td className="px-3 py-3 text-slate-700">{job.cargoDescription || "Not stated"}</td>
                    <td className="px-3 py-3 text-slate-700">{customer?.name ?? job.customerId}</td>
                    <td className="px-3 py-3 text-slate-700">{terminal?.name ?? job.terminalId}</td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-600">
                      {formatAppointmentWindow(job.appointment.window)}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      {job.tier === undefined ? (
                        <span className="text-xs text-slate-400">Tier unknown{tierReason ? ` · ${tierReason}` : ""}</span>
                      ) : (
                        <TierBadge tier={job.tier} stacked />
                      )}
                      <p className="mt-1 text-[11px] text-slate-500">
                        {job.criticalityBasis ? BASIS_LABEL[job.criticalityBasis] : "Basis unknown"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-slate-700">{formatSnapshotDateTime(harm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
