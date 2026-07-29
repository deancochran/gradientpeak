import { commonLoadAggregateSchema, commonLoadResultSchema } from "@repo/core";
import { formatDuration } from "./activity-route-helpers";

export function describeTrainingPlanSessions(structure: unknown) {
  if (!structure || typeof structure !== "object") return "No sessions specified";
  const sessions = collectTrainingPlanSessions(structure);
  if (sessions.length === 0) return "No sessions specified";

  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

type ActivityPlanMetrics = {
  estimated_distance?: number | null;
  estimated_duration?: number | null;
};

export function getActivityPlanMetricSummary(
  metrics: ActivityPlanMetrics | null | undefined,
  commonLoad: unknown,
) {
  const summary: string[] = [];
  const result = commonLoadResultSchema.safeParse(commonLoad);
  const aggregate = commonLoadAggregateSchema.safeParse(commonLoad);
  const parsed = result.success ? result.data : aggregate.success ? aggregate.data : null;
  if (!parsed || parsed.status === "unavailable") {
    summary.push("Load unavailable", "Intensity unavailable");
    appendPlanDimensions(summary, metrics);
    return summary;
  }
  if (parsed.load === null || parsed.intensity === null) {
    summary.push("Load unavailable (partial data)", "Intensity unavailable (partial data)");
    appendPlanDimensions(summary, metrics);
    return summary;
  }
  const suffix = parsed.status === "partial" ? " (partial data)" : "";
  summary.push(`Load ${Math.round(parsed.load)}${suffix}`);
  summary.push(`Intensity ${parsed.intensity.toFixed(2)}${suffix}`);
  appendPlanDimensions(summary, metrics);
  return summary;
}

function appendPlanDimensions(summary: string[], metrics: ActivityPlanMetrics | null | undefined) {
  if (metrics && isPositiveFinite(metrics.estimated_duration)) {
    summary.push(formatDuration(metrics.estimated_duration));
  }
  if (metrics && isPositiveFinite(metrics.estimated_distance)) {
    summary.push(`${(metrics.estimated_distance / 1_000).toFixed(1)} km`);
  }
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function collectTrainingPlanSessions(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const ownSessions = Array.isArray(record.sessions) ? record.sessions : [];
  const blockSessions = Array.isArray(record.blocks)
    ? record.blocks.flatMap((block) => collectTrainingPlanSessions(block))
    : [];
  return [...ownSessions, ...blockSessions];
}
