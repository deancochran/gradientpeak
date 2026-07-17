import type { CompiledActivityStepOccurrence } from "../activity-plan";
import type {
  RecordingProfileSnapshot,
  RecordingTrainerControlIntent,
  RecordingTrainerIntentSource,
} from "../schemas/recording-session";
import { isTargetTypePermittedForActivity } from "../targets";
import type { ActivityTarget } from "../targets/schema";

export interface ResolveActivityOccurrenceTrainerIntentsParams {
  occurrence: Pick<CompiledActivityStepOccurrence, "category" | "targets">;
  profileSnapshot?: Pick<RecordingProfileSnapshot, "ftp" | "thresholdHr">;
  source?: RecordingTrainerIntentSource;
}

export interface PlanStepTrainerIntentResolution {
  intents: RecordingTrainerControlIntent[];
  informationalTargets: ActivityTarget[];
  unresolvedTargets: ActivityTarget[];
}

function resolveTargetToIntent(
  target: ActivityTarget,
  profileSnapshot: ResolveActivityOccurrenceTrainerIntentsParams["profileSnapshot"],
  source: RecordingTrainerIntentSource,
): {
  intent?: RecordingTrainerControlIntent;
  informational?: ActivityTarget;
  unresolved?: ActivityTarget;
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
    case "bpm":
    case "RPE":
      return { informational: target };
  }
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
          activityCategory: params.occurrence.category,
          targetType: target.type,
        })
      ) {
        acc.unresolvedTargets.push(target);
        return acc;
      }
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
