import {
  formatIntensityTarget,
  formatStepTargets,
  getStepIntensityColor,
  type IntensityTargetV2,
  type IntervalStepV2,
} from "@repo/core/schemas";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { type DimensionValue, Pressable, View } from "react-native";
import { formatSeconds } from "./format";
import { MetricTile } from "./MetricTile";
import type { InsightCardProps } from "./types";

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

export function WorkoutIntervalInsightCard({
  mode,
  plan,
  readings,
  service,
  stats,
}: InsightCardProps) {
  const currentStepName = plan.currentStep?.name ?? "Workout cue";
  const progress = plan.progress?.progress;
  const allSteps = service?.allSteps ?? [];
  const stepIndex = plan.hasPlan && typeof plan.stepIndex === "number" ? plan.stepIndex : 0;
  const stepCount =
    plan.hasPlan && typeof plan.stepCount === "number" ? plan.stepCount : allSteps.length;
  const canSkip = plan.hasPlan && plan.canSkip;
  const canGoBack = plan.hasPlan && plan.canGoBack;
  const target = plan.currentStep ? formatStepTargets(plan.currentStep) : "No target";
  const compactStepDescription = plan.currentStep
    ? formatCompactStepDescription(plan.currentStep, service)
    : "No interval target";
  const compactCurrentMetrics = plan.currentStep
    ? formatCurrentTargetMetrics(plan.currentStep, readings)
    : null;
  const remaining = getStepRemainingLabel(plan.progress);
  const nextStep = plan.hasPlan ? allSteps[stepIndex + 1] : undefined;

  if (mode === "compact") {
    return (
      <View className="h-full justify-between gap-3" testID="workout-interval-insight-card">
        <ActivityPlanIntensityChart allSteps={allSteps} currentStepIndex={stepIndex} fill />
        <View className="flex-row items-baseline gap-2">
          <View className="flex-1">
            <Text className="text-base font-bold text-foreground" numberOfLines={1}>
              {currentStepName}
            </Text>
          </View>
          <View className="max-w-[60%] flex-row items-baseline justify-end gap-1.5">
            <Text
              className="shrink text-right text-xs font-semibold text-muted-foreground"
              numberOfLines={1}
            >
              {plan.hasPlan ? compactStepDescription : "No plan"}
            </Text>
            {compactCurrentMetrics ? (
              <Text className="text-right text-[10px] font-black text-foreground" numberOfLines={1}>
                {compactCurrentMetrics}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <PlanStepButton
            disabled={!canGoBack}
            label="Back"
            onPress={() => plan.hasPlan && plan.previous()}
          />
          <View className="flex-1 gap-1">
            <View className="h-2 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full bg-foreground"
                style={{ width: `${Math.max(0, Math.min(100, (progress ?? 0) * 100))}%` }}
              />
            </View>
            <Text
              className="text-center text-[10px] font-semibold text-muted-foreground"
              numberOfLines={1}
            >
              {remaining} • Step {stepIndex + 1} / {stepCount || 1}
            </Text>
          </View>
          <PlanStepButton
            disabled={!canSkip}
            label="Skip"
            onPress={() => plan.hasPlan && plan.skip()}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-5" testID="workout-interval-insight-card">
      <View>
        <ActivityPlanIntensityChart allSteps={allSteps} currentStepIndex={stepIndex} height={140} />
      </View>
      <View className="rounded-[32px] bg-muted/45 p-5">
        <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Current Interval
        </Text>
        <Text className="mt-2 text-3xl font-black text-foreground" numberOfLines={2}>
          {currentStepName}
        </Text>
        <Text className="mt-2 text-base font-semibold text-muted-foreground">
          {target} • {remaining}
        </Text>
      </View>
      <View className="flex-row gap-3">
        <MetricTile label="Elapsed" value={formatSeconds(stats.duration ?? 0)} />
        <MetricTile
          label="Step"
          value={typeof progress === "number" ? `${Math.round(progress * 100)}%` : "--"}
        />
        <MetricTile
          label="Power"
          value={readings.power ? `${Math.round(readings.power)} W` : "--"}
        />
      </View>
      {nextStep ? (
        <View className="rounded-[32px] border border-border p-5">
          <Text className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Next Up
          </Text>
          <Text className="mt-2 text-xl font-black text-foreground" numberOfLines={2}>
            {nextStep.name ?? "Next interval"}
          </Text>
          <Text className="mt-2 text-base font-semibold text-muted-foreground">
            {formatStepTargets(nextStep)}
          </Text>
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <PlanStepButton
          disabled={!canGoBack}
          label="Back"
          onPress={() => plan.hasPlan && plan.previous()}
        />
        <PlanStepButton
          disabled={!canSkip}
          label="Skip interval"
          onPress={() => plan.hasPlan && plan.skip()}
        />
      </View>
    </View>
  );
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

function formatCurrentTargetMetrics(step: IntervalStepV2, readings: InsightCardProps["readings"]) {
  const metrics: string[] = [];
  const targetTypes = new Set(step.targets?.map((target) => target.type) ?? []);

  if ((targetTypes.has("%FTP") || targetTypes.has("watts")) && readings.power) {
    metrics.push(`${Math.round(readings.power)}W`);
  }

  if (
    (targetTypes.has("%ThresholdHR") || targetTypes.has("%MaxHR") || targetTypes.has("bpm")) &&
    readings.heartRate
  ) {
    metrics.push(`${Math.round(readings.heartRate)} bpm`);
  }

  if (targetTypes.has("cadence") && readings.cadence) {
    metrics.push(`${Math.round(readings.cadence)} rpm`);
  }

  if (targetTypes.has("speed") && readings.speed) {
    metrics.push(`${readings.speed.toFixed(1)} m/s`);
  }

  return metrics.length ? metrics.join(" · ") : null;
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
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={
        disabled
          ? "rounded-full bg-muted px-4 py-2"
          : "rounded-full bg-foreground px-4 py-2 active:opacity-80"
      }
    >
      <Text
        className={
          disabled ? "text-xs font-bold text-muted-foreground" : "text-xs font-bold text-background"
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
