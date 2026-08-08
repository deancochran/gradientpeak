import type { BackendPreviewProjection, ProjectionPreviewOutput } from "./types";

export function normalizeBackendPlanningPreview(
  data: ProjectionPreviewOutput | undefined,
): BackendPreviewProjection | null {
  if (!data || data.status !== "available") return null;
  return {
    source: "backend",
    isAvailable: true,
    readinessScore: null,
    readinessConfidence: null,
    feasibilityState: null,
    feasibilityReasons: [],
    conflicts: { isBlocking: false, items: [] },
    planPreview: null,
    projectionChart: data.simulation,
    simulation: data.simulation,
  };
}
