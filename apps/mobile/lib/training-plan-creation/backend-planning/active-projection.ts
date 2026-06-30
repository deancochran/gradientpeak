import type { ActiveTrainingPlanProjection, BackendPreviewProjection } from "./types";

export function selectActiveTrainingPlanProjection({
  backendPreview,
  backendPreviewEnabled,
  isBackendInputStale,
  localChart,
}: {
  backendPreview: BackendPreviewProjection | null;
  backendPreviewEnabled: boolean;
  isBackendInputStale: boolean;
  localChart: unknown;
}): ActiveTrainingPlanProjection {
  if (backendPreview && backendPreviewEnabled && !isBackendInputStale) return backendPreview;
  if (localChart) {
    return {
      source: "local",
      isAvailable: true,
      chart: localChart,
      reason: backendPreviewEnabled
        ? "Using instant local projection while authoritative backend preview is unavailable or stale."
        : "Using instant local projection because backend preview input is unavailable.",
    };
  }
  return {
    source: "none",
    isAvailable: false,
    reason: "No local or backend projection is available.",
  };
}
