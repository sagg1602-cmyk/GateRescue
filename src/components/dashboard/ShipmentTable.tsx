import type { AppointmentStatus, Customer, Driver, Job, Priority, Terminal } from "@/lib/demo/frontend-types";
import { getJobExtras, isConsequenceStated } from "@/lib/demo/job-extras";
import { getJobStatus, isUrgent, type Tone } from "@/lib/demo/job-status";
import { formatTime, formatWindow } from "@/lib/demo/time";
import { HarmSoonBadge, TierBadge } from "./JobBadges";
import { Badge, Button, Panel } from "./ui";

const PRIORITY_TONE: Record<Priority, Tone> = { critical: "red", high: "amber", normal: "neutral" };

const APPOINTMENT_BADGE: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  confirmed: { label: "Confirmed", tone: "teal" },
  unverified: { label: "Unverified", tone: "amber" },
  none: { label: "Not booked", tone: "red" },
  lost: { label: "Lost", tone: "red" },
};

export function ShipmentTable({
  jobs,
  customers,
  terminals,
  drivers,
  now,
  onReconfirm,
  onMarkLost,
}: {
  jobs: Job[];
  customers: Customer[];
  terminals: Terminal[];
  drivers: Driver[];
  now: string;
  onReconfirm: (jobId: string) => void;
  onMarkLost: (jobId: string) => void;
}) {
  const reconcilingCount = jobs.filter(
    (j) =>
      j.appointment.status === "unverified" &&
      terminals.find((t) => t.id === j.terminalId)?.portalStatus === "reconciling",
  ).length;

  return (
    <Panel
      title="Shipments"
      subtitle={
        reconcilingCount > 0
          ? `Reconciliation mode: ${reconcilingCount} appointments need explicit dispatcher reconfirmation.`
          : `${jobs.length} synthetic container moves across both terminals`
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">Container</th>
              <th className="px-3 py-2.5 font-medium">Customer · terminal</th>
              <th className="px-3 py-2.5 font-medium">Priority</th>
              <th className="px-3 py-2.5 font-medium">Tier</th>
              <th className="px-3 py-2.5 font-medium">Deadline</th>
              <th className="px-3 py-2.5 font-medium">Appointment</th>
              <th className="px-3 py-2.5 font-medium">Blocker</th>
              <th className="px-3 py-2.5 font-medium">Next action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.map((job) => {
              const terminal = terminals.find((t) => t.id === job.terminalId);
              const status = getJobStatus(job, terminal, drivers);
              const extras = getJobExtras(job);
              const appt = job.appointment;
              const badge = APPOINTMENT_BADGE[appt.status];
              const canReconcile = appt.status === "unverified" && terminal?.portalStatus === "reconciling";
              const pre = appt.preOutage;
              return (
                <tr key={job.id} className={appt.status === "unverified" ? "bg-amber-50/40" : undefined}>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs text-slate-900">{job.container}</span>
                    <p
                      className={`mt-0.5 min-w-36 max-w-52 text-[11px] leading-snug ${
                        isConsequenceStated(extras.consequence) ? "text-slate-600" : "italic text-slate-400"
                      }`}
                    >
                      {extras.consequence}
                    </p>
                    {job.approval && (
                      <span className="mt-1 block">
                        <Badge tone="teal">Approved (sim)</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {customers.find((c) => c.id === job.customerId)?.name}
                    <p className="mt-0.5 text-xs text-slate-500">{terminal?.shortName}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={PRIORITY_TONE[job.priority]}>{job.priority}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <TierBadge tier={extras.tier} stacked />
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    <span className={isUrgent(job, now) ? "font-semibold text-red-700" : "text-slate-700"}>
                      {formatTime(job.deadline)}
                    </span>
                    {extras.harmDeadline !== job.deadline && (
                      <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">
                        Harm by {formatTime(extras.harmDeadline)}
                      </p>
                    )}
                    <HarmSoonBadge job={job} now={now} className="mt-1 block" />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                      <span className="tabular-nums text-xs text-slate-600">{formatWindow(appt.window)}</span>
                    </div>
                    {pre && appt.status !== "confirmed" && (
                      <p className="mt-1 text-xs text-slate-400">
                        Pre-outage: {pre.status} {formatWindow(pre.window)}
                      </p>
                    )}
                    {pre && appt.status === "confirmed" && (
                      <p className="mt-1 text-xs text-teal-700">Reconfirmed by dispatcher</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {status.blocker ? (
                      <Badge tone={status.blocker.tone}>{status.blocker.label}</Badge>
                    ) : (
                      <span className="text-xs text-slate-400">None</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-700">
                    {status.nextAction}
                    {canReconcile && (
                      <div className="mt-2 flex gap-1.5">
                        <Button size="sm" variant="primary" onClick={() => onReconfirm(job.id)}>
                          Reconfirm {formatTime(appt.window?.start ?? job.deadline)}
                        </Button>
                        <Button size="sm" onClick={() => onMarkLost(job.id)}>
                          Mark lost
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
