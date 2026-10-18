"use client";

import { useReducer, useState, type ReactNode } from "react";
import { createInitialDemoState, demoReducer, OUTAGE_TERMINAL_ID } from "@/lib/demo/demo-state";
import { isOutageAffected, isUrgent } from "@/lib/demo/job-status";
import type { Job, RecoveryPlan, Terminal } from "@/lib/demo/frontend-types";
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
import { HeroStrip } from "./HeroStrip";
import { liveNextStep, localNextStep } from "./NextStep";
import { StatusTicker } from "./StatusTicker";
import { ReconciliationView } from "./ReconciliationView";
import { RecoveryPanel } from "./RecoveryPanel";
import { ShipmentTable } from "./ShipmentTable";
import { Sidebar } from "./Sidebar";
import { formatSnapshotDate, humanizeCode, RECOVERY_STATUS_LABEL } from "./snapshot-display";
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
            <HeroStrip
              step={localNextStep({ outageTerminal, plan: state.plan, jobs: state.jobs, customers: CUSTOMERS })}
              scenarioLabel={outageTerminal?.portalStatus === "online" && !state.plan ? "LOCAL-DEMO IDLE" : "TERMINAL-A-OUTAGE LOCAL"}
              clockLabel={formatTime(state.now)}
              badges={<SyntheticBadge />}
            />
            <Rise index={1}>
              <SummaryCards
                readyForApproval={readyForApproval}
                planInvalidated={state.plan?.status === "invalidated"}
                totalJobs={state.jobs.length}
                affectedJobs={affectedJobs}
                availableDrivers={state.drivers.filter((d) => d.availability === "available").length}
                totalDrivers={state.drivers.length}
                urgentJobs={state.jobs.filter((j) => isUrgent(j, state.now)).length}
              />
              <StatusTicker items={localTickerItems(state.terminals, state.jobs, state.plan)} />
            </Rise>

            {outageTerminal?.portalStatus === "outage" && (
              <div role="alert" className="mt-6 rounded-card border border-blocked/30 bg-blocked-soft px-6 py-4 text-sm text-blocked">
                <span className="font-semibold">{outageTerminal.shortName} appointment portal outage (simulated).</span>{" "}
                {unverified} appointments are unverified. Previous values are preserved for reconciliation.
              </div>
            )}
            {outageTerminal?.portalStatus === "reconciling" && (
              <div role="status" className="mt-6 rounded-card border border-awaiting/30 bg-awaiting-soft px-6 py-4 text-sm text-awaiting">
                <span className="font-semibold">{outageTerminal.shortName} access restored — reconciliation mode.</span>{" "}
                {unverified} appointments are still unverified. Nothing is confirmed automatically; reconfirm or mark each
                one lost in the shipments table.
              </div>
            )}

            <Rise index={2} className="mt-6">
              <AccessGate>
                <BackendQueuePanel />
              </AccessGate>
            </Rise>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Rise index={3} className="lg:col-span-8 flex min-w-0 flex-col gap-6">
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
              </Rise>
              <Rise index={4} className="lg:col-span-4 flex min-w-0 flex-col gap-6">
                <DriverPanel drivers={state.drivers} now={state.now}>
                  <DriverCheckIn
                    key={resetCount}
                    localDrivers={state.drivers}
                    onLocalSubmit={(input) => dispatch({ type: "driver-check-in", ...input })}
                  />
                </DriverPanel>
                <ActivityLog events={state.events} />
              </Rise>
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
        <HeroStrip
          step={liveNextStep(snapshot)}
          scenarioLabel={
            snapshot?.scenario ? `${snapshot.scenario.id} V${snapshot.scenario.version}` : "LOADING"
          }
          clockLabel={snapshot?.now ? `${formatTime(snapshot.now)} · ${formatSnapshotDate(snapshot.now)}` : "NOT SET"}
          badges={
            <>
              <LiveDataBadge />
              <SyntheticBadge />
            </>
          }
        />
        <Rise index={1}>
          <LiveSummaryCards snapshot={snapshot} />
          <StatusTicker items={liveTickerItems(snapshot)} />
        </Rise>

        {snapshot && (
          <div className="mt-6">
            <LivePortalAlerts snapshot={snapshot} />
          </div>
        )}

        <Rise index={2} className="my-6">
          <BackendQueuePanel />
        </Rise>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Rise index={3} className="lg:col-span-8 min-w-0">
            <LiveShipmentTable snapshot={snapshot} />
          </Rise>
          <Rise index={4} className="lg:col-span-4 flex min-w-0 flex-col gap-6">
            <LiveDriverPanel snapshot={snapshot}>{checkIn}</LiveDriverPanel>
            {snapshot && <ActivityLog events={snapshot.events} />}
          </Rise>
        </div>
      </main>
    </div>
  );
}

/** Stagger-fades a section up 12px on load (50ms apart). Reduced motion disables it in globals.css. */
function Rise({ index, className = "", children }: { index: number; className?: string; children: ReactNode }) {
  return (
    <div className={`rise-in ${className}`} style={{ animationDelay: `${index * 50}ms` }}>
      {children}
    </div>
  );
}

const PORTAL_TEXT: Record<Terminal["portalStatus"], string> = {
  online: "portal online",
  outage: "portal outage",
  reconciling: "reconciling",
};

/** Ticker lines from the local reducer state: terminals, then plan recommendations by category. */
function localTickerItems(terminals: Terminal[], jobs: Job[], plan: RecoveryPlan | null): string[] {
  const items = terminals.map((t) => `${t.shortName} - ${PORTAL_TEXT[t.portalStatus]}`);
  if (plan) {
    for (const rec of plan.recommendations) {
      const job = jobs.find((j) => j.id === rec.jobId);
      const label = rec.approved ? "approved" : rec.category === "ready" ? "ready for approval" : rec.category;
      items.push(`${job?.container ?? rec.jobId} - ${label.replace(/-/g, " ")}`);
    }
  } else {
    const unverified = jobs.filter((j) => j.appointment.status === "unverified").length;
    items.push(unverified ? `${unverified} appointments unverified` : `${jobs.length} appointments confirmed`);
  }
  return items;
}

/** Ticker lines from the backend snapshot: terminals, then ranked queue entries. */
function liveTickerItems(snapshot: StateResponse | null): string[] {
  if (!snapshot) return [];
  const items = snapshot.terminals.map((t) => `${t.shortName} - ${PORTAL_TEXT[t.portalStatus]}`);
  const entries = [...(snapshot.recoveryQueue?.entries ?? [])].sort((a, b) => a.rank - b.rank);
  for (const e of entries) {
    items.push(`${e.jobId} - ${RECOVERY_STATUS_LABEL[e.status]}${e.blocker ? ` (${humanizeCode(e.blocker)})` : ""}`);
  }
  return items;
}

/** The reducer returns the terminal to online once reconciliation completes; pre-outage snapshots remain until reset. */
function continuityPhase(terminal: Terminal | undefined, jobs: Job[]): ContinuityPhase {
  const hadOutage = jobs.some((j) => j.appointment.preOutage !== null);
  const unverified = jobs.some((j) => j.terminalId === terminal?.id && j.appointment.status === "unverified");
  if (terminal?.portalStatus === "outage") return "degraded";
  if (terminal?.portalStatus === "reconciling") return unverified ? "reconcile" : "restored";
  return hadOutage ? "restored" : "normal";
}
