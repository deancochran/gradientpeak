import {
  type BackendPreviewProjection,
  deriveTrainingPathChartFromActiveProjection,
  deriveTrainingPathProjectionStatus,
  selectActiveTrainingPlanProjection,
} from "./backend-planning-client";
import type { TrainingPlanLocalProjection } from "./local-projection";
import { createTrainingPlanProjectionFacade } from "./planning-session";

export type TrainingPlanCreationPreviewQueryState = {
  error?: { message?: string } | null;
  isFetching: boolean;
  isLoading: boolean;
};

export type TrainingPlanCreationSessionInput = {
  authoritativeProjection: BackendPreviewProjection | null;
  backendPreviewInputEnabled: boolean;
  isBackendPlanningInputStale: boolean;
  localProjection: TrainingPlanLocalProjection;
  previewQuery: TrainingPlanCreationPreviewQueryState;
};

export type TrainingPlanPreviewLifecycle =
  | { status: "backend_input_unavailable"; reason: string }
  | { status: "backend_preview_failed"; reason: string }
  | { status: "backend_preview_pending" }
  | { status: "backend_preview_ready"; snapshotToken: string }
  | { status: "backend_preview_stale" }
  | { status: "local_ready"; reason: string };

export type TrainingPlanCommitLifecycle =
  | { status: "commit_blocked"; reason: string }
  | { status: "commit_ready" };

export type TrainingPlanSaveLifecycle = {
  create: TrainingPlanCommitLifecycle;
  update: TrainingPlanCommitLifecycle;
};

export type TrainingPlanReadinessPresentation = {
  detail: string;
  label: string;
  status: "blocked" | "pending" | "ready" | "review";
};

function derivePreviewLifecycle({
  authoritativeProjection,
  backendPlanningReason,
  backendPreviewInputAvailable,
  backendPreviewInputEnabled,
  isBackendPlanningInputStale,
  previewQuery,
}: {
  authoritativeProjection: BackendPreviewProjection | null;
  backendPlanningReason: string;
  backendPreviewInputAvailable: boolean;
  backendPreviewInputEnabled: boolean;
  isBackendPlanningInputStale: boolean;
  previewQuery: TrainingPlanCreationPreviewQueryState;
}): TrainingPlanPreviewLifecycle {
  if (!backendPreviewInputAvailable) {
    return { status: "backend_input_unavailable", reason: backendPlanningReason };
  }

  if (isBackendPlanningInputStale || !backendPreviewInputEnabled) {
    return { status: "backend_preview_stale" };
  }

  if (previewQuery.isLoading || previewQuery.isFetching) {
    return { status: "backend_preview_pending" };
  }

  if (previewQuery.error) {
    return {
      status: "backend_preview_failed",
      reason: previewQuery.error.message ?? "Backend preview failed.",
    };
  }

  if (authoritativeProjection?.previewSnapshotToken) {
    return {
      status: "backend_preview_ready",
      snapshotToken: authoritativeProjection.previewSnapshotToken,
    };
  }

  return { status: "local_ready", reason: "Using instant local planning projection." };
}

export function deriveTrainingPlanReadinessPresentation({
  canSave,
  localBlockerCount,
  mode,
  previewLifecycle,
  saveLifecycle,
}: {
  canSave: boolean;
  localBlockerCount: number;
  mode: "create" | "edit";
  previewLifecycle: TrainingPlanPreviewLifecycle;
  saveLifecycle: TrainingPlanCommitLifecycle;
}): TrainingPlanReadinessPresentation {
  if (canSave) {
    return {
      detail:
        mode === "edit"
          ? "This plan is ready to save."
          : "This plan is ready to create from your Week/Day builder.",
      label: mode === "edit" ? "Ready to save" : "Ready to create",
      status: "ready",
    };
  }

  if (localBlockerCount > 0) {
    return {
      detail: "Review the highlighted plan details, workouts, goals, or preferences before saving.",
      label: "Review plan",
      status: "review",
    };
  }

  if (previewLifecycle.status === "backend_preview_pending") {
    return {
      detail: "Plan preview is updating. You can keep editing while readiness catches up.",
      label: "Updating preview",
      status: "pending",
    };
  }

  if (previewLifecycle.status === "backend_preview_stale") {
    return {
      detail: "Recent edits are being prepared for a fresh planning preview.",
      label: "Waiting for preview",
      status: "pending",
    };
  }

  if (previewLifecycle.status === "backend_preview_failed") {
    return {
      detail: "Preview could not refresh. Review the plan or try again after editing.",
      label: "Preview unavailable",
      status: "blocked",
    };
  }

  if (saveLifecycle.status === "commit_blocked") {
    return {
      detail: "Add enough goals, preferences, and workouts for a complete training plan preview.",
      label: "Needs setup",
      status: "blocked",
    };
  }

  return {
    detail: "Review the plan before saving.",
    label: "Review plan",
    status: "review",
  };
}

export function deriveTrainingPlanCreationSession({
  authoritativeProjection,
  backendPreviewInputEnabled,
  isBackendPlanningInputStale,
  localProjection,
  previewQuery,
}: TrainingPlanCreationSessionInput) {
  const activeProjection = selectActiveTrainingPlanProjection({
    backendPreview: authoritativeProjection,
    backendPreviewEnabled: backendPreviewInputEnabled,
    isBackendInputStale: isBackendPlanningInputStale,
    localChart: localProjection.builderViewModel.dailyTrainingPathChart,
  });

  const previewLifecycle = derivePreviewLifecycle({
    authoritativeProjection,
    backendPlanningReason: localProjection.backendPlanning.status.reason,
    backendPreviewInputAvailable: localProjection.backendPlanning.previewInput !== null,
    backendPreviewInputEnabled,
    isBackendPlanningInputStale,
    previewQuery,
  });
  const saveLifecycle: TrainingPlanSaveLifecycle = {
    create: { status: "commit_ready" },
    update: { status: "commit_ready" },
  };

  const trainingPathChartProjection = deriveTrainingPathChartFromActiveProjection({
    activeProjection,
    localChart: localProjection.builderViewModel.dailyTrainingPathChart,
  });

  const trainingPathProjectionStatus = deriveTrainingPathProjectionStatus({
    activeProjection,
    backendInputAvailable: localProjection.backendPlanning.previewInput !== null,
    backendPlanningReason: localProjection.backendPlanning.status.reason,
    backendPreviewEnabled: backendPreviewInputEnabled,
    backendPreviewError: previewQuery.error,
    backendPreviewLoading: previewQuery.isLoading || previewQuery.isFetching,
    chartSource: trainingPathChartProjection.source,
  });

  const projection = createTrainingPlanProjectionFacade({
    activeProjection,
    authoritativeProjection,
    inspectorInsight: null,
    trainingPathChartProjection,
    trainingPathProjectionStatus,
  });

  return {
    activeProjection,
    previewLifecycle,
    projection,
    saveLifecycle,
    trainingPathChartProjection,
    trainingPathProjectionStatus,
  };
}

export type TrainingPlanCreationSession = ReturnType<typeof deriveTrainingPlanCreationSession>;
