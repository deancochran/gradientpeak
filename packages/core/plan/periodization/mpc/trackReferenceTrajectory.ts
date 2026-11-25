import type { ReferenceTrajectory } from "../../../schemas/planning";

export interface ProjectedDailyState {
  date: string;
  predicted_load: number;
  predicted_fitness_longTermLoad: number;
  predicted_fatigue_recentLoad: number;
  predicted_form_loadBalance: number;
}

export interface ReferenceTrackingEvaluation {
  matched_points: number;
  longTermLoad_mean_absolute_error: number;
  load_mean_absolute_error: number;
  tracking_error: number;
  taper_pressure: number;
  safety_penalty: number;
  rationale_codes: string[];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function evaluateReferenceTrackingWindow(input: {
  projected_states: ProjectedDailyState[];
  reference_trajectory?: ReferenceTrajectory | null;
  reference_by_date?: Map<string, ReferenceTrajectory["points"][number]>;
}): ReferenceTrackingEvaluation {
  if (!input.reference_trajectory || input.projected_states.length === 0) {
    return {
      matched_points: 0,
      longTermLoad_mean_absolute_error: 0,
      load_mean_absolute_error: 0,
      tracking_error: 0,
      taper_pressure: 0,
      safety_penalty: 0,
      rationale_codes: ["reference_trajectory_unavailable"],
    };
  }

  const referenceByDate =
    input.reference_by_date ??
    new Map(input.reference_trajectory.points.map((point) => [point.date, point]));
  let matchedPoints = 0;
  let longTermLoadErrorSum = 0;
  let loadErrorSum = 0;
  let weightedErrorSum = 0;
  let taperPressure = 0;
  let safetyPenalty = 0;

  for (const state of input.projected_states) {
    const referencePoint = referenceByDate.get(state.date);
    if (!referencePoint) {
      continue;
    }

    matchedPoints += 1;
    const longTermLoadError = Math.abs(
      state.predicted_fitness_longTermLoad - referencePoint.target_longTermLoad,
    );
    const loadError = Math.abs(state.predicted_load - referencePoint.target_load);
    const phaseWeight =
      referencePoint.phase === "event"
        ? 2
        : referencePoint.phase === "taper" || referencePoint.phase === "recovery"
          ? 1.5
          : 1;
    const positiveLoadOvershoot = Math.max(0, state.predicted_load - referencePoint.target_load);

    longTermLoadErrorSum += longTermLoadError;
    loadErrorSum += loadError;
    weightedErrorSum += longTermLoadError * phaseWeight + (loadError / 7) * phaseWeight;

    if (
      referencePoint.phase === "taper" ||
      referencePoint.phase === "event" ||
      referencePoint.phase === "recovery"
    ) {
      taperPressure +=
        (positiveLoadOvershoot / Math.max(1, referencePoint.target_load + 15)) * phaseWeight;
    }

    if (state.predicted_form_loadBalance < -12 && positiveLoadOvershoot > 0) {
      safetyPenalty +=
        ((Math.abs(state.predicted_form_loadBalance) - 12) / 12) *
        (positiveLoadOvershoot / Math.max(1, referencePoint.target_load + 20)) *
        phaseWeight;
    }
  }

  if (matchedPoints === 0) {
    return {
      matched_points: 0,
      longTermLoad_mean_absolute_error: 0,
      load_mean_absolute_error: 0,
      tracking_error: 0,
      taper_pressure: 0,
      safety_penalty: 0,
      rationale_codes: ["reference_window_no_matching_points"],
    };
  }

  return {
    matched_points: matchedPoints,
    longTermLoad_mean_absolute_error: round(longTermLoadErrorSum / matchedPoints),
    load_mean_absolute_error: round(loadErrorSum / matchedPoints),
    tracking_error: round(weightedErrorSum / matchedPoints),
    taper_pressure: round(taperPressure / matchedPoints),
    safety_penalty: round(safetyPenalty / matchedPoints),
    rationale_codes: ["reference_tracking_window_scored"],
  };
}
