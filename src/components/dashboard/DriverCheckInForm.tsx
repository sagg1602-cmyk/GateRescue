"use client";

import { useState } from "react";
import type { Driver, DriverAvailability } from "@/lib/demo/frontend-types";
import { formatTime } from "@/lib/demo/time";
import { AVAILABILITY_LABEL } from "./DriverPanel";
import { Button } from "./ui";

export interface CheckInInput {
  driverId: string;
  availability: DriverAvailability;
  availableFrom: string;
  note: string;
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

export function DriverCheckInForm({ drivers, onSubmit }: { drivers: Driver[]; onSubmit: (input: CheckInInput) => void }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const [availability, setAvailability] = useState<DriverAvailability>(drivers[0]?.availability ?? "available");
  const [availableFrom, setAvailableFrom] = useState(drivers[0]?.availableFrom ? formatTime(drivers[0].availableFrom) : "");
  const [note, setNote] = useState("");

  function selectDriver(id: string) {
    const driver = drivers.find((d) => d.id === id);
    setDriverId(id);
    if (driver) {
      setAvailability(driver.availability);
      setAvailableFrom(driver.availableFrom ? formatTime(driver.availableFrom) : "");
    }
  }

  return (
    <form
      className="border-t border-slate-200 bg-slate-50/70 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ driverId, availability, availableFrom, note });
        setNote("");
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Record driver check-in</p>
      <p className="mt-0.5 text-xs text-slate-500">Dispatcher-entered. Invalidates pending recommendations.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="col-span-2 text-xs text-slate-600">
          Driver
          <select className={`${inputClass} mt-1`} value={driverId} onChange={(e) => selectDriver(e.target.value)}>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
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
            {Object.entries(AVAILABILITY_LABEL).map(([value, { label }]) => (
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
      <Button type="submit" variant="primary" className="mt-3 w-full">
        Save check-in
      </Button>
    </form>
  );
}
