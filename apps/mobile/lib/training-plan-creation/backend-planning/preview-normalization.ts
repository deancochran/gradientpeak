import type { BackendPreviewProjection } from "./types";

export function normalizeBackendPlanningPreview(data: unknown): BackendPreviewProjection | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const projectionChart = record.projection_chart;
  const projectionChartRecord = objectRecord(projectionChart);
  const previewSnapshot = objectRecord(record.preview_snapshot);
  const projectionFeasibility = objectRecord(record.projection_feasibility);
  const conflicts = objectRecord(record.conflicts);
  const planPreview = objectRecord(record.plan_preview);
  return {
    source: "backend",
    isAvailable: true,
    readinessScore: finiteOrNull(projectionChartRecord?.readiness_score),
    readinessConfidence: finiteOrNull(projectionChartRecord?.readiness_confidence),
    feasibilityState: isFeasibilityState(projectionFeasibility?.state)
      ? projectionFeasibility.state
      : null,
    feasibilityReasons: Array.isArray(projectionFeasibility?.reasons)
      ? projectionFeasibility.reasons.filter(
          (reason: unknown): reason is string => typeof reason === "string",
        )
      : [],
    conflicts: {
      isBlocking: Boolean(conflicts?.is_blocking),
      items: Array.isArray(conflicts?.items)
        ? conflicts.items.flatMap((item: unknown) => {
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
    planPreview: planPreview
      ? {
          name: String(planPreview.name ?? "Training plan"),
          startDate: String(planPreview.start_date ?? ""),
          endDate: String(planPreview.end_date ?? ""),
          goalCount: Number(planPreview.goal_count ?? 0),
          blockCount: Number(planPreview.block_count ?? 0),
        }
      : null,
    projectionChart,
    previewSnapshotToken: typeof previewSnapshot?.token === "string" ? previewSnapshot.token : null,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function finiteOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isFeasibilityState(value: unknown): value is "feasible" | "aggressive" | "unsafe" {
  return value === "feasible" || value === "aggressive" || value === "unsafe";
}
