import {
  type ActivityPlanPresentationModel,
  type ActivityPlanStructureV3,
  deriveActivityPlanPresentation,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { type ReactNode, useMemo } from "react";
import { View } from "react-native";
import { getCommonLoadPresentation } from "@/lib/activity-load-presentation";
import {
  formatEstimatedDurationMinutes,
  formatEstimatedDurationSeconds,
} from "@/lib/estimatedMetrics";
import { ActivityPlanAttributionRow } from "./ActivityPlanAttributionRow";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceMetricsRow } from "./ResourceCardPrimitives";
import type { SportLoadMeasurement } from "./SportLoadBreakdown";

type ActivityPlanSummaryProps = {
  activityCategory?: string | null;
  categoryLoads?: readonly SportLoadMeasurement[];
  commonLoad?: unknown;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedTss?: number | null;
  headerAccessory?: ReactNode;
  intensityFactor?: number | null;
  owner?: EntityOwner | null;
  presentation?: ActivityPlanPresentationModel | null;
  routeName?: string | null;
  routeProvided?: boolean;
  structure?: ActivityPlanStructureV3 | unknown;
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

export function countActivityPlanSteps(structure: ActivityPlanStructureV3 | unknown): number {
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
  commonLoad,
  presentation,
  structure,
}: Pick<
  ActivityPlanSummaryProps,
  | "estimatedDuration"
  | "estimatedDurationMinutes"
  | "commonLoad"
  | "estimatedTss"
  | "intensityFactor"
  | "presentation"
  | "structure"
>) {
  const presentationModel = useMemo(
    () => presentation ?? deriveActivityPlanPresentation(structure),
    [presentation, structure],
  );
  const stepCount = presentationModel?.stepCount ?? 0;
  const durationLabel = formatActivityPlanDuration({ estimatedDuration, estimatedDurationMinutes });
  const loadPresentation = getCommonLoadPresentation(commonLoad);
  const commonLoadMetrics =
    loadPresentation?.load && loadPresentation.intensity
      ? [
          {
            label: "Load",
            value: loadPresentation.load,
            tone: "primary" as const,
          },
          {
            label: "Intensity",
            value: loadPresentation.intensity,
            tone: "primary" as const,
          },
        ]
      : loadPresentation?.unavailableText
        ? [
            {
              label: "Load",
              value: loadPresentation.unavailableText,
              tone: "primary" as const,
            },
          ]
        : [];

  if (!durationLabel && commonLoadMetrics.length === 0 && stepCount === 0) {
    return null;
  }

  return (
    <ResourceMetricsRow
      metrics={[
        { label: "Duration", value: durationLabel || "--" },
        ...commonLoadMetrics,
        { label: "Steps", value: `${stepCount}` },
      ]}
    />
  );
}

export function ActivityPlanSummary({
  description,
  estimatedDuration,
  estimatedDurationMinutes,
  estimatedTss,
  headerAccessory,
  intensityFactor,
  commonLoad,
  owner,
  presentation,
  routeName,
  routeProvided,
  structure,
  subtitle,
  testID,
  title,
  updatedAt,
  variant = "embedded",
  showAttribution = true,
}: ActivityPlanSummaryProps) {
  const routeLabel = routeName?.trim() || (routeProvided ? "Route included" : null);

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
          {routeLabel ? (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              <Text className="text-xs text-muted-foreground">{routeLabel}</Text>
            </View>
          ) : null}
        </View>
        {headerAccessory}
      </View>

      <ActivityPlanMetricsRow
        commonLoad={commonLoad}
        estimatedDuration={estimatedDuration}
        estimatedDurationMinutes={estimatedDurationMinutes}
        estimatedTss={estimatedTss}
        intensityFactor={intensityFactor}
        presentation={presentation}
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
