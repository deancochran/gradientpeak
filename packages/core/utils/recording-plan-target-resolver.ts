import type { CompiledActivityStepOccurrence } from "../activity-plan";
import {
  type AthletePerformanceTargetFacts,
  getAvailablePerformanceTargetValue,
} from "../performance-model";
import type {
  RecordingTrainerControlIntent,
  RecordingTrainerIntentSource,
} from "../schemas/recording-session";
import { isTargetTypePermittedForActivity } from "../targets";
import type { ActivityTarget } from "../targets/schema";

export interface ResolveActivityOccurrenceTrainerIntentsParams {
  occurrence: Pick<CompiledActivityStepOccurrence, "activity_category" | "targets">;
  performanceTargets?: AthletePerformanceTargetFacts;
  intensityScale?: number;
  source?: RecordingTrainerIntentSource;
}

export interface PlanStepTrainerIntentResolution {
  intents: RecordingTrainerControlIntent[];
  informationalTargets: ActivityTarget[];
  unresolvedTargets: ActivityTarget[];
}

function resolveTargetToIntent(
  target: ActivityTarget,
  activityCategory: CompiledActivityStepOccurrence["activity_category"],
  performanceTargets: AthletePerformanceTargetFacts | undefined,
  intensityScale: number,
  source: RecordingTrainerIntentSource,
): {
  intent?: RecordingTrainerControlIntent;
  informational?: ActivityTarget;
  unresolved?: ActivityTarget;
} {
  switch (target.type) {
    case "%FTP": {
      const resolved = resolvePerformanceTargetValue({
        target,
        activityCategory,
        ...(performanceTargets !== undefined ? { performanceTargets } : {}),
        intensityScale,
      });
      if (!resolved) {
        return { unresolved: target };
      }

      return {
        intent: {
          type: "set_power",
          source,
          watts: resolved.value,
        },
      };
    }
    case "watts":
      return {
        intent: {
          type: "set_power",
          source,
          watts: Math.round(target.intensity),
        },
      };
    case "speed":
      return {
        intent: {
          type: "set_speed",
          source,
          metersPerSecond: target.intensity / 3.6,
        },
      };
    case "cadence":
      return {
        intent: {
          type: "set_cadence",
          source,
          rpm: Math.round(target.intensity),
        },
      };
    case "%ThresholdHR":
    case "%MaxHR":
      return resolvePerformanceTargetValue({
        target,
        activityCategory,
        ...(performanceTargets !== undefined ? { performanceTargets } : {}),
        intensityScale,
      })
        ? { informational: target }
        : { unresolved: target };
    case "bpm":
    case "RPE":
      return { informational: target };
  }
}

function categoryHeartRateFact(
  facts: AthletePerformanceTargetFacts["heartRate"],
  activityCategory: CompiledActivityStepOccurrence["activity_category"],
  metric: "%ThresholdHR" | "%MaxHR",
) {
  return activityCategory === "bike" || activityCategory === "run" || activityCategory === "swim"
    ? metric === "%ThresholdHR"
      ? facts[activityCategory].lthr
      : facts[activityCategory].maxHr
    : undefined;
}

/** Resolves only model-dependent targets; absolute targets remain caller-owned values. */
export function resolvePerformanceTargetValue(input: {
  target: Extract<ActivityTarget, { type: "%FTP" | "%ThresholdHR" | "%MaxHR" }>;
  activityCategory: CompiledActivityStepOccurrence["activity_category"];
  performanceTargets?: AthletePerformanceTargetFacts;
  intensityScale?: number;
}): { value: number; unit: "watts" | "bpm" } | null {
  const performanceTargets = input.performanceTargets;
  if (!performanceTargets) return null;
  if (input.target.type === "%FTP") {
    if (input.activityCategory !== "bike") return null;
    const planningThresholdPower = getAvailablePerformanceTargetValue(
      performanceTargets.thresholds.bike,
    );
    if (planningThresholdPower === null) return null;
    const scale = input.intensityScale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) return null;
    return {
      value: Math.round((input.target.intensity / 100) * planningThresholdPower * scale),
      unit: "watts",
    };
  }
  const fact = categoryHeartRateFact(
    performanceTargets.heartRate,
    input.activityCategory,
    input.target.type,
  );
  const threshold = fact?.status === "available" ? fact.valueBpm : null;
  return threshold === null || threshold === undefined
    ? null
    : { value: Math.round((input.target.intensity / 100) * threshold), unit: "bpm" };
}

/**
 * Resolves a structured activity step into canonical trainer control intents.
 *
 * The resolver is intentionally machine-agnostic. It emits trainer intents that
 * mobile device adaptation can later translate into FTMS commands based on
 * actual hardware capabilities.
 */
export function resolveActivityOccurrenceTrainerIntents(
  params: ResolveActivityOccurrenceTrainerIntentsParams,
): PlanStepTrainerIntentResolution {
  const source = params.source ?? "step_change";

  return params.occurrence.targets.reduce<PlanStepTrainerIntentResolution>(
    (acc, target) => {
      if (
        !isTargetTypePermittedForActivity({
          activityCategory: params.occurrence.activity_category,
          targetType: target.type,
        })
      ) {
        acc.unresolvedTargets.push(target);
        return acc;
      }
      const resolution = resolveTargetToIntent(
        target,
        params.occurrence.activity_category,
        params.performanceTargets,
        params.intensityScale ?? 1,
        source,
      );

      if (resolution.intent) {
        acc.intents.push(resolution.intent);
      }

      if (resolution.informational) {
        acc.informationalTargets.push(resolution.informational);
      }

      if (resolution.unresolved) {
        acc.unresolvedTargets.push(resolution.unresolved);
      }

      return acc;
    },
    {
      intents: [],
      informationalTargets: [],
      unresolvedTargets: [],
    },
  );
}
