import type { BackendPreviewProjection } from "./types";

export function normalizeBackendPlanningPreview(data: unknown): BackendPreviewProjection | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, any>;
  const projectionChart = record.projection_chart;
  const previewSnapshot = record.preview_snapshot;
  return {
    source: "backend",
    isAvailable: true,
    readinessScore: finiteOrNull(projectionChart?.readiness_score),
    readinessConfidence: finiteOrNull(projectionChart?.readiness_confidence),
    feasibilityState: isFeasibilityState(record.projection_feasibility?.state)
      ? record.projection_feasibility.state
      : null,
    feasibilityReasons: Array.isArray(record.projection_feasibility?.reasons)
      ? record.projection_feasibility.reasons.filter(
          (reason: unknown): reason is string => typeof reason === "string",
        )
      : [],
    conflicts: {
      isBlocking: Boolean(record.conflicts?.is_blocking),
      items: Array.isArray(record.conflicts?.items)
        ? record.conflicts.items.flatMap((item: unknown) => {
            if (!item || typeof item !== "object") return [];
            const conflict = item as Record<string, unknown>;
            return [
              {
                code: typeof conflict.code === "string" ? conflict.code : "unknown",
                severity: typeof conflict.severity === "string" ? conflict.severity : "warning",
                message:
                  typeof conflict.message === "string" ? conflict.message : "Review this conflict.",
              },
            ];
          })
        : [],
    },
    planPreview:
      record.plan_preview && typeof record.plan_preview === "object"
        ? {
            name: String(record.plan_preview.name ?? "Training plan"),
            startDate: String(record.plan_preview.start_date ?? ""),
            endDate: String(record.plan_preview.end_date ?? ""),
            goalCount: Number(record.plan_preview.goal_count ?? 0),
            blockCount: Number(record.plan_preview.block_count ?? 0),
          }
        : null,
    projectionChart,
    previewSnapshotToken: typeof previewSnapshot?.token === "string" ? previewSnapshot.token : null,
  };
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFeasibilityState(value: unknown): value is "feasible" | "aggressive" | "unsafe" {
  return value === "feasible" || value === "aggressive" || value === "unsafe";
}
