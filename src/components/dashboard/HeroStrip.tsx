"use client";

import type { ReactNode } from "react";
import { GateSketch } from "./GateSketch";
import type { Step } from "./NextStep";

/**
 * Blueprint-style hero at the top of the main column: hairline-divided cells
 * with mono corner labels, an oversized uppercase headline, the next step as
 * the single primary pill, and the gate drawing. Display only: the pill jumps
 * to existing controls. The boom lifts once a job is ready for approval.
 */
export function HeroStrip({
  step,
  scenarioLabel,
  clockLabel,
  badges,
}: {
  step: Step;
  scenarioLabel: string;
  clockLabel: string;
  badges: ReactNode;
}) {
  const ready = step.tone === "ready";
  const pillTone = ready
    ? "bg-ready text-white hover:bg-[#1a5f6d]"
    : step.tone === "attention"
      ? "bg-rust text-white hover:bg-[#9c3d19]"
      : "bg-navy text-white hover:bg-navy-soft";

  return (
    <section aria-labelledby="hero-title" className="rise-in border border-line bg-paper">
      {/* corner-label rail */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted md:px-6">
        <span className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Scenario <span className="text-navy">{scenarioLabel}</span>
          </span>
          <span>
            Sim clock <span className="text-navy">{clockLabel}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">{badges}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* headline + next step cell */}
        <div className="flex flex-col justify-between gap-8 px-4 py-8 md:px-6 md:py-10 lg:col-span-7 lg:border-r lg:border-line">
          <div>
            <p className="eyebrow text-rust">Port drayage recovery</p>
            <h1
              id="hero-title"
              className="mt-4 max-w-[17ch] font-display text-5xl font-semibold uppercase leading-[0.9] tracking-[-0.02em] text-navy md:text-6xl xl:text-7xl"
            >
              When the gate goes down, keep freight moving.
            </h1>
          </div>

          <div className={`border-t border-line pt-6 ${ready ? "[--focus-ring:var(--color-navy)]" : ""}`}>
            <p className="eyebrow text-ink-muted">Next step</p>
            <div className="mt-3 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              {step.action ? (
                <a
                  href={step.action.href}
                  className={`inline-flex min-h-12 items-center justify-center px-7 text-sm font-semibold transition-[transform,background-color] hover:-translate-y-0.5 ${pillTone}`}
                >
                  {step.title}
                </a>
              ) : (
                <span className="inline-flex min-h-12 items-center border border-line px-7 text-sm font-semibold text-navy">
                  {step.title}
                </span>
              )}
              {step.subject && (
                <p className="font-mono text-xs tracking-tight text-ink-muted md:text-sm">
                  <span className="font-semibold text-navy">{step.subject.id}</span>
                  {step.subject.label && <span> · {step.subject.label}</span>}
                </p>
              )}
            </div>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">{step.detail}</p>
            {step.action && step.action.href !== "#driver-report" && (
              <a
                href="#driver-report"
                className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-ink-muted underline underline-offset-4 hover:text-navy"
              >
                Record a driver report instead
              </a>
            )}
          </div>
        </div>

        {/* drawing cell */}
        <div className="relative flex flex-col border-t border-line px-4 pb-8 pt-10 md:px-6 lg:col-span-5 lg:border-t-0">
          <span className="pointer-events-none absolute left-4 top-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted md:left-6">
            Fig. 1 · Gate {ready ? "open" : "closed"}
          </span>
          <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted md:right-6">
            Synthetic · not to scale
          </span>
          <div className="flex flex-1 items-center">
            <GateSketch open={ready} className="mx-auto w-full max-w-[560px]" />
          </div>
        </div>
      </div>
    </section>
  );
}
