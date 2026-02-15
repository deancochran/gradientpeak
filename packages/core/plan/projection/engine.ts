import { buildDeterministicProjectionPayload as buildDeterministicProjectionPayloadInternal } from "../projectionCalculations";
import type {
  BuildDeterministicProjectionInput,
  DeterministicProjectionGoalMarker,
  DeterministicProjectionMicrocycle,
  DeterministicProjectionPayload,
  DeterministicProjectionPoint,
  ProjectionDiagnostics,
  ProjectionRecoverySegment,
  WeeklyOptimizationPath,
  ProjectionWeekMetadata,
} from "../projectionCalculations";

export type {
  BuildDeterministicProjectionInput,
  DeterministicProjectionGoalMarker,
  DeterministicProjectionMicrocycle,
  DeterministicProjectionPayload,
  DeterministicProjectionPoint,
  ProjectionDiagnostics,
  ProjectionRecoverySegment,
  WeeklyOptimizationPath,
  ProjectionWeekMetadata,
};

/**
 * Canonical deterministic projection orchestration entrypoint.
 */
export function buildDeterministicProjectionPayload(
  input: BuildDeterministicProjectionInput,
): DeterministicProjectionPayload {
  return buildDeterministicProjectionPayloadInternal(input);
}
