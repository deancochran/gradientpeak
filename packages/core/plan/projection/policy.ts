import type { TrainingPlanCalibrationConfig } from "../../schemas/training-plan-structure";
import { trainingPlanCalibrationConfigSchema } from "../../schemas/training-plan-structure";
import {
  type EffectiveProjectionControls,
  resolveEffectiveProjectionControls,
} from "./effective-controls";
import {
  normalizeProjectionSafetyConfig,
  type ProjectionCalibrationConfigInput,
  type ProjectionSafetyConfig,
  type ProjectionSafetyConfigInput,
} from "./safety-caps";

export interface ResolvedProjectionPolicy {
  normalizedConfig: ProjectionSafetyConfig;
  calibration: TrainingPlanCalibrationConfig;
  effectiveControls: EffectiveProjectionControls;
  usedDefaultCalibration: boolean;
}

/** Resolves all projection configuration precedence before projection work begins. */
export function resolveProjectionPolicy(input: {
  creationConfig?: ProjectionSafetyConfigInput;
}): ResolvedProjectionPolicy {
  const normalizedConfig = normalizeProjectionSafetyConfig(input.creationConfig);
  const parsedCalibration = trainingPlanCalibrationConfigSchema.safeParse({
    ...(input.creationConfig?.calibration ?? {}),
    version: 1,
  });
  const calibration = parsedCalibration.success
    ? parsedCalibration.data
    : trainingPlanCalibrationConfigSchema.parse({});
  const effectiveControls = resolveEffectiveProjectionControls({
    normalized_config: normalizedConfig,
    calibration,
    ...(input.creationConfig?.behavior_controls === undefined
      ? {}
      : { behavior_controls: input.creationConfig.behavior_controls }),
  });

  return {
    normalizedConfig,
    calibration,
    effectiveControls,
    usedDefaultCalibration: !parsedCalibration.success,
  };
}

export type { ProjectionCalibrationConfigInput };
