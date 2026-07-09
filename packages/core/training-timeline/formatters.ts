import type { TrainingLoadComparison } from "./schemas";

export function formatTrainingLoadTss(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value ?? 0)} TSS`;
}

export function summarizeTrainingLoadComparison(load: TrainingLoadComparison) {
  return {
    planned: formatTrainingLoadTss(load.plannedTss),
    scheduled: formatTrainingLoadTss(load.scheduledTss + load.tentativeScheduledTss),
    completed: formatTrainingLoadTss(load.completedTss),
    remaining: formatTrainingLoadTss(load.remainingTss),
    delta: `${load.deltaTss >= 0 ? "+" : ""}${Math.round(load.deltaTss)} TSS`,
  };
}
