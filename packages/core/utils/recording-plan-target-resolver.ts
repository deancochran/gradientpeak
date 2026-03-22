import type { IntensityTargetV2, IntervalStepV2 } from "../schemas/activity_plan_v2";
import type {
  RecordingProfileSnapshot,
  RecordingTrainerControlIntent,
  RecordingTrainerIntentSource,
} from "../schemas/recording-session";

export interface ResolvePlanStepTrainerIntentsParams {
  step: Pick<IntervalStepV2, "targets">;
  profileSnapshot?: Pick<RecordingProfileSnapshot, "ftp" | "thresholdHr">;
  source?: RecordingTrainerIntentSource;
}

export interface PlanStepTrainerIntentResolution {
  intents: RecordingTrainerControlIntent[];
  informationalTargets: IntensityTargetV2[];
  unresolvedTargets: IntensityTargetV2[];
}

function resolveTargetToIntent(
  target: IntensityTargetV2,
  profileSnapshot: ResolvePlanStepTrainerIntentsParams["profileSnapshot"],
  source: RecordingTrainerIntentSource,
): {
  intent?: RecordingTrainerControlIntent;
  informational?: IntensityTargetV2;
  unresolved?: IntensityTargetV2;
} {
  switch (target.type) {
    case "%FTP": {
      if (!profileSnapshot?.ftp) {
        return { unresolved: target };
      }

      return {
        intent: {
          type: "set_power",
          source,
          watts: Math.round((target.intensity / 100) * profileSnapshot.ftp),
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
          metersPerSecond: target.intensity,
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
    case "bpm":
    case "RPE":
      return { informational: target };
  }
}

/**
 * Resolves a structured workout step into canonical trainer control intents.
 *
 * The resolver is intentionally machine-agnostic. It emits trainer intents that
 * mobile device adaptation can later translate into FTMS commands based on
 * actual hardware capabilities.
 */
export function resolvePlanStepTrainerIntents(
  params: ResolvePlanStepTrainerIntentsParams,
): PlanStepTrainerIntentResolution {
  const source = params.source ?? "step_change";

  return (params.step.targets ?? []).reduce<PlanStepTrainerIntentResolution>(
    (acc, target) => {
      const resolution = resolveTargetToIntent(target, params.profileSnapshot, source);

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
