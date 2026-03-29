import type {
  BuildDeterministicProjectionInput,
  DeterministicProjectionGoalMarker,
  DeterministicProjectionMicrocycle,
  DeterministicProjectionPayload,
  DeterministicProjectionPoint,
  ProjectionDiagnostics,
  ProjectionRecoverySegment,
  ProjectionWeekMetadata,
  WeeklyOptimizationPath,
} from "../projectionCalculations";
import { buildDeterministicProjectionPayload as buildDeterministicProjectionPayloadInternal } from "../projectionCalculations";

export type {
  BuildDeterministicProjectionInput,
  DeterministicProjectionGoalMarker,
  DeterministicProjectionMicrocycle,
  DeterministicProjectionPayload,
  DeterministicProjectionPoint,
  ProjectionDiagnostics,
  ProjectionRecoverySegment,
  ProjectionWeekMetadata,
  WeeklyOptimizationPath,
};

/**
 * Canonical deterministic projection orchestration entrypoint.
 */
export function buildDeterministicProjectionPayload(
  input: BuildDeterministicProjectionInput,
): DeterministicProjectionPayload {
  return buildDeterministicProjectionPayloadInternal(input);
}
