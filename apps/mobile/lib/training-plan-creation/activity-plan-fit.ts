import type { SessionDemand } from "@repo/core";

export interface ActivityPlanFitSummary {
  score: number;
  label: "Best fit" | "Good fit" | "Review fit";
  reason: string;
}

export function scoreActivityPlanFit(input: {
  demand: SessionDemand | undefined;
  estimatedCommonLoad: number | null | undefined;
  estimatedDurationSeconds: number | null | undefined;
}): ActivityPlanFitSummary | null {
  if (!input.demand) {
    return null;
  }

  let score = 50;
  const reasons: string[] = [];
  const targetDuration = input.demand.target_duration_minutes
    ? input.demand.target_duration_minutes * 60
    : null;
  const targetLoad = input.demand.target_common_load;

  if (targetDuration && input.estimatedDurationSeconds) {
    const durationRatio =
      Math.abs(input.estimatedDurationSeconds - targetDuration) / targetDuration;
    score += Math.max(0, 30 - Math.round(durationRatio * 60));
    reasons.push("duration");
  }

  if (targetLoad && input.estimatedCommonLoad) {
    const loadRatio = Math.abs(input.estimatedCommonLoad - targetLoad) / targetLoad;
    score += Math.max(0, 30 - Math.round(loadRatio * 60));
    reasons.push("load");
  }

  if (input.demand.training_intent === "durable_endurance") {
    score += (input.estimatedDurationSeconds ?? 0) >= 3600 ? 20 : -20;
  }
  if (
    input.demand.training_intent === "recovery" &&
    typeof input.estimatedCommonLoad === "number"
  ) {
    score += input.estimatedCommonLoad <= 40 ? 20 : -20;
  }
  if (
    input.demand.training_intent === "threshold_development" &&
    typeof input.estimatedCommonLoad === "number"
  ) {
    score += input.estimatedCommonLoad >= 60 ? 15 : -10;
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    score: boundedScore,
    label: boundedScore >= 80 ? "Best fit" : boundedScore >= 60 ? "Good fit" : "Review fit",
    reason:
      reasons.length > 0
        ? `Matches ${reasons.join(" and ")}`
        : `Matches ${input.demand.training_intent} intent`,
  };
}
