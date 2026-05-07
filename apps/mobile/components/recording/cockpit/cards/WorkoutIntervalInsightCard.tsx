import {
  formatIntensityTarget,
  getStepIntensityColor,
  type IntensityTargetV2,
  type IntervalStepV2,
} from "@repo/core/schemas";
import { Text } from "@repo/ui/components/text";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React from "react";
import { type DimensionValue, Pressable, ScrollView, View } from "react-native";
import { formatSeconds } from "./format";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

type TargetMetricCard = {
  key: string;
  label: string;
  target: string;
  tone: "neutral" | "good" | "warn" | "danger";
  unit: string | null;
  value: string;
};

type PlanProgressView =
  | {
      movingTime: number;
      duration: number;
      progress: number;
      requiresManualAdvance: boolean;
      canAdvance: boolean;
    }
  | null
  | undefined;

export function WorkoutIntervalInsightCard({ mode, plan, readings, service }: InsightCardProps) {
  const currentStepName = plan.currentStep?.name ?? "Workout cue";
  const progress = plan.progress?.progress;
  const allSteps = service?.allSteps ?? [];
  const stepIndex = plan.hasPlan && typeof plan.stepIndex === "number" ? plan.stepIndex : 0;
  const stepCount =
    plan.hasPlan && typeof plan.stepCount === "number" ? plan.stepCount : allSteps.length;
  const canSkip = plan.hasPlan && plan.canSkip;
  const canGoBack = plan.hasPlan && plan.canGoBack;
  const compactStepDescription = plan.currentStep
    ? formatCompactStepDescription(plan.currentStep, service)
    : "No interval target";
  const currentStepNotes = plan.currentStep?.notes ?? plan.currentStep?.description ?? null;
  const targetMetricCards = plan.currentStep
    ? buildTargetMetricCards(plan.currentStep.targets, readings, service)
    : [];
  const remaining = getStepRemainingLabel(plan.progress);
  const nextStep = plan.hasPlan ? allSteps[stepIndex + 1] : undefined;
  const nextStepDescription = nextStep ? formatCompactStepDescription(nextStep, service) : null;
  const progressPercent = Math.max(0, Math.min(100, (progress ?? 0) * 100));
  const progressLabel = plan.progress?.requiresManualAdvance
    ? "Manual advance"
    : `${Math.round(progressPercent)}%`;

  if (mode === "compact") {
    return (
      <View className="h-full justify-between gap-2" testID="workout-interval-insight-card">
        <View>
          <View className="flex-row items-baseline justify-between gap-3">
            <Text className="flex-1 text-lg font-black text-foreground" numberOfLines={1}>
              {currentStepName}
            </Text>
            <Text className="text-xs font-bold text-muted-foreground" numberOfLines={1}>
              Step {stepIndex + 1} of {stepCount || 1}
            </Text>
          </View>
          <View className="mt-1 flex-row items-baseline justify-between gap-3">
            <Text
              className="flex-1 text-left text-xs font-bold text-muted-foreground"
              numberOfLines={1}
            >
              {plan.hasPlan ? compactStepDescription : "No plan"}
            </Text>
            {targetMetricCards.length > 0 ? (
              <View className="flex-1 flex-row items-baseline justify-end gap-1.5">
                {targetMetricCards.map((metric, index) => (
                  <React.Fragment key={metric.key}>
                    {index > 0 ? (
                      <Text className="text-[11px] font-semibold text-muted-foreground">·</Text>
                    ) : null}
                    <Text
                      className={`text-[11px] font-semibold ${getCompactTargetMetricClassName(metric.tone)}`}
                      numberOfLines={1}
                    >
                      {formatCompactTargetMetric(metric)}
                    </Text>
                  </React.Fragment>
                ))}
              </View>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <Text className="text-[10px] font-semibold text-muted-foreground" numberOfLines={1}>
            {remaining}
          </Text>
          <View className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${progressPercent}%` }}
              testID="activity-plan-interval-progress-bar"
            />
          </View>
          <Text className="text-[10px] font-bold text-muted-foreground" numberOfLines={1}>
            {progressLabel}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <PlanStepButton
            accessibilityLabel="Previous interval"
            disabled={!canGoBack}
            fullWidth
            icon="back"
            onPress={() => plan.hasPlan && plan.previous()}
          />
          <PlanStepButton
            accessibilityLabel="Skip interval"
            disabled={!canSkip}
            fullWidth
            icon="forward"
            onPress={() => plan.hasPlan && plan.skip()}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-4" testID="workout-interval-insight-card">
      <View>
        <ActivityPlanIntensityChart allSteps={allSteps} currentStepIndex={stepIndex} height={140} />
      </View>
      <View className="min-h-[300px] rounded-[32px] bg-muted/45 p-5">
        <Text className="text-3xl font-black text-foreground" numberOfLines={2}>
          {currentStepName}
        </Text>
        <View className="mt-3 flex-row items-baseline justify-between gap-4">
          <Text className="text-base font-bold text-muted-foreground" numberOfLines={1}>
            Step {stepIndex + 1} of {stepCount || 1}
          </Text>
          <Text
            className="flex-1 text-right text-base font-bold text-muted-foreground"
            numberOfLines={2}
          >
            {compactStepDescription}
          </Text>
        </View>
        {currentStepNotes ? (
          <Text
            className="mt-3 text-sm font-medium leading-5 text-muted-foreground"
            numberOfLines={3}
          >
            {currentStepNotes}
          </Text>
        ) : null}
        {targetMetricCards.length > 0 ? (
          <ScrollView
            horizontal
            className="mt-4 -mx-1"
            contentContainerStyle={{
              columnGap: 12,
              flexGrow: 1,
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
            showsHorizontalScrollIndicator={false}
            testID="activity-plan-target-metrics"
          >
            {targetMetricCards.map((metric) => (
              <MetricTile
                key={metric.key}
                label={metric.label}
                layout="target"
                target={metric.target}
                tone={metric.tone}
                unit={metric.unit}
                value={metric.value}
              />
            ))}
          </ScrollView>
        ) : null}
        <View className="mt-auto flex-row items-center gap-3 pt-5">
          <Text className="text-xs font-semibold text-muted-foreground" numberOfLines={1}>
            {remaining}
          </Text>
          <View className="h-4 flex-1 overflow-hidden rounded-full bg-background">
            <View
              className="h-full rounded-full bg-foreground"
              style={{ width: `${progressPercent}%` }}
              testID="activity-plan-interval-progress-bar"
            />
          </View>
          <Text className="text-xs font-bold text-muted-foreground" numberOfLines={1}>
            {progressLabel}
          </Text>
        </View>
      </View>
      {nextStep ? (
        <View className="flex-row items-baseline gap-2 px-1">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Next
          </Text>
          <Text className="flex-1 text-sm font-semibold text-muted-foreground" numberOfLines={1}>
            {nextStep.name ?? "Next interval"}
            {nextStepDescription ? ` · ${nextStepDescription}` : ""}
          </Text>
        </View>
      ) : null}
      <View className="mt-auto flex-row gap-2">
        <PlanStepButton
          accessibilityLabel="Previous interval"
          disabled={!canGoBack}
          fullWidth
          icon="back"
          large
          onPress={() => plan.hasPlan && plan.previous()}
        />
        <PlanStepButton
          accessibilityLabel="Skip interval"
          disabled={!canSkip}
          fullWidth
          icon="forward"
          large
          onPress={() => plan.hasPlan && plan.skip()}
        />
      </View>
    </View>
  );
}

function buildTargetMetricCards(
  targets: IntensityTargetV2[] | undefined,
  readings: InsightCardProps["readings"],
  service: InsightCardProps["service"],
): TargetMetricCard[] {
  return (targets ?? [])
    .map((target, index) => buildTargetMetricCard(target, index, readings, service))
    .filter((metric): metric is TargetMetricCard => metric !== null);
}

function buildTargetMetricCard(
  target: IntensityTargetV2,
  index: number,
  readings: InsightCardProps["readings"],
  service: InsightCardProps["service"],
): TargetMetricCard | null {
  switch (target.type) {
    case "%FTP": {
      const ftp = service?.getBaseFtp?.();
      const targetValue = ftp ? Math.round((target.intensity / 100) * ftp) : null;
      const current = readings.power ?? null;

      return {
        key: `power-${index}`,
        label: "Power",
        target: targetValue ? `${targetValue} W` : formatIntensityTarget(target),
        tone: getTargetTone(current, targetValue),
        unit: "W",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "watts": {
      const current = readings.power ?? null;
      return {
        key: `power-${index}`,
        label: "Power",
        target: `${Math.round(target.intensity)} W`,
        tone: getTargetTone(current, target.intensity),
        unit: "W",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "%ThresholdHR": {
      const thresholdHr = service?.getBaseThresholdHr?.();
      const targetValue = thresholdHr ? Math.round((target.intensity / 100) * thresholdHr) : null;
      const current = readings.heartRate ?? null;

      return {
        key: `heart-rate-${index}`,
        label: "HR",
        target: targetValue ? `${targetValue} bpm` : formatIntensityTarget(target),
        tone: getTargetTone(current, targetValue),
        unit: "bpm",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "%MaxHR": {
      const maxHr = service?.getBaseThresholdHr?.();
      const targetValue = maxHr ? Math.round((target.intensity / 100) * maxHr) : null;
      const current = readings.heartRate ?? null;

      return {
        key: `heart-rate-${index}`,
        label: "HR",
        target: targetValue ? `${targetValue} bpm` : formatIntensityTarget(target),
        tone: getTargetTone(current, targetValue),
        unit: "bpm",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "bpm": {
      const current = readings.heartRate ?? null;
      return {
        key: `heart-rate-${index}`,
        label: "HR",
        target: `${Math.round(target.intensity)} bpm`,
        tone: getTargetTone(current, target.intensity),
        unit: "bpm",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "cadence": {
      const current = readings.cadence ?? null;
      return {
        key: `cadence-${index}`,
        label: "Cadence",
        target: `${Math.round(target.intensity)} rpm`,
        tone: getTargetTone(current, target.intensity),
        unit: "rpm",
        value: current ? `${Math.round(current)}` : "--",
      };
    }
    case "speed": {
      const current = readings.speed ?? null;
      const currentKph = current ? current * 3.6 : null;
      const targetKph = target.intensity * 3.6;

      return {
        key: `speed-${index}`,
        label: "Speed",
        target: `${targetKph.toFixed(1)} km/h`,
        tone: getTargetTone(current, target.intensity),
        unit: "km/h",
        value: currentKph ? currentKph.toFixed(1) : "--",
      };
    }
    case "RPE":
      return {
        key: `rpe-${index}`,
        label: "RPE",
        target: `RPE ${target.intensity}/10`,
        tone: "neutral",
        unit: null,
        value: "--",
      };
  }
}

function getTargetTone(current: number | null, target: number | null): TargetMetricCard["tone"] {
  if (!current || !target || target <= 0) return "neutral";

  const low = target * 0.9;
  const high = target * 1.1;

  if (current < low) return "warn";
  if (current > high) return "danger";
  return "good";
}

function formatCompactMetricLabel(label: TargetMetricCard["label"]) {
  switch (label) {
    case "Power":
      return "PWR";
    case "Cadence":
      return "CAD";
    default:
      return label.toUpperCase();
  }
}

function formatCompactTargetMetric(metric: TargetMetricCard) {
  return `${formatCompactMetricLabel(metric.label)} ${metric.value}${metric.unit ?? ""}`;
}

function getCompactTargetMetricClassName(tone: TargetMetricCard["tone"]) {
  switch (tone) {
    case "good":
      return "text-emerald-600";
    case "warn":
      return "text-amber-600";
    case "danger":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

function formatCompactStepDescription(step: IntervalStepV2, service: InsightCardProps["service"]) {
  const duration = formatDurationShort(step.duration);

  if (!step.targets?.length) {
    return duration;
  }

  const targets = step.targets.map((target) => resolveReadableTarget(target, service)).join(", ");

  return `${duration} @ ${targets}`;
}

function resolveReadableTarget(target: IntensityTargetV2, service: InsightCardProps["service"]) {
  switch (target.type) {
    case "%FTP": {
      const ftp = service?.getBaseFtp?.();
      if (!ftp) return formatIntensityTarget(target);
      return `${Math.round((target.intensity / 100) * ftp)}W`;
    }
    case "%ThresholdHR": {
      const thresholdHr = service?.getBaseThresholdHr?.();
      if (!thresholdHr) return formatIntensityTarget(target);
      return `${Math.round((target.intensity / 100) * thresholdHr)} bpm`;
    }
    case "%MaxHR":
      return formatIntensityTarget(target);
    case "watts":
      return `${Math.round(target.intensity)}W`;
    case "bpm":
      return `${Math.round(target.intensity)} bpm`;
    case "cadence":
      return `${Math.round(target.intensity)} rpm`;
    case "speed":
      return `${target.intensity.toFixed(1)} m/s`;
    case "RPE":
      return `RPE ${target.intensity}/10`;
  }
}

function formatDurationShort(duration: IntervalStepV2["duration"]) {
  switch (duration.type) {
    case "time":
      if (duration.seconds >= 3600) return `${(duration.seconds / 3600).toFixed(1)}h`;
      if (duration.seconds >= 60) return `${(duration.seconds / 60).toFixed(0)}m`;
      return `${duration.seconds}s`;
    case "distance":
      return duration.meters >= 1000
        ? `${(duration.meters / 1000).toFixed(1)}km`
        : `${duration.meters}m`;
    case "repetitions":
      return `${duration.count}x`;
    case "untilFinished":
      return "∞";
  }
}

function ActivityPlanIntensityChart({
  allSteps,
  currentStepIndex,
  fill = false,
  height,
}: {
  allSteps: IntervalStepV2[];
  currentStepIndex: number;
  fill?: boolean;
  height?: number;
}) {
  if (!allSteps.length) {
    return <View className="h-3 rounded-md bg-muted" />;
  }

  const isCompact = fill || (height ?? 0) <= 40;
  const verticalPadding = isCompact ? 4 : 10;
  const availableHeight = fill ? null : Math.max(1, (height ?? 0) - verticalPadding * 2);
  const minBarHeight = isCompact ? 4 : 8;
  const columnGap = allSteps.length > 32 ? 1 : 4;

  return (
    <View
      className={
        fill
          ? "min-h-16 flex-1 flex-row items-end overflow-hidden rounded-xl bg-muted/50 px-2"
          : "flex-row items-end overflow-hidden rounded-xl bg-muted/50 px-2"
      }
      testID="activity-plan-intensity-chart"
      style={fill ? { columnGap } : { columnGap, height }}
    >
      {allSteps.map((step, index) => {
        const intensity = step.targets?.[0]?.intensity ?? 50;
        const barHeight: DimensionValue = fill
          ? (`${Math.max(10, Math.min(100, intensity))}%` as DimensionValue)
          : Math.max(minBarHeight, (availableHeight ?? 1) * Math.min(1, intensity / 100));
        const isCurrent = index === currentStepIndex;

        return (
          <View
            key={`${step.name}-${index}`}
            className="flex-1 justify-end"
            style={{
              flexBasis: 0,
              height: fill ? ("100%" as DimensionValue) : (availableHeight ?? 1),
              marginVertical: verticalPadding,
              minWidth: 1,
            }}
          >
            {isCurrent ? <View className="mb-1 h-1 rounded-sm bg-foreground" /> : null}
            <View
              className={isCurrent ? "rounded-[3px] border-2 border-foreground" : "rounded-[3px]"}
              testID={isCurrent ? "activity-plan-current-interval" : undefined}
              style={{
                backgroundColor: getStepIntensityColor(step),
                height: barHeight,
                minHeight: minBarHeight,
                opacity: isCurrent ? 1 : 0.48,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

function getStepRemainingLabel(progress: PlanProgressView) {
  if (!progress) return "--";
  if (progress.requiresManualAdvance) return "Manual advance";

  return `${formatSeconds(Math.max(0, Math.ceil((progress.duration - progress.movingTime) / 1000)))} left`;
}

function PlanStepButton({
  accessibilityLabel,
  disabled,
  fullWidth = false,
  icon,
  large = false,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  fullWidth?: boolean;
  icon: "back" | "forward";
  large?: boolean;
  onPress: () => void;
}) {
  const Icon = icon === "back" ? ChevronLeft : ChevronRight;
  const shapeClassName = fullWidth ? "rounded-sm" : "rounded-full";
  const enabledClassName =
    icon === "back"
      ? `${shapeClassName} border border-border bg-muted active:opacity-80`
      : `${shapeClassName} bg-foreground active:opacity-80`;
  const iconClassName = disabled
    ? "text-muted-foreground"
    : icon === "back"
      ? "text-foreground"
      : "text-background";
  const labelClassName = disabled
    ? "text-sm font-bold text-muted-foreground"
    : icon === "back"
      ? "text-sm font-bold text-foreground"
      : "text-sm font-bold text-background";
  const label = icon === "back" ? "Back" : "Skip";

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        disabled
          ? `items-center justify-center ${shapeClassName} bg-muted${fullWidth ? " flex-1 flex-row gap-2" : ""}`
          : `items-center justify-center ${enabledClassName}${fullWidth ? " flex-1 flex-row gap-2" : ""}`
      }
      style={
        large
          ? { height: 56, width: fullWidth ? undefined : 72 }
          : { height: 36, width: fullWidth ? undefined : 48 }
      }
    >
      <Icon size={large ? 24 : 18} className={iconClassName} />
      {fullWidth ? <Text className={labelClassName}>{label}</Text> : null}
    </Pressable>
  );
}
