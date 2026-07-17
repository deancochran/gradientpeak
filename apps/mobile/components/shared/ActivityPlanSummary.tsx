import {
  type ActivityPlanStructureV3,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
} from "@repo/core";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { View } from "react-native";
import {
  formatEstimatedDurationMinutes,
  formatEstimatedDurationSeconds,
  formatEstimatedIntensityFactor,
  formatEstimatedTss,
} from "@/lib/estimatedMetrics";
import { ActivityPlanAttributionRow } from "./ActivityPlanAttributionRow";
import type { EntityOwner } from "./EntityOwnerRow";
import { ResourceMetricsRow } from "./ResourceCardPrimitives";

type ActivityPlanSummaryProps = {
  activityCategory?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedTss?: number | null;
  headerAccessory?: ReactNode;
  intensityFactor?: number | null;
  owner?: EntityOwner | null;
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
  const parsed = activityPlanStructureSchemaV3.safeParse(structure);
  return parsed.success ? compileActivityPlanV3(parsed.data).occurrences.length : 0;
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
  estimatedTss,
  intensityFactor,
  structure,
}: Pick<
  ActivityPlanSummaryProps,
  | "estimatedDuration"
  | "estimatedDurationMinutes"
  | "estimatedTss"
  | "intensityFactor"
  | "structure"
>) {
  const stepCount = countActivityPlanSteps(structure);
  const parsedStructure = activityPlanStructureSchemaV3.safeParse(structure);
  const hasCompatibleAggregate =
    parsedStructure.success && compileActivityPlanV3(parsedStructure.data).categories.length === 1;
  const durationLabel = formatActivityPlanDuration({ estimatedDuration, estimatedDurationMinutes });

  if (
    !durationLabel &&
    !(typeof estimatedTss === "number" && Number.isFinite(estimatedTss) && estimatedTss > 0) &&
    !(
      typeof intensityFactor === "number" &&
      Number.isFinite(intensityFactor) &&
      intensityFactor > 0
    ) &&
    stepCount === 0
  ) {
    return null;
  }

  return (
    <ResourceMetricsRow
      metrics={[
        { label: "Duration", value: durationLabel || "--" },
        ...(hasCompatibleAggregate
          ? [
              {
                label: "TSS",
                value: formatEstimatedTss(estimatedTss, { includeUnit: false }) ?? "--",
                tone: "primary" as const,
              },
              {
                label: "Intensity",
                value: formatEstimatedIntensityFactor(intensityFactor) ?? "--",
                tone: "primary" as const,
              },
            ]
          : []),
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
  owner,
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
        estimatedDuration={estimatedDuration}
        estimatedDurationMinutes={estimatedDurationMinutes}
        estimatedTss={estimatedTss}
        intensityFactor={intensityFactor}
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
