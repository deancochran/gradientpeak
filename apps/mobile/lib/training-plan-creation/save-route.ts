import type {
  BackendCreateCommitMappingResult,
  BackendUpdateCommitMappingResult,
} from "./backend-planning-client";

export type TrainingPlanSaveRoute = "backend" | "degraded";

export function selectTrainingPlanCreateSaveRoute(
  commit: BackendCreateCommitMappingResult,
): TrainingPlanSaveRoute {
  return commit.ok ? "backend" : "degraded";
}

export function selectTrainingPlanUpdateSaveRoute(
  commit: BackendUpdateCommitMappingResult,
): TrainingPlanSaveRoute {
  return commit.ok ? "backend" : "degraded";
}
