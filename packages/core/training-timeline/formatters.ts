import type { TrainingLoadComparison } from "./schemas";

export function formatCommonLoad(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} Common Load`;
}

export function summarizeTrainingLoadComparison(load: TrainingLoadComparison) {
  return {
    planned: formatCommonLoad(load.plannedLoad),
    scheduled: formatCommonLoad(sumAvailableLoads(load.scheduledLoad, load.tentativeScheduledLoad)),
    completed: formatCommonLoad(load.completedLoad),
    remaining: formatCommonLoad(load.remainingLoad),
    delta:
      load.deltaLoad === null
        ? "—"
        : `${load.deltaLoad >= 0 ? "+" : ""}${Math.round(load.deltaLoad)} Common Load`,
  };
}

function sumAvailableLoads(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}
