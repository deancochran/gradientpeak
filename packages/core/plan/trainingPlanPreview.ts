import type { MinimalTrainingPlanCreate } from "../schemas/training_plan_structure";
import { canonicalizeMinimalTrainingPlanCreate } from "./canonicalization";

const HMS_PATTERN = /^([0-9]+):([0-5][0-9]):([0-5][0-9])$/;
const MMS_PATTERN = /^([0-9]+):([0-5][0-9])$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type PreviewActivityCategory = "run" | "bike" | "swim" | "other";

export type PreviewGoalTargetInput = {
  targetType:
    | "race_performance"
    | "pace_threshold"
    | "power_threshold"
    | "hr_threshold";
  activityCategory?: PreviewActivityCategory;
  distanceKm?: string;
  completionTimeHms?: string;
  paceMmSs?: string;
  testDurationHms?: string;
  targetWatts?: number;
  targetLthrBpm?: number;
};

export type PreviewGoalInput = {
  name: string;
  targetDate: string;
  priority: number;
  targets: PreviewGoalTargetInput[];
};

export type PreviewFormInput = {
  planStartDate?: string;
  goals: PreviewGoalInput[];
};

export type PreviewState<TChart> = {
  projectionChart?: TChart;
  previewError?: string;
};

export type PreviewReadinessSnapshot = {
  readiness_score: number;
  predicted_load_tss: number;
  predicted_fatigue_atl: number;
  feasibility_state: "feasible" | "aggressive" | "unsafe";
  tss_ramp_clamp_weeks: number;
  ctl_ramp_clamp_weeks: number;
};

type ReadinessDirection = "up" | "down" | "flat";

export type ReadinessDeltaImpactDiagnostics = {
  key: "load" | "fatigue" | "feasibility";
  direction: ReadinessDirection;
  delta: number;
  effect: "supports_readiness" | "suppresses_readiness" | "neutral";
  previous_value: number;
  current_value: number;
  reason_codes: string[];
};

export type ReadinessDeltaDiagnostics = {
  readiness: {
    direction: ReadinessDirection;
    delta: number;
    previous_score: number;
    current_score: number;
  };
  impacts: {
    load: ReadinessDeltaImpactDiagnostics;
    fatigue: ReadinessDeltaImpactDiagnostics;
    feasibility: ReadinessDeltaImpactDiagnostics;
  };
  dominant_driver: "load" | "fatigue" | "feasibility" | "mixed";
  summary_codes: string[];
};

export type PreviewStateEvent<TChart> =
  | {
      status: "success";
      projectionChart: TChart;
    }
  | {
      status: "failure";
      errorMessage: string;
    };

export function buildPreviewMinimalPlanFromForm(
  input: PreviewFormInput,
): MinimalTrainingPlanCreate | null {
  const fallbackTarget = getFallbackPreviewTarget(input.goals);

  const goals = input.goals.flatMap((goal, goalIndex) => {
    const fallbackName = `Goal ${goalIndex + 1}`;
    const name = goal.name.trim() || fallbackName;
    if (!DATE_ONLY_PATTERN.test(goal.targetDate)) {
      return [];
    }

    const priority = clampInteger(goal.priority, 1, 10);
    const targets = goal.targets.flatMap((target) => {
      const converted = toPreviewTarget(target);
      return converted ? [converted] : [];
    });

    if (targets.length === 0 && fallbackTarget) {
      targets.push(fallbackTarget);
    }

    if (targets.length === 0) {
      return [];
    }

    return [
      {
        name,
        target_date: goal.targetDate,
        priority,
        targets,
      },
    ];
  });

  if (goals.length === 0) {
    return null;
  }

  const trimmedPlanStartDate = input.planStartDate?.trim();
  const planStartDate =
    trimmedPlanStartDate && DATE_ONLY_PATTERN.test(trimmedPlanStartDate)
      ? trimmedPlanStartDate
      : undefined;

  return canonicalizeMinimalTrainingPlanCreate({
    goals,
    plan_start_date: planStartDate,
  });
}

function getFallbackPreviewTarget(
  goals: PreviewGoalInput[],
): MinimalTrainingPlanCreate["goals"][number]["targets"][number] | null {
  for (const goal of goals) {
    for (const target of goal.targets) {
      const converted = toPreviewTarget(target);
      if (converted) {
        return converted;
      }
    }
  }

  return null;
}

export function reducePreviewState<TChart>(
  state: PreviewState<TChart>,
  event: PreviewStateEvent<TChart>,
): PreviewState<TChart> {
  if (event.status === "success") {
    return {
      projectionChart: event.projectionChart,
      previewError: undefined,
    };
  }

  return {
    projectionChart: state.projectionChart,
    previewError: event.errorMessage,
  };
}

export function buildReadinessDeltaDiagnostics(input: {
  previous: PreviewReadinessSnapshot;
  current: PreviewReadinessSnapshot;
}): ReadinessDeltaDiagnostics {
  const readinessDelta = round2(
    input.current.readiness_score - input.previous.readiness_score,
  );
  const loadDelta = round2(
    input.current.predicted_load_tss - input.previous.predicted_load_tss,
  );
  const fatigueDelta = round2(
    input.current.predicted_fatigue_atl - input.previous.predicted_fatigue_atl,
  );
  const feasibilityPressurePrevious =
    toFeasibilityPressure(input.previous.feasibility_state) +
    input.previous.tss_ramp_clamp_weeks +
    input.previous.ctl_ramp_clamp_weeks;
  const feasibilityPressureCurrent =
    toFeasibilityPressure(input.current.feasibility_state) +
    input.current.tss_ramp_clamp_weeks +
    input.current.ctl_ramp_clamp_weeks;
  const feasibilityDelta = round2(
    feasibilityPressureCurrent - feasibilityPressurePrevious,
  );

  const loadImpact = buildImpactDiagnostics({
    key: "load",
    delta: loadDelta,
    previousValue: input.previous.predicted_load_tss,
    currentValue: input.current.predicted_load_tss,
    positiveEffect: "supports_readiness",
    negativeEffect: "suppresses_readiness",
    reasonCodes: [
      "impact_load_tss_delta",
      loadDelta > 0 ? "impact_load_increased" : "impact_load_decreased",
    ],
  });

  const fatigueImpact = buildImpactDiagnostics({
    key: "fatigue",
    delta: fatigueDelta,
    previousValue: input.previous.predicted_fatigue_atl,
    currentValue: input.current.predicted_fatigue_atl,
    positiveEffect: "suppresses_readiness",
    negativeEffect: "supports_readiness",
    reasonCodes: [
      "impact_fatigue_atl_delta",
      fatigueDelta > 0
        ? "impact_fatigue_increased"
        : "impact_fatigue_decreased",
    ],
  });

  const feasibilityImpact = buildImpactDiagnostics({
    key: "feasibility",
    delta: feasibilityDelta,
    previousValue: feasibilityPressurePrevious,
    currentValue: feasibilityPressureCurrent,
    positiveEffect: "suppresses_readiness",
    negativeEffect: "supports_readiness",
    reasonCodes: [
      "impact_feasibility_pressure_delta",
      feasibilityDelta > 0
        ? "impact_feasibility_pressure_increased"
        : "impact_feasibility_pressure_decreased",
    ],
  });

  const impactMagnitudes = {
    load: Math.abs(loadImpact.delta),
    fatigue: Math.abs(fatigueImpact.delta),
    feasibility: Math.abs(feasibilityImpact.delta),
  };
  const sortedDrivers = Object.entries(impactMagnitudes).sort(
    (left, right) => right[1] - left[1],
  );
  const topDriver = sortedDrivers[0]?.[0] as
    | "load"
    | "fatigue"
    | "feasibility"
    | undefined;
  const secondMagnitude = sortedDrivers[1]?.[1] ?? 0;
  const topMagnitude = sortedDrivers[0]?.[1] ?? 0;
  const dominantDriver =
    !topDriver || topMagnitude === 0
      ? "mixed"
      : Math.abs(topMagnitude - secondMagnitude) <= 0.01
        ? "mixed"
        : topDriver;

  return {
    readiness: {
      direction: toDirection(readinessDelta),
      delta: readinessDelta,
      previous_score: round2(input.previous.readiness_score),
      current_score: round2(input.current.readiness_score),
    },
    impacts: {
      load: loadImpact,
      fatigue: fatigueImpact,
      feasibility: feasibilityImpact,
    },
    dominant_driver: dominantDriver,
    summary_codes: [
      "readiness_delta_diagnostics_v1",
      readinessDelta > 0
        ? "readiness_moved_up"
        : readinessDelta < 0
          ? "readiness_moved_down"
          : "readiness_no_change",
      `dominant_driver_${dominantDriver}`,
    ],
  };
}

export function buildPreviewReadinessSnapshot(input: {
  projectionChart: {
    points: Array<{
      readiness_score?: number;
      predicted_load_tss: number;
      predicted_fatigue_atl: number;
    }>;
    readiness_score?: number;
    constraint_summary?: {
      tss_ramp_clamp_weeks: number;
      ctl_ramp_clamp_weeks: number;
    };
  };
  projectionFeasibilityState: "feasible" | "aggressive" | "unsafe";
}): PreviewReadinessSnapshot | null {
  const pointCount = input.projectionChart.points.length;
  if (pointCount === 0) {
    return null;
  }

  const latestPoint = input.projectionChart.points[pointCount - 1];
  if (!latestPoint) {
    return null;
  }

  const readinessScore =
    latestPoint.readiness_score ?? input.projectionChart.readiness_score;
  if (typeof readinessScore !== "number" || !Number.isFinite(readinessScore)) {
    return null;
  }

  return {
    readiness_score: round2(readinessScore),
    predicted_load_tss: round2(latestPoint.predicted_load_tss),
    predicted_fatigue_atl: round2(latestPoint.predicted_fatigue_atl),
    feasibility_state: input.projectionFeasibilityState,
    tss_ramp_clamp_weeks:
      input.projectionChart.constraint_summary?.tss_ramp_clamp_weeks ?? 0,
    ctl_ramp_clamp_weeks:
      input.projectionChart.constraint_summary?.ctl_ramp_clamp_weeks ?? 0,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toDirection(value: number): ReadinessDirection {
  if (value > 0.01) {
    return "up";
  }

  if (value < -0.01) {
    return "down";
  }

  return "flat";
}

function toFeasibilityPressure(
  state: PreviewReadinessSnapshot["feasibility_state"],
): number {
  switch (state) {
    case "feasible":
      return 0;
    case "aggressive":
      return 1;
    case "unsafe":
      return 2;
  }
}

function buildImpactDiagnostics(input: {
  key: ReadinessDeltaImpactDiagnostics["key"];
  delta: number;
  previousValue: number;
  currentValue: number;
  positiveEffect: ReadinessDeltaImpactDiagnostics["effect"];
  negativeEffect: ReadinessDeltaImpactDiagnostics["effect"];
  reasonCodes: string[];
}): ReadinessDeltaImpactDiagnostics {
  const direction = toDirection(input.delta);

  return {
    key: input.key,
    direction,
    delta: input.delta,
    effect:
      direction === "up"
        ? input.positiveEffect
        : direction === "down"
          ? input.negativeEffect
          : "neutral",
    previous_value: round2(input.previousValue),
    current_value: round2(input.currentValue),
    reason_codes: input.reasonCodes,
  };
}

function toPreviewTarget(
  target: PreviewGoalTargetInput,
): MinimalTrainingPlanCreate["goals"][number]["targets"][number] | null {
  switch (target.targetType) {
    case "race_performance": {
      const distanceM = parseDistanceKmToMeters(target.distanceKm);
      const targetTimeS = parseHmsToSeconds(target.completionTimeHms ?? "");
      if (!distanceM || !targetTimeS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "race_performance",
        distance_m: distanceM,
        target_time_s: targetTimeS,
        activity_category: target.activityCategory,
      };
    }
    case "pace_threshold": {
      const paceSeconds = parseMmSsToSeconds(target.paceMmSs ?? "");
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      if (!paceSeconds || !testDurationS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "pace_threshold",
        target_speed_mps: 1000 / paceSeconds,
        test_duration_s: testDurationS,
        activity_category: target.activityCategory,
      };
    }
    case "power_threshold": {
      const testDurationS = parseHmsToSeconds(target.testDurationHms ?? "");
      if (!target.targetWatts || !testDurationS || !target.activityCategory) {
        return null;
      }

      return {
        target_type: "power_threshold",
        target_watts: target.targetWatts,
        test_duration_s: testDurationS,
        activity_category: target.activityCategory,
      };
    }
    case "hr_threshold": {
      if (!target.targetLthrBpm) {
        return null;
      }

      return {
        target_type: "hr_threshold",
        target_lthr_bpm: Math.round(target.targetLthrBpm),
      };
    }
  }
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseHmsToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const match = HMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseMmSsToSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const match = MMS_PATTERN.exec(trimmed);
  if (!match) {
    return undefined;
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return minutes * 60 + seconds;
}

function parseDistanceKmToMeters(
  value: string | undefined,
): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const distanceKm = Number(value);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return undefined;
  }

  return Math.round(distanceKm * 1000);
}
