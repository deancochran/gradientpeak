import type {
  BackendCreateCommitMappingResult,
  BackendUpdateCommitMappingResult,
} from "./backend-planning-client";

export type TrainingPlanSaveRoute = "backend" | "legacy";

export function selectTrainingPlanCreateSaveRoute(
  commit: BackendCreateCommitMappingResult,
): TrainingPlanSaveRoute {
  return commit.ok ? "backend" : "legacy";
}

export function selectTrainingPlanUpdateSaveRoute(
  commit: BackendUpdateCommitMappingResult,
): TrainingPlanSaveRoute {
  return commit.ok ? "backend" : "legacy";
}
