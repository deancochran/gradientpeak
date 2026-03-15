import {
  eventDemandSchema,
  type EventDemand,
  type EventDemandFamily,
  type NormalizedPlanningGoal,
} from "../../../schemas/planning";
import {
  MAX_BIASED_AGGREGATION_WEIGHT,
  WEIGHTED_AVERAGE_AGGREGATION_WEIGHT,
} from "../constants";
import { getSportModelConfig } from "../sports";

export interface EventDemandResolutionSuccess {
  status: "supported";
  demand: EventDemand;
}

export interface EventDemandResolutionUnsupported {
  status: "unsupported";
  goal_id: string;
  rationale_codes: string[];
  unsupported_target_types: string[];
}

export type EventDemandResolution =
  | EventDemandResolutionSuccess
  | EventDemandResolutionUnsupported;

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveContribution(target: NormalizedPlanningGoal["targets"][number]) {
  switch (target.target_type) {
    case "race_performance": {
      const durationMinutes = target.target_time_s / 60;
      const distanceKm = target.distance_m / 1000;
      return {
        family: "race_performance" as const,
        durationMinutes,
        requiredPeakCtl: round(34 + durationMinutes * 0.08 + distanceKm * 1.6),
        rationale_codes: ["race_performance_demand_mapped"],
      };
    }
    case "pace_threshold":
      return {
        family: "threshold_pace" as const,
        durationMinutes: target.test_duration_s / 60,
        requiredPeakCtl: round(28 + target.target_speed_mps * 4.5),
        rationale_codes: ["pace_threshold_demand_mapped"],
      };
    case "power_threshold":
      return {
        family: "threshold_power" as const,
        durationMinutes: target.test_duration_s / 60,
        requiredPeakCtl: round(25 + target.target_watts / 8),
        rationale_codes: ["power_threshold_demand_mapped"],
      };
    case "hr_threshold":
      return {
        family: "threshold_hr" as const,
        durationMinutes: 60,
        requiredPeakCtl: round(20 + target.target_lthr_bpm / 5),
        rationale_codes: [
          "hr_threshold_demand_mapped",
          "hr_threshold_low_specificity_confidence",
        ],
      };
  }
}

function resolveAggregateFamily(
  families: EventDemandFamily[],
): EventDemandFamily {
  if (families.includes("race_performance")) {
    return "race_performance";
  }

  return families[0] ?? "threshold_hr";
}

export function resolveEventDemand(
  goal: NormalizedPlanningGoal,
): EventDemandResolution {
  if (goal.targets.length === 0) {
    return {
      status: "unsupported",
      goal_id: goal.id,
      rationale_codes: ["unsupported_goal_mapping_no_targets"],
      unsupported_target_types: [],
    };
  }

  const resolved = goal.targets.map((target) => {
    const weight = target.weight ?? 1;
    const contribution = deriveContribution(target);

    return {
      target_type: target.target_type,
      weight,
      ...contribution,
    };
  });
  const totalWeight = resolved.reduce((sum, item) => sum + item.weight, 0);
  const maxCtl = Math.max(...resolved.map((item) => item.requiredPeakCtl));
  const weightedCtl =
    resolved.reduce(
      (sum, item) => sum + item.requiredPeakCtl * (item.weight / totalWeight),
      0,
    ) || 0;
  const weightedDuration =
    resolved.reduce(
      (sum, item) => sum + item.durationMinutes * (item.weight / totalWeight),
      0,
    ) || 0;
  const requiredPeakCtl = round(
    maxCtl * MAX_BIASED_AGGREGATION_WEIGHT +
      weightedCtl * WEIGHTED_AVERAGE_AGGREGATION_WEIGHT,
  );

  return {
    status: "supported",
    demand: eventDemandSchema.parse({
      goal_id: goal.id,
      sport: goal.activity_category,
      demand_family: resolveAggregateFamily(
        resolved.map((item) => item.family),
      ),
      demand_duration_minutes: round(weightedDuration),
      required_peak_ctl: requiredPeakCtl,
      required_weekly_load_floor: round(requiredPeakCtl * 7),
      target_contributions: resolved.map((item) => ({
        target_type: item.target_type,
        weight: item.weight,
        weight_share: round(item.weight / totalWeight),
        required_peak_ctl: item.requiredPeakCtl,
        rationale_codes: item.rationale_codes,
      })),
      rationale_codes: [
        "event_demand_resolved",
        resolved.length > 1
          ? "multi_target_demand_aggregation_max_weighted"
          : "single_target_demand_applied",
        `sport_acwr_ceiling_${getSportModelConfig(goal.activity_category).acwr_ceiling}`,
      ],
    }),
  };
}
