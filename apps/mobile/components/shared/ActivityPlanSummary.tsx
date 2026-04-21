import { type ActivityPlanStructureV2, formatDurationSec } from "@repo/core";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import React from "react";
import { View } from "react-native";
import { getActivityCategoryConfig, getActivityConfig } from "@/lib/constants/activities";

type ActivityPlanSummaryProps = {
  activityCategory?: string | null;
  description?: string | null;
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedTss?: number | null;
  headerAccessory?: ReactNode;
  intensityFactor?: number | null;
  routeName?: string | null;
  routeProvided?: boolean;
  structure?: ActivityPlanStructureV2 | unknown;
  subtitle?: string | null;
  testID?: string;
  title?: string | null;
  variant?: "embedded" | "standalone";
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

export function countActivityPlanSteps(structure: ActivityPlanStructureV2 | unknown): number {
  if (!structure || typeof structure !== "object") return 0;
  const intervals = (structure as ActivityPlanStructureV2).intervals;
  if (!Array.isArray(intervals)) return 0;

  return intervals.reduce((total, interval) => {
    const repetitions =
      typeof interval.repetitions === "number" && interval.repetitions > 0
        ? interval.repetitions
        : 1;
    return total + interval.steps.length * repetitions;
  }, 0);
}

export function formatActivityPlanDuration(params: {
  estimatedDuration?: number | null;
  estimatedDurationMinutes?: number | null;
}): string | null {
  const { estimatedDuration, estimatedDurationMinutes } = params;

  if (typeof estimatedDuration === "number" && estimatedDuration > 0) {
    return formatDurationSec(Math.round(estimatedDuration));
  }

  if (typeof estimatedDurationMinutes === "number" && estimatedDurationMinutes > 0) {
    return `${Math.round(estimatedDurationMinutes)} min`;
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
    <View className="rounded-lg bg-muted/30 px-2.5 py-2">
      <View className="flex-row justify-between gap-2">
        <MetricCell label="Duration" value={durationLabel || "--"} />
        <MetricCell
          label="TSS"
          value={
            typeof estimatedTss === "number" && Number.isFinite(estimatedTss) && estimatedTss > 0
              ? `${Math.round(estimatedTss)}`
              : "--"
          }
        />
        <MetricCell
          label="Intensity"
          value={
            typeof intensityFactor === "number" &&
            Number.isFinite(intensityFactor) &&
            intensityFactor > 0
              ? intensityFactor.toFixed(2)
              : "--"
          }
        />
        <MetricCell label="Steps" value={`${stepCount}`} />
      </View>
    </View>
  );
}

export function ActivityPlanSummary({
  activityCategory,
  description,
  estimatedDuration,
  estimatedDurationMinutes,
  estimatedTss,
  headerAccessory,
  intensityFactor,
  routeName,
  routeProvided,
  structure,
  subtitle,
  testID,
  title,
  variant = "embedded",
}: ActivityPlanSummaryProps) {
  const categoryLabel = formatActivityCategoryLabel(activityCategory);
  const routeLabel = routeName?.trim() || (routeProvided ? "Route included" : null);
  const activityConfig = activityCategory
    ? activityCategory.includes("_")
      ? getActivityConfig(activityCategory)
      : getActivityCategoryConfig(activityCategory)
    : getActivityCategoryConfig("other");

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
          {categoryLabel || routeLabel ? (
            <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {categoryLabel ? (
                <View className="flex-row items-center gap-1">
                  <Icon as={activityConfig.icon} size={12} className={activityConfig.color} />
                  <Text className="text-xs text-muted-foreground">{categoryLabel}</Text>
                </View>
              ) : null}
              {routeLabel ? (
                <Text className="text-xs text-muted-foreground">{routeLabel}</Text>
              ) : null}
            </View>
          ) : null}
          {description?.trim() ? (
            <Text className="text-sm leading-5 text-muted-foreground">{description.trim()}</Text>
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
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
