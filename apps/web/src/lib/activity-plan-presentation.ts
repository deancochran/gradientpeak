import {
  activityPrescriptionQuantificationBundleSchema,
  deriveActivityPlanPresentation,
} from "@repo/core";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { formatDuration } from "./activity-route-helpers";

export function describeTrainingPlanSessions(structure: unknown) {
  if (!structure || typeof structure !== "object") return "No sessions specified";
  const sessions = collectTrainingPlanSessions(structure);
  if (sessions.length === 0) return "No sessions specified";

  return `${sessions.length} session${sessions.length === 1 ? "" : "s"}`;
}

type ActivityPlanMetricSummaryInput = {
  prescriptionQuantification?: unknown;
  structure?: unknown;
};

export function getActivityPlanMetricSummary({
  prescriptionQuantification,
  structure,
}: ActivityPlanMetricSummaryInput) {
  const summary: string[] = [];
  const presented = getActivityQuantificationPresentation(prescriptionQuantification);
  summary.push(formatQuantificationMetric(presented.commonLoad));
  summary.push(formatQuantificationMetric(presented.normalizedIntensity));

  if (presented.nativeIntensity.status !== "unavailable") {
    summary.push(
      `${presented.nativeIntensity.label} ${presented.nativeIntensity.value} · ${presented.nativeIntensity.evidence}`,
    );
  } else if (presented.kind === "unavailable") {
    const authoredTargets = [
      ...new Set(
        (deriveActivityPlanPresentation(structure)?.occurrences ?? []).flatMap((occurrence) =>
          occurrence.intensityLabel ? [occurrence.intensityLabel] : [],
        ),
      ),
    ];
    if (authoredTargets.length > 0) {
      summary.push(`Prescribed intensity ${authoredTargets.join(" · ")} · Prescribed`);
    }
  }
  appendPlanDimensions(summary, prescriptionQuantification);
  return summary;
}

function formatQuantificationMetric(metric: {
  evidence: string;
  label: string;
  status: string;
  value: string;
}) {
  const value = metric.status === "unavailable" ? "unavailable" : metric.value;
  const evidence = metric.evidence === "Unavailable" ? "" : ` · ${metric.evidence}`;
  return `${metric.label} ${value}${evidence}`;
}

function appendPlanDimensions(summary: string[], value: unknown) {
  const parsed = activityPrescriptionQuantificationBundleSchema.safeParse(value);
  if (!parsed.success) return;
  const elapsed = parsed.data.summary.duration.elapsed;
  const distance = parsed.data.summary.distance;
  if (elapsed.status !== "unavailable" && isPositiveFinite(elapsed.value)) {
    summary.push(formatDuration(elapsed.value));
  }
  if (distance.status !== "unavailable" && isPositiveFinite(distance.value)) {
    summary.push(`${(distance.value / 1_000).toFixed(1)} km`);
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
