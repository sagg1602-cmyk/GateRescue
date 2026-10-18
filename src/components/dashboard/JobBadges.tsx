import type { CriticalityTier, Job } from "@/lib/demo/frontend-types";
import {
  formatHarmCountdown,
  getJobExtras,
  harmSoonMinutes,
  TIER_DESCRIPTION,
  TIER_LABEL,
} from "@/lib/demo/job-extras";
import type { Tone } from "@/lib/demo/job-status";
import { formatTime } from "@/lib/demo/time";
import { Badge } from "./ui";

const TIER_TONE: Record<CriticalityTier, Tone> = { 3: "red", 2: "amber", 1: "neutral", 0: "neutral" };

/** `stacked` puts the label under the badge so narrow table columns stay narrow. */
export function TierBadge({ tier, stacked = false }: { tier: CriticalityTier; stacked?: boolean }) {
  if (stacked) {
    return (
      <span title={TIER_DESCRIPTION[tier]} className="inline-flex flex-col items-start gap-0.5">
        <Badge tone={TIER_TONE[tier]}>Tier {tier}</Badge>
        <span className="whitespace-nowrap text-[11px] text-slate-500">{TIER_LABEL[tier]}</span>
      </span>
    );
  }
  return (
    <span title={TIER_DESCRIPTION[tier]}>
      <Badge tone={TIER_TONE[tier]}>
        Tier {tier} · {TIER_LABEL[tier]}
      </Badge>
    </span>
  );
}

/** Renders nothing unless the job is unapproved and its harm deadline is near. */
export function HarmSoonBadge({ job, now, className = "" }: { job: Job; now: string; className?: string }) {
  const minutes = harmSoonMinutes(job, now);
  if (minutes === null) return null;
  return (
    <span className={className} title={`Harm deadline ${formatTime(getJobExtras(job).harmDeadline)} (simulated clock)`}>
      <Badge tone="red">{formatHarmCountdown(minutes)}</Badge>
    </span>
  );
}
