import type { TrainingPlanBuilderSessionIntent } from "./types";

export interface ActivityPlanFitSummary {
  score: number;
  label: "Best fit" | "Good fit" | "Review fit";
  reason: string;
}

export function scoreActivityPlanFit(input: {
  intent: TrainingPlanBuilderSessionIntent | undefined;
  estimatedCommonLoad: number | null | undefined;
  estimatedDurationSeconds: number | null | undefined;
}): ActivityPlanFitSummary | null {
  if (!input.intent) {
    return null;
  }

  let score = 50;
  const reasons: string[] = [];
  const targetDuration = input.intent.targetDurationSeconds;
  const targetLoad = input.intent.targetLoad;

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

  if (input.intent.type === "endurance") {
    score += (input.estimatedDurationSeconds ?? 0) >= 3600 ? 20 : -20;
  }
  if (input.intent.type === "recovery" && typeof input.estimatedCommonLoad === "number") {
    score += input.estimatedCommonLoad <= 40 ? 20 : -20;
  }
  if (input.intent.type === "threshold" && typeof input.estimatedCommonLoad === "number") {
    score += input.estimatedCommonLoad >= 60 ? 15 : -10;
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    score: boundedScore,
    label: boundedScore >= 80 ? "Best fit" : boundedScore >= 60 ? "Good fit" : "Review fit",
    reason:
      reasons.length > 0
        ? `Matches ${reasons.join(" and ")}`
        : `Matches ${input.intent.type} intent`,
  };
}
