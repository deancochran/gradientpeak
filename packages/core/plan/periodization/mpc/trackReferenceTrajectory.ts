import type { ReferenceTrajectory } from "../../../schemas/planning";

export interface ProjectedDailyState {
  date: string;
  predicted_load_tss: number;
  predicted_fitness_ctl: number;
  predicted_fatigue_atl: number;
  predicted_form_tsb: number;
}

export interface ReferenceTrackingEvaluation {
  matched_points: number;
  ctl_mean_absolute_error: number;
  tss_mean_absolute_error: number;
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
      ctl_mean_absolute_error: 0,
      tss_mean_absolute_error: 0,
      tracking_error: 0,
      taper_pressure: 0,
      safety_penalty: 0,
      rationale_codes: ["reference_trajectory_unavailable"],
    };
  }

  const referenceByDate =
    input.reference_by_date ??
    new Map(
      input.reference_trajectory.points.map((point) => [point.date, point]),
    );
  let matchedPoints = 0;
  let ctlErrorSum = 0;
  let tssErrorSum = 0;
  let weightedErrorSum = 0;
  let taperPressure = 0;
  let safetyPenalty = 0;

  for (const state of input.projected_states) {
    const referencePoint = referenceByDate.get(state.date);
    if (!referencePoint) {
      continue;
    }

    matchedPoints += 1;
    const ctlError = Math.abs(
      state.predicted_fitness_ctl - referencePoint.target_ctl,
    );
    const tssError = Math.abs(
      state.predicted_load_tss - referencePoint.target_tss,
    );
    const phaseWeight =
      referencePoint.phase === "event"
        ? 2
        : referencePoint.phase === "taper" ||
            referencePoint.phase === "recovery"
          ? 1.5
          : 1;
    const positiveTssOvershoot = Math.max(
      0,
      state.predicted_load_tss - referencePoint.target_tss,
    );

    ctlErrorSum += ctlError;
    tssErrorSum += tssError;
    weightedErrorSum += ctlError * phaseWeight + (tssError / 7) * phaseWeight;

    if (
      referencePoint.phase === "taper" ||
      referencePoint.phase === "event" ||
      referencePoint.phase === "recovery"
    ) {
      taperPressure +=
        (positiveTssOvershoot / Math.max(1, referencePoint.target_tss + 15)) *
        phaseWeight;
    }

    if (state.predicted_form_tsb < -12 && positiveTssOvershoot > 0) {
      safetyPenalty +=
        ((Math.abs(state.predicted_form_tsb) - 12) / 12) *
        (positiveTssOvershoot / Math.max(1, referencePoint.target_tss + 20)) *
        phaseWeight;
    }
  }

  if (matchedPoints === 0) {
    return {
      matched_points: 0,
      ctl_mean_absolute_error: 0,
      tss_mean_absolute_error: 0,
      tracking_error: 0,
      taper_pressure: 0,
      safety_penalty: 0,
      rationale_codes: ["reference_window_no_matching_points"],
    };
  }

  return {
    matched_points: matchedPoints,
    ctl_mean_absolute_error: round(ctlErrorSum / matchedPoints),
    tss_mean_absolute_error: round(tssErrorSum / matchedPoints),
    tracking_error: round(weightedErrorSum / matchedPoints),
    taper_pressure: round(taperPressure / matchedPoints),
    safety_penalty: round(safetyPenalty / matchedPoints),
    rationale_codes: ["reference_tracking_window_scored"],
  };
}
