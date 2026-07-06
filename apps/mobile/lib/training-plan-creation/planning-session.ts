import type {
  ActiveTrainingPlanProjection,
  BackendCreateCommitMappingResult,
  BackendPreviewProjection,
  BackendUpdateCommitMappingResult,
  ScheduleInspectorBackendInsight,
  TrainingPathChartProjectionResult,
  TrainingPathProjectionStatus,
} from "./backend-planning-client";
import {
  selectTrainingPlanCreateSaveRoute,
  selectTrainingPlanUpdateSaveRoute,
  type TrainingPlanSaveRoute,
} from "./save-route";

export type TrainingPlanProjectionFacade = {
  source: "backend" | "local";
  chart: TrainingPathChartProjectionResult["chart"];
  chartSource: TrainingPathChartProjectionResult["source"];
  status: TrainingPathProjectionStatus;
  active: ActiveTrainingPlanProjection;
  authoritative: BackendPreviewProjection | null;
  inspectorInsight: ScheduleInspectorBackendInsight | null;
  previewSnapshotToken: string | null;
};

export type TrainingPlanSavePlanFacade = {
  createRoute: TrainingPlanSaveRoute;
  updateRoute: TrainingPlanSaveRoute;
  createCommit: BackendCreateCommitMappingResult;
  updateCommit: BackendUpdateCommitMappingResult;
  createDegradedReason: string | null;
  updateDegradedReason: string | null;
};

export function createTrainingPlanProjectionFacade({
  activeProjection,
  authoritativeProjection,
  inspectorInsight,
  trainingPathChartProjection,
  trainingPathProjectionStatus,
}: {
  activeProjection: ActiveTrainingPlanProjection;
  authoritativeProjection: BackendPreviewProjection | null;
  inspectorInsight: ScheduleInspectorBackendInsight | null;
  trainingPathChartProjection: TrainingPathChartProjectionResult;
  trainingPathProjectionStatus: TrainingPathProjectionStatus;
}): TrainingPlanProjectionFacade {
  return {
    source: trainingPathProjectionStatus.source,
    chart: trainingPathChartProjection.chart,
    chartSource: trainingPathChartProjection.source,
    status: trainingPathProjectionStatus,
    active: activeProjection,
    authoritative: authoritativeProjection,
    inspectorInsight,
    previewSnapshotToken: authoritativeProjection?.previewSnapshotToken ?? null,
  };
}

export function createTrainingPlanSavePlanFacade({
  createCommit,
  updateCommit,
}: {
  createCommit: BackendCreateCommitMappingResult;
  updateCommit: BackendUpdateCommitMappingResult;
}): TrainingPlanSavePlanFacade {
  return {
    createCommit,
    createDegradedReason: createCommit.ok ? null : createCommit.reason,
    createRoute: selectTrainingPlanCreateSaveRoute(createCommit),
    updateCommit,
    updateDegradedReason: updateCommit.ok ? null : updateCommit.reason,
    updateRoute: selectTrainingPlanUpdateSaveRoute(updateCommit),
  };
}
