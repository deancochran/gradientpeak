import { type ActivityPlanSummary, addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "@repo/core";
import type { DailyTrainingAdjustmentPoint } from "@/components/plan/training-path/DailyTrainingAdjustmentChart";
import type { ProjectionPreviewOutput } from "./backend-planning/types";
import type { TrainingPlanBuilderSession } from "./types";

/** Adapt the authored draft to the Plan tab chart contract. Never manufacture forecast days. */
export function buildCreationChartPoints(input: {
  startDate: string;
  windowStart: string;
  windowEnd: string;
  sessions: TrainingPlanBuilderSession[];
  activityPlans: Record<string, ActivityPlanSummary>;
  preview: ProjectionPreviewOutput | null;
}): DailyTrainingAdjustmentPoint[] {
  const transitions =
    input.preview?.status === "available" ? input.preview.simulation.transitions : [];
  const resolutions = new Map(
    input.preview?.status === "available"
      ? input.preview.sessionResults.map((result) => [result.sourceSessionId, result])
      : [],
  );
  const forecast = new Map(
    transitions.map((transition) => [
      transition.sourceId?.startsWith("plan-day:")
        ? transition.sourceId.slice("plan-day:".length)
        : (resolutions.get(transition.sourceId ?? "")?.planningDate ??
          transition.toAsOf.slice(0, 10)),
      transition.state,
    ]),
  );
  return Array.from(
    { length: diffDateOnlyUtcDays(input.windowStart, input.windowEnd) + 1 },
    (_, index) => {
      const date = addDaysDateOnlyUtc(input.windowStart, index);
      const offset = diffDateOnlyUtcDays(input.startDate, date);
      const sessions = input.sessions.filter((session) => session.offsetDays === offset);
      const metrics = sessions.map((session) => {
        const resolution = resolutions.get(session.id);
        if (resolution) {
          if (resolution.status !== "resolved") return undefined;
          const load = resolution.manifest.prescription_estimate.common_load;
          return {
            value: load.value,
            status: load.status === "complete" ? "available" : load.status,
          };
        }
        // Demand is a resolver target, not an achieved estimate. Never chart it as load.
        if (
          session.demand.target_common_load != null ||
          session.demand.target_duration_minutes != null
        )
          return undefined;
        return session.activityPlan
          ? input.activityPlans[session.activityPlan.id]?.metrics.find(
              (metric) => metric.key === "common_load",
            )
          : undefined;
      });
      const known = metrics.filter((metric) => metric?.value != null);
      const load =
        sessions.length === 0
          ? 0
          : known.length === 0
            ? null
            : known.reduce((sum, metric) => sum + (metric?.value ?? 0), 0);
      const status =
        sessions.length === 0
          ? "known_zero"
          : known.length === 0
            ? "unavailable"
            : known.length < sessions.length ||
                metrics.some((metric) => metric?.status !== "available")
              ? "partial"
              : "complete";
      const state = forecast.get(date);
      return {
        date,
        plannedLoad: load,
        plannedLoadStatus: status,
        effectiveRemainingLoad: load,
        effectiveRemainingLoadStatus: status,
        effectiveCompletedLoad: null,
        effectiveCompletedLoadStatus: "unavailable",
        scheduledFitnessCtl: state?.longTermLoad ?? null,
        scheduledFatigueAtl: state?.recentLoad ?? null,
        scheduledFormTsb: state?.loadBalance ?? null,
      };
    },
  );
}
