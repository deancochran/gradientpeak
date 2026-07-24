import type {
  ActiveTrainingPlanProjection,
  BackendPreviewProjection,
  ScheduleInspectorBackendInsight,
  TrainingPathChartProjectionResult,
  TrainingPathProjectionStatus,
} from "./backend-planning-client";

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
