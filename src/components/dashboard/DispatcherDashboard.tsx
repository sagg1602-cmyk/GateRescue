"use client";

import { useReducer, useState, type ReactNode } from "react";
import { createInitialDemoState, demoReducer, OUTAGE_TERMINAL_ID } from "@/lib/demo/demo-state";
import { isOutageAffected, isUrgent } from "@/lib/demo/job-status";
import type { Job, Terminal } from "@/lib/demo/frontend-types";
import { CUSTOMERS } from "@/lib/demo/synthetic-data";
import { formatTime } from "@/lib/demo/time";
import type { StateResponse } from "@/lib/shared/api-contract";
import { AccessGate } from "./AccessGate";
import { ActivityLog } from "./ActivityLog";
import { BackendQueuePanel } from "./BackendQueuePanel";
import { ContinuityStrip, type ContinuityPhase } from "./ContinuityStrip";
import { DriverCheckIn } from "./DriverCheckInForm";
import { DriverPanel } from "./DriverPanel";
import { LiveDataBadge } from "./LiveDataBadge";
import { LiveDriverPanel } from "./LiveDriverPanel";
import { LivePortalAlerts, LiveSidebar } from "./LiveSidebar";
import { LiveShipmentTable } from "./LiveShipmentTable";
import { LiveSummaryCards } from "./LiveSummaryCards";
import { ReconciliationView } from "./ReconciliationView";
import { RecoveryPanel } from "./RecoveryPanel";
import { ShipmentTable } from "./ShipmentTable";
import { Sidebar } from "./Sidebar";
import { formatSnapshotDate } from "./snapshot-display";
import { SummaryCards } from "./SummaryCards";
import { SyntheticBadge } from "./ui";
import { useLiveBackend } from "./LiveBackendContext";

/**
 * Dispatcher dashboard. A live session shows the GET /api/state snapshot.
 * Without one, the local synthetic reducer is unchanged.
 */
export function DispatcherDashboard() {
  const live = useLiveBackend();
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);
  // Remounts the check-in form so a reset also clears its local fields.
  const [resetCount, setResetCount] = useState(0);
  const [showReconciliation, setShowReconciliation] = useState(false);

  if (live.status === "authenticated") {
    return (
      <ConnectedDashboard
        snapshot={live.snapshot}
        checkIn={
          live.snapshot ? (
            <DriverCheckIn
              localDrivers={state.drivers}
              onLocalSubmit={(input) => dispatch({ type: "driver-check-in", ...input })}
            />
          ) : null
        }
      />
    );
  }

  const outageTerminal = state.terminals.find((t) => t.id === OUTAGE_TERMINAL_ID);
  const affectedJobs = state.jobs.filter(isOutageAffected).length;
  const unverified = state.jobs.filter((j) => j.appointment.status === "unverified").length;

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        now={state.now}
        terminals={state.terminals}
        outageTerminalId={OUTAGE_TERMINAL_ID}
        onSimulateOutage={() => dispatch({ type: "simulate-outage" })}
        onRestoreAccess={() => dispatch({ type: "restore-access" })}
        onOpenReconciliation={() => setShowReconciliation(true)}
        reconciliationOpen={showReconciliation}
        onReset={() => {
          dispatch({ type: "reset" });
          setResetCount((n) => n + 1);
        }}
      />

      <main className="min-w-0 flex-1 px-8 py-6">
        <ContinuityStrip phase={continuityPhase(outageTerminal, state.jobs)} />
        {showReconciliation ? (
          <ReconciliationView
            terminals={state.terminals}
            jobs={state.jobs}
            drivers={state.drivers}
            customers={CUSTOMERS}
            events={state.events}
            onBack={() => setShowReconciliation(false)}
          />
        ) : (
          <>
            <header className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dispatcher dashboard</h1>
                <p className="text-sm text-slate-500">Port drayage recovery — fictional terminals, customers and drivers</p>
              </div>
              <SyntheticBadge />
            </header>

            {outageTerminal?.portalStatus === "outage" && (
              <div role="alert" className="mb-5 rounded-xl border border-red-300 bg-red-50 px-5 py-3 text-sm text-red-800">
                <span className="font-semibold">{outageTerminal.shortName} appointment portal outage (simulated).</span>{" "}
                {unverified} appointments are unverified. Previous values are preserved for reconciliation.
              </div>
            )}
            {outageTerminal?.portalStatus === "reconciling" && (
              <div role="status" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
                <span className="font-semibold">{outageTerminal.shortName} access restored — reconciliation mode.</span>{" "}
                {unverified} appointments are still unverified. Nothing is confirmed automatically; reconfirm or mark each
                one lost in the shipments table.
              </div>
            )}

            <AccessGate>
              <BackendQueuePanel />
            </AccessGate>

            <SummaryCards
              totalJobs={state.jobs.length}
              affectedJobs={affectedJobs}
              availableDrivers={state.drivers.filter((d) => d.availability === "available").length}
              totalDrivers={state.drivers.length}
              urgentJobs={state.jobs.filter((j) => isUrgent(j, state.now)).length}
            />

            <div className="mt-5 grid grid-cols-12 gap-5">
              <div className="col-span-8 flex min-w-0 flex-col gap-5">
                <RecoveryPanel
                  plan={state.plan}
                  jobs={state.jobs}
                  drivers={state.drivers}
                  customers={CUSTOMERS}
                  inputsVersion={state.inputsVersion}
                  now={state.now}
                  onGenerate={() => dispatch({ type: "generate-plan" })}
                  onApprove={(jobId) => dispatch({ type: "approve-assignment", jobId })}
                />
                <ShipmentTable
                  jobs={state.jobs}
                  customers={CUSTOMERS}
                  terminals={state.terminals}
                  drivers={state.drivers}
                  now={state.now}
                  onReconfirm={(jobId) => dispatch({ type: "reconfirm-appointment", jobId })}
                  onMarkLost={(jobId) => dispatch({ type: "mark-appointment-lost", jobId })}
                />
              </div>
              <div className="col-span-4 flex min-w-0 flex-col gap-5">
                <DriverPanel drivers={state.drivers} now={state.now}>
                  <DriverCheckIn
                    key={resetCount}
                    localDrivers={state.drivers}
                    onLocalSubmit={(input) => dispatch({ type: "driver-check-in", ...input })}
                  />
                </DriverPanel>
                <ActivityLog events={state.events} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ConnectedDashboard({ snapshot, checkIn }: { snapshot: StateResponse | null; checkIn: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <LiveSidebar snapshot={snapshot} />
      <main className="min-w-0 flex-1 px-8 py-6">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dispatcher dashboard</h1>
            <p className="text-sm text-slate-500">Port drayage recovery — fictional terminals, customers and drivers</p>
            <p className="mt-1 text-sm text-slate-600">
              {snapshot?.now
                ? `Simulated clock ${formatTime(snapshot.now)} · ${formatSnapshotDate(snapshot.now)}`
                : "Simulated clock not set"}
              {snapshot?.scenario && ` · Scenario ${snapshot.scenario.id} v${snapshot.scenario.version}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LiveDataBadge />
            <SyntheticBadge />
          </div>
        </header>

        {snapshot && <LivePortalAlerts snapshot={snapshot} />}

        <BackendQueuePanel />
        <LiveSummaryCards snapshot={snapshot} />

        <div className="mt-5 grid grid-cols-12 gap-5">
          <div className="col-span-8 min-w-0">
            <LiveShipmentTable snapshot={snapshot} />
          </div>
          <div className="col-span-4 flex min-w-0 flex-col gap-5">
            <LiveDriverPanel snapshot={snapshot}>{checkIn}</LiveDriverPanel>
            {snapshot && <ActivityLog events={snapshot.events} />}
          </div>
        </div>
      </main>
    </div>
  );
}

/** The reducer returns the terminal to online once reconciliation completes; pre-outage snapshots remain until reset. */
function continuityPhase(terminal: Terminal | undefined, jobs: Job[]): ContinuityPhase {
  const hadOutage = jobs.some((j) => j.appointment.preOutage !== null);
  const unverified = jobs.some((j) => j.terminalId === terminal?.id && j.appointment.status === "unverified");
  if (terminal?.portalStatus === "outage") return "degraded";
  if (terminal?.portalStatus === "reconciling") return unverified ? "reconcile" : "restored";
  return hadOutage ? "restored" : "normal";
}
