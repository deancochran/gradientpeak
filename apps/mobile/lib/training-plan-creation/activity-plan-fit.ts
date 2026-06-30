import type { TrainingPlanBuilderSessionIntent } from "./types";

export interface ActivityPlanFitSummary {
  score: number;
  label: "Best fit" | "Good fit" | "Review fit";
  reason: string;
}

export function scoreActivityPlanFit(input: {
  intent: TrainingPlanBuilderSessionIntent | undefined;
  estimatedTss: number | null | undefined;
  estimatedDurationSeconds: number | null | undefined;
}): ActivityPlanFitSummary | null {
  if (!input.intent) {
    return null;
  }

  let score = 50;
  const reasons: string[] = [];
  const targetDuration = input.intent.targetDurationSeconds;
  const targetTss = input.intent.targetTss;

  if (targetDuration && input.estimatedDurationSeconds) {
    const durationRatio =
      Math.abs(input.estimatedDurationSeconds - targetDuration) / targetDuration;
    score += Math.max(0, 30 - Math.round(durationRatio * 60));
    reasons.push("duration");
  }

  if (targetTss && input.estimatedTss) {
    const tssRatio = Math.abs(input.estimatedTss - targetTss) / targetTss;
    score += Math.max(0, 30 - Math.round(tssRatio * 60));
    reasons.push("load");
  }

  if (input.intent.type === "endurance") {
    score += (input.estimatedDurationSeconds ?? 0) >= 3600 ? 20 : -20;
  }
  if (input.intent.type === "recovery") {
    score += (input.estimatedTss ?? 0) <= 40 ? 20 : -20;
  }
  if (input.intent.type === "threshold") {
    score += (input.estimatedTss ?? 0) >= 60 ? 15 : -10;
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
