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
import { liveNextStep, localNextStep, NextStepBanner } from "./NextStep";
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

  const readyForApproval =
    state.plan?.recommendations.filter((r) => r.category === "ready" && !r.approved).length ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
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

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10 lg:py-8">
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
            <DashboardHeader badges={<SyntheticBadge />} />

            {outageTerminal?.portalStatus === "outage" && (
              <div role="alert" className="mb-5 rounded-card border border-blocked/30 bg-blocked-soft px-6 py-4 text-sm text-blocked">
                <span className="font-semibold">{outageTerminal.shortName} appointment portal outage (simulated).</span>{" "}
                {unverified} appointments are unverified. Previous values are preserved for reconciliation.
              </div>
            )}
            {outageTerminal?.portalStatus === "reconciling" && (
              <div role="status" className="mb-5 rounded-card border border-awaiting/30 bg-awaiting-soft px-6 py-4 text-sm text-awaiting">
                <span className="font-semibold">{outageTerminal.shortName} access restored — reconciliation mode.</span>{" "}
                {unverified} appointments are still unverified. Nothing is confirmed automatically; reconfirm or mark each
                one lost in the shipments table.
              </div>
            )}

            <NextStepBanner step={localNextStep({ outageTerminal, plan: state.plan, jobs: state.jobs, customers: CUSTOMERS })} />

            <SummaryCards
              readyForApproval={readyForApproval}
              planInvalidated={state.plan?.status === "invalidated"}
              totalJobs={state.jobs.length}
              affectedJobs={affectedJobs}
              availableDrivers={state.drivers.filter((d) => d.availability === "available").length}
              totalDrivers={state.drivers.length}
              urgentJobs={state.jobs.filter((j) => isUrgent(j, state.now)).length}
            />

            <div className="mt-6">
              <AccessGate>
                <BackendQueuePanel />
              </AccessGate>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 flex min-w-0 flex-col gap-6">
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
              <div className="lg:col-span-4 flex min-w-0 flex-col gap-6">
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
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      <LiveSidebar snapshot={snapshot} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-10 lg:py-8">
        <DashboardHeader
          badges={
            <>
              <LiveDataBadge />
              <SyntheticBadge />
            </>
          }
          meta={
            <>
              {snapshot?.now ? (
                <>
                  Simulated clock <span className="font-mono">{formatTime(snapshot.now)}</span> ·{" "}
                  {formatSnapshotDate(snapshot.now)}
                </>
              ) : (
                "Simulated clock not set"
              )}
              {snapshot?.scenario && (
                <>
                  {" "}
                  · Scenario <span className="font-mono">{snapshot.scenario.id}</span> v{snapshot.scenario.version}
                </>
              )}
            </>
          }
        />

        {snapshot && <LivePortalAlerts snapshot={snapshot} />}

        <NextStepBanner step={liveNextStep(snapshot)} />
        <LiveSummaryCards snapshot={snapshot} />

        <div className="my-6">
          <BackendQueuePanel />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 min-w-0">
            <LiveShipmentTable snapshot={snapshot} />
          </div>
          <div className="lg:col-span-4 flex min-w-0 flex-col gap-6">
            <LiveDriverPanel snapshot={snapshot}>{checkIn}</LiveDriverPanel>
            {snapshot && <ActivityLog events={snapshot.events} />}
          </div>
        </div>
      </main>
    </div>
  );
}

function DashboardHeader({ badges, meta }: { badges: ReactNode; meta?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-rust">Port drayage recovery</p>
        <h1 className="mt-2 font-display text-4xl font-semibold leading-none md:text-5xl tracking-tight text-navy">
          Dispatcher dashboard
        </h1>
        <p className="mt-2 text-sm text-ink-muted">Fictional terminals, customers and drivers</p>
        {meta && <p className="mt-1 text-sm text-ink-muted">{meta}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{badges}</div>
    </header>
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
