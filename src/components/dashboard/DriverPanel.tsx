import type { Driver, DriverAvailability } from "@/lib/demo/frontend-types";
import type { Tone } from "@/lib/demo/job-status";
import { EQUIPMENT_LABELS } from "@/lib/demo/synthetic-data";
import { formatTime, toMinutes } from "@/lib/demo/time";
import { Badge, Panel } from "./ui";

export const AVAILABILITY_LABEL: Record<DriverAvailability, { label: string; tone: Tone }> = {
  available: { label: "Available", tone: "teal" },
  "on-job": { label: "On job", tone: "neutral" },
  "off-duty": { label: "Off duty", tone: "neutral" },
  unreachable: { label: "Unreachable", tone: "red" },
  "not-reported": { label: "Not reported", tone: "amber" },
};

/** Check-ins older than this are flagged as stale. */
const STALE_REPORT_MINUTES = 60;

export function DriverPanel({ drivers, now, children }: { drivers: Driver[]; now: string; children?: React.ReactNode }) {
  return (
    <Panel eyebrow="Synthetic roster" title="Drivers" subtitle="Status from the most recent check-in">
      {children}
      <ul className="divide-y divide-line">
        {drivers.map((driver) => {
          const availability = AVAILABILITY_LABEL[driver.availability];
          const age = driver.lastReport ? toMinutes(now) - toMinutes(driver.lastReport) : null;
          const stale = age === null || age > STALE_REPORT_MINUTES;
          const commitments = driver.busy.filter((slot) => slot.jobId);
          return (
            <li key={driver.id} className="px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-navy">{driver.name}</p>
                <Badge tone={availability.tone}>{availability.label}</Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {driver.equipment.map((eq) => (
                  <span key={eq} className="rounded bg-paper-deep px-1.5 py-0.5 text-[11px] text-slate-600">
                    {EQUIPMENT_LABELS[eq]}
                  </span>
                ))}
              </div>
              <p className={`mt-1.5 text-xs ${stale ? "font-medium text-awaiting" : "text-ink-muted"}`}>
                {driver.lastReport ? (
                  <>
                    Last report <span className="font-mono">{formatTime(driver.lastReport)}</span> · {age} min ago
                  </>
                ) : (
                  "No report yet"
                )}
                {driver.lastReport && stale ? " · stale" : ""}
                {driver.availability !== "unreachable" && driver.availableFrom && (
                  <>
                    {" "}
                    · free from <span className="font-mono">{formatTime(driver.availableFrom)}</span>
                  </>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs italic text-ink-muted" title={driver.lastNote}>
                “{driver.lastNote}”
              </p>
              {commitments.length > 0 && (
                <p className="mt-1 text-xs text-ready">
                  Approved (sim): {commitments.map((c) => `${c.label} ${formatTime(c.start)}`).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
