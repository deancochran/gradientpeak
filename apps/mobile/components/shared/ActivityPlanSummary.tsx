import {
  type ActivityPlanPresentationModel,
  type ActivityPlanStructure,
  type ActivityPrescriptionQuantificationBundle,
  deriveActivityPlanPresentation,
  type SemanticMetric,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { getActivityQuantificationPresentation } from "@repo/ui/lib/activity-quantification-presentation";
import { type ReactNode, useMemo } from "react";
import { View } from "react-native";
import {
  formatEstimatedDurationMinutes,
  formatEstimatedDurationSeconds,
} from "@/lib/estimatedMetrics";
import { ActivityPlanAttributionRow } from "./ActivityPlanAttributionRow";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceMetricsRow } from "./ResourceCardPrimitives";

type ActivityPlanSummaryProps = {
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
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

export function formatActivityPlanDuration(params: {
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
}): string | null {
  const { estimatedDuration, estimatedDurationMinutes } = params;

  if (typeof estimatedDuration === "number" && estimatedDuration > 0) {
    return formatEstimatedDurationSeconds(estimatedDuration);
  }

  if (typeof estimatedDurationMinutes === "number" && estimatedDurationMinutes > 0) {
    return formatEstimatedDurationMinutes(estimatedDurationMinutes);
  }

  return null;
}

export function ActivityPlanMetricsRow({
  estimatedDuration,
  estimatedDurationMinutes,
  presentation,
  projectionMetrics,
  prescriptionQuantification,
  structure,
}: Pick<
  ActivityPlanSummaryProps,
  | "estimatedDuration"
  | "estimatedDurationMinutes"
  | "presentation"
  | "projectionMetrics"
  | "prescriptionQuantification"
  | "structure"
>) {
  const presentationModel = useMemo(
    () => presentation ?? deriveActivityPlanPresentation(structure),
    [presentation, structure],
  );
  const stepCount = presentationModel?.stepCount ?? 0;
  const durationLabel = formatActivityPlanDuration({ estimatedDuration, estimatedDurationMinutes });
  const quantified = getActivityQuantificationPresentation(prescriptionQuantification);
  const formatProjectionMetric = (metric: SemanticMetric | undefined, fallbackLabel: string) => ({
    label: metric?.label ?? fallbackLabel,
    value:
      !metric || metric.status === "unavailable"
        ? "Unavailable"
        : metric.unit === "ratio"
          ? metric.value.toFixed(2)
          : Number.isInteger(metric.value)
            ? String(metric.value)
            : metric.value.toFixed(1),
  });
  const commonLoad = projectionMetrics
    ? formatProjectionMetric(
        projectionMetrics.find((metric) => metric.key === "common_load"),
        "Load",
      )
    : quantified.commonLoad;
  const normalizedIntensity = projectionMetrics
    ? formatProjectionMetric(
        projectionMetrics.find((metric) => metric.key === "normalized_intensity"),
        "Intensity",
      )
    : quantified.normalizedIntensity;
  const structureAuthoredValues = [
    ...new Set(
      (presentationModel?.occurrences ?? []).flatMap((occurrence) =>
        occurrence.intensityLabel ? [occurrence.intensityLabel] : [],
      ),
    ),
  ];
  const prescribedIntensity =
    quantified.nativeIntensity.status !== "unavailable"
      ? quantified.nativeIntensity
      : quantified.kind === "unavailable" && structureAuthoredValues.length > 0
        ? {
            evidence: "Prescribed",
            label: "Prescribed intensity",
            value: structureAuthoredValues.join(" · "),
          }
        : null;

  return (
    <View className="gap-2">
      <ResourceMetricsRow
        metrics={[
          { label: "Duration", value: durationLabel || "Unavailable" },
          {
            label: commonLoad.label,
            value: commonLoad.value,
            tone: "primary",
          },
          {
            label: normalizedIntensity.label,
            value: normalizedIntensity.value,
            tone: "primary",
          },
          { label: "Steps", value: `${stepCount}` },
        ]}
      />
      {!projectionMetrics ? (
        <Text className="px-1 text-[10px] text-muted-foreground">
          {quantified.commonLoad.evidence}. {quantified.commonLoad.explanation}
        </Text>
      ) : null}
      {!projectionMetrics && quantified.commonLoad.diagnostic ? (
        <Text className="px-1 text-[10px] text-muted-foreground">
          {quantified.commonLoad.diagnostic.summary} {quantified.commonLoad.diagnostic.action}
        </Text>
      ) : null}
      {prescribedIntensity ? (
        <Text className="px-1 text-[10px] text-muted-foreground">
          {prescribedIntensity.label}: {prescribedIntensity.value} · {prescribedIntensity.evidence}
        </Text>
      ) : null}
    </View>
  );
}

export function ActivityPlanSummary({
  description,
  estimatedDuration,
  estimatedDurationMinutes,
  headerAccessory,
  owner,
  presentation,
  projectionMetrics,
  prescriptionQuantification,
  structure,
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
        estimatedDuration={estimatedDuration}
        estimatedDurationMinutes={estimatedDurationMinutes}
        presentation={presentation}
        projectionMetrics={projectionMetrics}
        prescriptionQuantification={prescriptionQuantification}
        structure={structure}
      />

      {showAttribution ? (
        <ActivityPlanAttributionRow
          compact={variant !== "standalone"}
          owner={owner}
          updatedAt={updatedAt}
        />
      ) : null}
    </View>
  );
}
