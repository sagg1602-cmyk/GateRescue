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
  "min-h-11 w-full rounded-md border border-[#8a877e] bg-white px-3 py-2 text-sm text-navy placeholder:text-ink-muted focus:border-ready focus:outline-none focus:ring-2 focus:ring-ready/30";

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
      setError(null);
      setOutcome({
        driverName: drivers.find((d) => d.id === driverId)?.name ?? driverId,
        duplicate: false,
        planInvalidated: false,
      });
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
    <form
      id="driver-report"
      aria-labelledby="driver-report-title"
      className="border-b border-line bg-paper px-6 py-5"
      onSubmit={handleSubmit}
    >
      <p className="eyebrow text-rust">{live ? "Phone call or check-in" : "Check-in"}</p>
      <h3 id="driver-report-title" className="mt-1 font-display text-lg font-semibold leading-tight text-navy">
        Record driver report
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        {live
          ? "Sent to the live backend as a dispatcher report (scenario drivers)."
          : "Dispatcher-entered. Invalidates pending recommendations."}
      </p>
      {live && (
        <Button
          size="sm"
          className="mt-3"
          onClick={fillExampleCall}
          disabled={!hasExampleDriver || submitting}
          title={hasExampleDriver ? undefined : "Driver D02 is not in the backend roster"}
        >
          Fill D02 example call
        </Button>
      )}
      <p className="mt-3 text-xs font-semibold text-navy">
        A report updates availability only. It never approves or dispatches anything.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
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
      <Button type="submit" variant="primary" className="mt-4 w-full" disabled={submitting} aria-busy={submitting}>
        {submitting ? "Sending…" : live ? "Send report" : "Save check-in"}
      </Button>

      <div aria-live="polite">
        {outcome && (
          <div className="mt-3 flex gap-2.5 rounded-md border border-ready/40 bg-ready-soft px-3 py-2.5 text-xs text-ready">
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ready text-[11px] font-bold text-white"
              aria-hidden
            >
              ✓
            </span>
            <div className="space-y-1">
              {outcome.duplicate ? (
                <p>
                  <span className="font-semibold">Duplicate ignored.</span> This report was already recorded, so nothing
                  changed.
                </p>
              ) : live ? (
                <p>
                  <span className="font-semibold">Report recorded for {outcome.driverName}.</span> The live queue has been
                  refreshed; any entry whose status changed is highlighted.
                </p>
              ) : (
                <p>
                  <span className="font-semibold">Check-in saved for {outcome.driverName}.</span> It is in the activity
                  log. Any pending recommendations are now out of date; regenerate the plan to use it.
                </p>
              )}
              {outcome.planInvalidated && (
                <p className="text-awaiting">
                  <span className="font-semibold">Plan invalidated.</span> The stored recovery plan is out of date and
                  needs regenerating.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md border border-blocked/30 bg-blocked-soft px-3 py-2 text-xs text-blocked">
          {error}
        </p>
      )}
    </form>
  );
}
