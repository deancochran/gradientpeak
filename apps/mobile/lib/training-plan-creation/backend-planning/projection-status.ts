import type { ActiveTrainingPlanProjection, TrainingPathProjectionStatus } from "./types";

export function deriveTrainingPathProjectionStatus({
  activeProjection,
  backendInputAvailable,
  backendPlanningReason,
  backendPreviewEnabled,
  backendPreviewError,
  backendPreviewLoading,
  chartSource,
}: {
  activeProjection: ActiveTrainingPlanProjection;
  backendInputAvailable: boolean;
  backendPlanningReason: string;
  backendPreviewEnabled: boolean;
  backendPreviewError?: { message?: string } | null;
  backendPreviewLoading: boolean;
  chartSource: "backend" | "local";
}): TrainingPathProjectionStatus {
  return {
    source: chartSource,
    backendInputAvailable,
    backendPreviewEnabled,
    backendPreviewLoading,
    backendPreviewError: backendPreviewError?.message ?? null,
    backendPreviewHasSnapshot:
      activeProjection.source === "backend" && Boolean(activeProjection.previewSnapshotToken),
    fallbackReason:
      chartSource === "backend"
        ? null
        : getProjectionFallbackReason({
            activeProjection,
            backendInputAvailable,
            backendPlanningReason,
            backendPreviewEnabled,
            backendPreviewError,
            backendPreviewLoading,
          }),
  };
}

function getProjectionFallbackReason({
  activeProjection,
  backendInputAvailable,
  backendPlanningReason,
  backendPreviewEnabled,
  backendPreviewError,
  backendPreviewLoading,
}: {
  activeProjection: ActiveTrainingPlanProjection;
  backendInputAvailable: boolean;
  backendPlanningReason: string;
  backendPreviewEnabled: boolean;
  backendPreviewError?: { message?: string } | null;
  backendPreviewLoading: boolean;
}) {
  if (!backendInputAvailable) return backendPlanningReason;
  if (!backendPreviewEnabled) return "Backend preview is waiting for a debounced planning context.";
  if (backendPreviewLoading) return "Backend preview is loading; using instant local projection.";
  if (backendPreviewError)
    return backendPreviewError.message ?? "Backend preview failed; using local projection.";
  if (activeProjection.source === "local") return activeProjection.reason;
  if (activeProjection.source === "backend")
    return "Backend projection chart is unavailable or incompatible; using local projection.";
  return activeProjection.reason;
}
