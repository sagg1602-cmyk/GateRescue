"use client";

import { useReducer, useState } from "react";
import { createInitialDemoState, demoReducer, OUTAGE_TERMINAL_ID } from "@/lib/demo/demo-state";
import { isOutageAffected, isUrgent } from "@/lib/demo/job-status";
import { CUSTOMERS } from "@/lib/demo/synthetic-data";
import { ActivityLog } from "./ActivityLog";
import { DriverCheckInForm } from "./DriverCheckInForm";
import { DriverPanel } from "./DriverPanel";
import { ReconciliationView } from "./ReconciliationView";
import { RecoveryPanel } from "./RecoveryPanel";
import { ShipmentTable } from "./ShipmentTable";
import { Sidebar } from "./Sidebar";
import { SummaryCards } from "./SummaryCards";
import { SyntheticBadge } from "./ui";

/**
 * Dispatcher dashboard backed entirely by local synthetic state. To connect a
 * backend later, replace `demoReducer` dispatches with data-layer calls and
 * keep the presentational components unchanged.
 */
export function DispatcherDashboard() {
  const [state, dispatch] = useReducer(demoReducer, undefined, createInitialDemoState);
  // Remounts the check-in form so a reset also clears its local fields.
  const [resetCount, setResetCount] = useState(0);
  const [showReconciliation, setShowReconciliation] = useState(false);

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
                  <DriverCheckInForm
                    key={resetCount}
                    drivers={state.drivers}
                    onSubmit={(input) => dispatch({ type: "driver-check-in", ...input })}
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
