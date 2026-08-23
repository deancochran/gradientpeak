import {
  type ActivityPlanPresentationModel,
  type ActivityPlanStructure,
  type ActivityPrescriptionQuantificationBundle,
  deriveActivityPlanPresentation,
  getPlannedEstimate,
  type PlannedEstimate,
  type SemanticMetric,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import { ActivityPlanAttributionRow } from "./ActivityPlanAttributionRow";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceMetricsRow } from "./ResourceCardPrimitives";

type ActivityPlanSummaryProps = {
  description?: string | null;
  headerAccessory?: ReactNode;
  owner?: EntityOwner | null;
  presentation?: ActivityPlanPresentationModel | null;
  projectionMetrics?: readonly SemanticMetric[];
  prescriptionQuantification?: ActivityPrescriptionQuantificationBundle | null;
  structure?: ActivityPlanStructure | unknown;
  subtitle?: string | null;
  testID?: string;
  title?: string | null;
  updatedAt?: string | Date | null;
  variant?: "embedded" | "standalone";
  showAttribution?: boolean;
};

export function formatActivityCategoryLabel(
  activityCategory: string | null | undefined,
): string | null {
  if (!activityCategory) return null;

  return activityCategory
    .split("_")
    .map((segment) => (segment ? `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}` : segment))
    .join(" ");
}

export function countActivityPlanSteps(structure: ActivityPlanStructure | unknown): number {
  return deriveActivityPlanPresentation(structure)?.stepCount ?? 0;
}

function formatMetricValue(metric: SemanticMetric): string | null {
  if (metric.status === "unavailable") return null;
  const formatted =
    metric.unit === "seconds"
      ? formatDurationSeconds(metric.value)
      : metric.unit === "meters"
        ? metric.value >= 1_000
          ? `${Math.round((metric.value / 1_000) * 10) / 10} km`
          : `${Math.round(metric.value)} m`
        : metric.unit === "ratio"
          ? metric.value.toFixed(2)
          : String(Math.round(metric.value * 10) / 10);
  if (formatted === null) return null;
  return metric.status === "partial" ? `${formatted} known (partial)` : formatted;
}

function formatDurationSeconds(seconds: number): string {
  const roundedSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(roundedSeconds / 3_600);
  const minutes = Math.floor((roundedSeconds % 3_600) / 60);
  const remainder = roundedSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
  return `${remainder}s`;
}

function metricsFromEstimate(estimate: PlannedEstimate): SemanticMetric[] {
  const metric = (
    key: SemanticMetric["key"],
    label: string,
    unit: string,
    quantity: PlannedEstimate["durationSeconds"] | PlannedEstimate["load"],
    provenance: SemanticMetric["provenance"],
  ): SemanticMetric => {
    if (quantity.status === "unavailable" || quantity.value === null) {
      return {
        key,
        label,
        status: "unavailable",
        value: null,
        unit,
        reason: quantity.reason,
        provenance: null,
      };
    }
    return quantity.status === "partial"
      ? {
          key,
          label,
          status: "partial",
          value: quantity.value,
          unit,
          reason: quantity.reason,
          provenance,
        }
      : { key, label, status: "available", value: quantity.value, unit, reason: null, provenance };
  };
  const authoredProvenance = (
    quantity: PlannedEstimate["distanceMeters"] | PlannedEstimate["durationSeconds"],
  ): SemanticMetric["provenance"] =>
    quantity.status === "unavailable"
      ? null
      : quantity.status === "estimated"
        ? "estimated"
        : "authored";
  const calculatedProvenance = (quantity: PlannedEstimate["load"]): SemanticMetric["provenance"] =>
    quantity.status === "unavailable" || quantity.basis === null
      ? null
      : quantity.basis === "plan_intent"
        ? "plan_intent"
        : "personalized";
  return [
    metric(
      "distance",
      "Distance",
      "meters",
      estimate.distanceMeters,
      authoredProvenance(estimate.distanceMeters),
    ),
    metric(
      "elapsed_duration",
      "Duration",
      "seconds",
      estimate.durationSeconds,
      authoredProvenance(estimate.durationSeconds),
    ),
    metric("common_load", "Load", "score", estimate.load, calculatedProvenance(estimate.load)),
    metric(
      "normalized_intensity",
      "Intensity",
      "ratio",
      estimate.normalizedIntensity,
      calculatedProvenance(estimate.normalizedIntensity),
    ),
  ];
}

const estimateOrder = [
  "distance",
  "elapsed_duration",
  "common_load",
  "normalized_intensity",
] as const;
const estimateLabels: Record<(typeof estimateOrder)[number], string> = {
  distance: "Distance",
  elapsed_duration: "Duration",
  common_load: "Load",
  normalized_intensity: "Intensity",
};

export function ActivityPlanMetricsRow({
  projectionMetrics,
  prescriptionQuantification,
}: Pick<ActivityPlanSummaryProps, "projectionMetrics" | "prescriptionQuantification">) {
  const availableMetrics =
    projectionMetrics ??
    (prescriptionQuantification
      ? metricsFromEstimate(getPlannedEstimate(prescriptionQuantification))
      : []);
  const byKey = new Map(availableMetrics.map((metric) => [metric.key, metric]));
  const metrics = estimateOrder.map((key) => {
    const metric = byKey.get(key);
    return {
      label: estimateLabels[key],
      value: metric ? (formatMetricValue(metric) ?? "Unavailable") : "Unavailable",
      ...(key === "common_load" || key === "normalized_intensity"
        ? { tone: "primary" as const }
        : {}),
    };
  });

  return <ResourceMetricsRow maxItems={4} metrics={metrics} testID="activity-plan-estimates" />;
}

export function ActivityPlanSummary({
  description,
  headerAccessory,
  owner,
  projectionMetrics,
  prescriptionQuantification,
  subtitle,
  testID,
  title,
  updatedAt,
  variant = "embedded",
  showAttribution = true,
}: ActivityPlanSummaryProps) {
  return (
    <View
      className={
        variant === "standalone"
          ? "gap-3"
          : "gap-3 rounded-2xl border border-border bg-muted/20 px-3 py-3"
      }
      testID={testID}
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1">
          {subtitle ? (
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {subtitle}
            </Text>
          ) : null}
          <Text className="text-base font-semibold text-foreground">
            {title || "Untitled activity plan"}
          </Text>
          {description?.trim() ? (
            <Text className="text-xs leading-5 text-muted-foreground">{description.trim()}</Text>
          ) : null}
        </View>
        {headerAccessory}
      </View>

      <ActivityPlanMetricsRow
        {...(projectionMetrics !== undefined ? { projectionMetrics } : {})}
        {...(prescriptionQuantification !== undefined ? { prescriptionQuantification } : {})}
      />

      {showAttribution ? (
        <ActivityPlanAttributionRow
          compact={variant !== "standalone"}
          {...(owner !== undefined ? { owner } : {})}
          {...(updatedAt !== undefined ? { updatedAt } : {})}
        />
      ) : null}
    </View>
  );
}
