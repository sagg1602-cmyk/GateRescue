"use client";

import { useRef, useState, type FormEvent } from "react";
import { ApiRequestError, postDriverReport } from "@/lib/api/client";
import type { Driver, DriverAvailability } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import type { DriverReportRequest } from "@/lib/shared/api-contract";
import { setWallClockTime } from "@/lib/shared/datetime";
import { REPORTABLE_AVAILABILITIES, type ReportableAvailability } from "@/lib/shared/operational-types";
import { AVAILABILITY_LABEL } from "./DriverPanel";
import { useLiveBackend } from "./LiveBackendContext";
import { Button } from "./ui";

export interface CheckInInput {
  driverId: string;
  availability: DriverAvailability;
  availableFrom: string;
  note: string;
}

/** What the backend did with a live report. */
export interface CheckInOutcome {
  driverName: string;
  duplicate: boolean;
  planInvalidated: boolean;
}

type Mode = "local" | "live";

/** Pre-fill matching the scenario's D02 voice report (data/scenario/terminal-a-outage.v1.json). */
const D02_EXAMPLE_CALL = {
  driverId: "D02",
  availability: "available",
  availableFrom: "15:00",
  note: "At Terminal B staging area, reefer_40",
} as const satisfies CheckInInput;

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

const isReportable = (value: DriverAvailability): value is ReportableAvailability =>
  (REPORTABLE_AVAILABILITIES as readonly string[]).includes(value);

/**
 * Check-in form wired to the live backend when a session is active and the
 * snapshot has loaded; otherwise to the local demo reducer.
 */
export function DriverCheckIn({
  localDrivers,
  onLocalSubmit,
}: {
  localDrivers: Driver[];
  onLocalSubmit: (input: CheckInInput) => void;
}) {
  const live = useLiveBackend();
  // Same input after a failed send keeps its providerEventId, so the server can deduplicate the retry.
  const pending = useRef<{ key: string; providerEventId: string } | null>(null);
  const snapshot = live.status === "authenticated" ? live.snapshot : null;

  if (!snapshot) return <DriverCheckInForm key="local" drivers={localDrivers} onSubmit={onLocalSubmit} />;

  async function submitLive(input: CheckInInput): Promise<CheckInOutcome> {
    if (!snapshot?.now) {
      throw new Error("The backend's simulated clock is not set yet (run the scenario import), so the report can't be dated.");
    }
    if (!isReportable(input.availability)) throw new Error("Choose an availability other than Not reported.");

    const key = JSON.stringify(input);
    if (pending.current?.key !== key) pending.current = { key, providerEventId: crypto.randomUUID() };
    const body: DriverReportRequest = {
      driverId: input.driverId,
      availability: input.availability,
      availableFrom: setWallClockTime(snapshot.now, input.availableFrom),
      note: input.note,
      providerEventId: pending.current.providerEventId,
    };

    try {
      const res = await postDriverReport(body);
      pending.current = null;
      await live.refresh();
      return { driverName: res.driver.name, duplicate: res.duplicate, planInvalidated: res.planInvalidated };
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err;
      if (err.status === 401) {
        live.onSessionExpired();
        throw new Error("Session expired; the report was not recorded.");
      }
      if (err.code === "backend_not_configured") {
        live.onBackendUnavailable();
        throw new Error("Live backend unavailable; the report was not recorded.");
      }
      if (err.code === "network_error") {
        throw new Error("Could not reach the backend. Try again: a retry is recognised, so it can't be recorded twice.");
      }
      const details = err.fields
        ? Object.entries(err.fields).map(([field, messages]) => `${field}: ${messages.join(", ")}`)
        : [];
      throw new Error([err.message, ...details].join(" · "));
    }
  }

  return <DriverCheckInForm key="live" mode="live" drivers={snapshot.drivers} onSubmit={submitLive} />;
}

export function DriverCheckInForm({
  drivers,
  onSubmit,
  mode = "local",
}: {
  drivers: Driver[];
  /** Local submits return nothing; live submits resolve with the backend's outcome or reject with a message. */
  onSubmit: (input: CheckInInput) => void | Promise<CheckInOutcome>;
  mode?: Mode;
}) {
  const live = mode === "live";
  const initialAvailability = (driver: Driver | undefined): DriverAvailability => {
    const value = driver?.availability ?? "available";
    return live && !isReportable(value) ? "available" : value;
  };

  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const [availability, setAvailability] = useState<DriverAvailability>(() => initialAvailability(drivers[0]));
  const [availableFrom, setAvailableFrom] = useState(drivers[0]?.availableFrom ? formatTime(drivers[0].availableFrom) : "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CheckInOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availabilityOptions = Object.entries(AVAILABILITY_LABEL).filter(
    ([value]) => !live || isReportable(value as DriverAvailability),
  );
  const hasExampleDriver = drivers.some((d) => d.id === D02_EXAMPLE_CALL.driverId);

  function clearResult() {
    setOutcome(null);
    setError(null);
  }

  function selectDriver(id: string) {
    const driver = drivers.find((d) => d.id === id);
    setDriverId(id);
    clearResult();
    if (driver) {
      setAvailability(initialAvailability(driver));
      setAvailableFrom(driver.availableFrom ? formatTime(driver.availableFrom) : "");
    }
  }

  function fillExampleCall() {
    setDriverId(D02_EXAMPLE_CALL.driverId);
    setAvailability(D02_EXAMPLE_CALL.availability);
    setAvailableFrom(D02_EXAMPLE_CALL.availableFrom);
    setNote(D02_EXAMPLE_CALL.note);
    clearResult();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pending = onSubmit({ driverId, availability, availableFrom, note });
    if (!pending) {
      setNote("");
      return;
    }
    setSubmitting(true);
    clearResult();
    try {
      setOutcome(await pending);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be sent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="border-t border-slate-200 bg-slate-50/70 px-5 py-4" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Record driver check-in</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {live
              ? "Sent to the live backend as a dispatcher report (scenario drivers)."
              : "Dispatcher-entered. Invalidates pending recommendations."}
          </p>
        </div>
        {live && (
          <Button
            size="sm"
            onClick={fillExampleCall}
            disabled={!hasExampleDriver || submitting}
            title={hasExampleDriver ? undefined : "Driver D02 is not in the backend roster"}
          >
            Fill D02 example call
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-xs font-medium text-slate-600">
        A report updates availability only. It never approves or dispatches anything.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs text-slate-600">
          Driver
          <select className={`${inputClass} mt-1`} value={driverId} onChange={(e) => selectDriver(e.target.value)}>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {live ? `${d.name} (${d.id})` : d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Availability
          <select
            className={`${inputClass} mt-1`}
            value={availability}
            onChange={(e) => setAvailability(e.target.value as DriverAvailability)}
          >
            {availabilityOptions.map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          Free from
          <input
            type="time"
            required
            className={`${inputClass} mt-1`}
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </label>
        <label className="col-span-2 text-xs text-slate-600">
          Note (optional)
          <input
            className={`${inputClass} mt-1`}
            value={note}
            maxLength={120}
            placeholder="e.g. Back at yard with 40′ chassis"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <Button type="submit" variant="primary" className="mt-3 w-full" disabled={submitting}>
        {submitting ? "Sending…" : live ? "Send report" : "Save check-in"}
      </Button>

      {outcome && (
        <div role="status" className="mt-3 space-y-1 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
          {outcome.duplicate ? (
            <p>
              <span className="font-semibold">Duplicate ignored.</span> This report was already recorded, so nothing
              changed.
            </p>
          ) : (
            <p>
              <span className="font-semibold">Report recorded</span> for {outcome.driverName}. The live queue has been
              refreshed.
            </p>
          )}
          {outcome.planInvalidated && (
            <p className="text-amber-900">
              <span className="font-semibold">Plan invalidated.</span> The stored recovery plan is out of date and
              needs regenerating.
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
    </form>
  );
}
