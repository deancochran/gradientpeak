import React, { memo } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import {
  Activity,
  Clock,
  Heart,
  Zap,
  TrendingUp,
  Target,
} from "lucide-react-native";
import { ActivityPlanStructure, IntensityTarget } from "@repo/core";

// ================================
// Workout Graph Component
// ================================

interface WorkoutGraphProps {
  structure: ActivityPlanStructure;
  currentStep?: number;
  onStepPress?: (stepIndex: number) => void;
  className?: string;
}
export const WorkoutGraph = memo<WorkoutGraphProps>(function WorkoutGraph({
  structure,
  currentStep,
  onStepPress,
  className = "h-24",
}: WorkoutGraphProps) {
  const profileData = extractWorkoutProfile(structure);
  const totalDuration = profileData.reduce(
    (sum, step) => sum + step.duration,
    0,
  );

  if (profileData.length === 0) {
    return (
      <View className={`bg-muted/30 rounded-lg p-4 ${className}`}>
        <Text className="text-center text-muted-foreground">
          No workout data
        </Text>
      </View>
    );
  }

  return (
    <View className={`bg-muted/30 rounded-lg p-2 ${className}`}>
      <View className="flex-row justify-between items-center mb-2">
        <Text className="text-xs font-medium">Workout Profile</Text>
        <Text className="text-xs text-muted-foreground">
          {formatDurationCompact(totalDuration)}
        </Text>
      </View>

      <View className="flex-1 flex-row items-end overflow-hidden rounded">
        {profileData.map((step, index) => {
          const width = Math.max(2, (step.duration / totalDuration) * 100);
          const height = Math.max(
            20,
            Math.min(100, (step.intensity / 120) * 100),
          ); // Scale to 120% FTP max
          const isCurrentStep = currentStep === index;

          return (
            <Pressable
              key={index}
              style={{
                width: `${width}%`,
                height: `${height}%`,
                marginRight: 1,
                opacity: isCurrentStep ? 1 : 0.8,
              }}
              className={`rounded-sm ${isCurrentStep ? "ring-2 ring-blue-500" : ""}`}
              onPress={() => onStepPress?.(index)}
            >
              <View
                className="flex-1 rounded-sm"
                style={{ backgroundColor: step.color }}
              >
                {/* Step indicator for current step */}
                {isCurrentStep && (
                  <View className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                    <View className="w-2 h-2 bg-blue-500 rounded-full" />
                  </View>
                )}

                {/* Step name for wider steps */}
                {width > 8 && step.name && (
                  <Text
                    className="text-xs text-white text-center px-1"
                    numberOfLines={1}
                    style={{ fontSize: Math.max(8, Math.min(10, width / 2)) }}
                  >
                    {step.name}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row justify-between mt-1">
        <Text className="text-xs text-muted-foreground">0:00</Text>
        <Text className="text-xs text-muted-foreground">
          {formatDurationCompact(totalDuration)}
        </Text>
      </View>
    </View>
  );
});

WorkoutGraph.displayName = "WorkoutGraph";

// ================================
// Workout Progress Graph (Mini version)
// ================================

interface WorkoutProgressGraphProps {
  structure: ActivityPlanStructure;
  currentStep: number;
  className?: string;
}

export const WorkoutProgressGraph = memo<WorkoutProgressGraphProps>(
  function WorkoutProgressGraph({
    structure,
    currentStep,
    className = "h-12",
  }: WorkoutProgressGraphProps) {
    const profileData = extractWorkoutProfile(structure);

    return (
      <View className={`bg-muted/20 rounded-md p-1 ${className}`}>
        <View className="flex-1 flex-row items-end">
          {profileData.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;

            let opacity = 0.3;
            if (isCompleted) opacity = 0.8;
            if (isCurrent) opacity = 1;

            return (
              <View
                key={index}
                className="flex-1 mx-0.5 rounded-sm"
                style={{
                  backgroundColor: step.color,
                  opacity,
                  height: isCurrent ? "100%" : "70%",
                }}
              />
            );
          })}
        </View>
      </View>
    );
  },
);

WorkoutProgressGraph.displayName = "WorkoutProgressGraph";

// ================================
// Workout Metrics Grid
// ================================

interface MetricCardProps {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  subtitle?: string;
  color?: string;
}

const MetricCard = memo<MetricCardProps>(function MetricCard({
  icon: IconComponent,
  label,
  value,
  subtitle,
  color = "text-muted-foreground",
}: MetricCardProps) {
  return (
    <View className="bg-muted/30 rounded-lg p-3">
      <View className="flex-row items-center gap-2 mb-1">
        <Icon as={IconComponent} size={16} className={color} />
        <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </Text>
      </View>
      <Text className="text-lg font-semibold">{value}</Text>
      {subtitle && (
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      )}
    </View>
  );
});

MetricCard.displayName = "MetricCard";

interface WorkoutMetricsGridProps {
  structure: ActivityPlanStructure;
}

export const WorkoutMetricsGrid = memo<WorkoutMetricsGridProps>(
  function WorkoutMetricsGrid({ structure }) {
    const stats = calculateWorkoutStats(structure);

    return (
      <View className="gap-3 mb-4">
        <Text className="text-sm font-medium mb-2">Workout Overview</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <MetricCard
              icon={Clock}
              label="Duration"
              value={formatDurationCompact(stats.totalDuration)}
              color="text-blue-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={Activity}
              label="Steps"
              value={stats.totalSteps.toString()}
              subtitle={`${stats.intervalCount} intervals`}
              color="text-green-500"
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricCard
              icon={Zap}
              label="Avg Power"
              value={`${Math.round(stats.avgPower)}%`}
              subtitle="FTP target"
              color="text-yellow-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={TrendingUp}
              label="Est. TSS"
              value={`${Math.round(stats.estimatedTSS)}`}
              subtitle={`~${Math.round(stats.estimatedCalories)} cal`}
              color="text-purple-500"
            />
          </View>
        </View>
      </View>
    );
  },
);

WorkoutMetricsGrid.displayName = "WorkoutMetricsGrid";

// ================================
// Target Metrics Display
// ================================

interface TargetZoneIndicatorProps {
  target: IntensityTarget;
  current?: number;
}

const TargetZoneIndicator = memo<TargetZoneIndicatorProps>(
  function TargetZoneIndicator({ target, current }) {
    const minVal = target.min || (target.target ? target.target * 0.95 : 0);
    const maxVal = target.max || (target.target ? target.target * 1.05 : 100);
    const targetVal = target.target || (minVal + maxVal) / 2;

    const range = maxVal - minVal;
    const currentPercent = current
      ? Math.min(100, Math.max(0, ((current - minVal) / range) * 100))
      : 0;
    const targetPercent = ((targetVal - minVal) / range) * 100;

    return (
      <View className="relative">
        {/* Background bar */}
        <View className="h-2 bg-muted rounded-full overflow-hidden">
          {/* Target zone */}
          <View
            className="absolute h-full bg-green-200 rounded-full"
            style={{
              left: "0%",
              width: "100%",
            }}
          />

          {/* Target value indicator */}
          <View
            className="absolute h-full w-1 bg-green-600 rounded-full"
            style={{ left: `${targetPercent}%` }}
          />

          {/* Current value indicator */}
          {current && (
            <View
              className="absolute h-full w-2 bg-blue-600 rounded-full shadow-md"
              style={{ left: `${Math.max(0, currentPercent - 1)}%` }}
            />
          )}
        </View>

        {/* Value labels */}
        <View className="flex-row justify-between mt-1">
          <Text className="text-xs text-muted-foreground">
            {Math.round(minVal)}
          </Text>
          <Text className="text-xs text-muted-foreground">
            {Math.round(maxVal)}
          </Text>
        </View>
      </View>
    );
  },
);

TargetZoneIndicator.displayName = "TargetZoneIndicator";

interface TargetMetricsCardProps {
  target: IntensityTarget;
  current?: number;
}

const TargetMetricsCard = memo<TargetMetricsCardProps>(
  function TargetMetricsCard({ target, current }) {
    const isInRange = current ? isValueInTargetRange(current, target) : false;
    const adherence = current ? calculateAdherence(current, target) : 0;
    const targetDisplay = formatTargetRange(target);
    const guidanceText = getTargetGuidanceText(target, current);

    const getMetricIcon = (type: string) => {
      switch (type) {
        case "%FTP":
        case "watts":
          return Zap;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          return Heart;
        case "cadence":
          return TrendingUp;
        default:
          return Target;
      }
    };

    const borderColor = isInRange
      ? "border-green-500"
      : current
        ? "border-yellow-500"
        : "border-muted";

    const bgColor = isInRange
      ? "bg-green-50"
      : current
        ? "bg-yellow-50"
        : "bg-background";

    return (
      <View className={`p-3 rounded-lg border-2 ${borderColor} ${bgColor}`}>
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center gap-2">
            <Icon
              as={getMetricIcon(target.type)}
              size={18}
              className={isInRange ? "text-green-600" : "text-muted-foreground"}
            />
            <Text className="text-sm font-medium">
              {getMetricDisplayName(target.type)}
            </Text>
          </View>

          <View className="text-right">
            <Text
              className={`text-xl font-bold ${
                isInRange
                  ? "text-green-600"
                  : current
                    ? "text-yellow-600"
                    : "text-muted-foreground"
              }`}
            >
              {current ? formatMetricValue(current, target.type) : "--"}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Target: {targetDisplay}
            </Text>
          </View>
        </View>

        {/* Target zone indicator */}
        <TargetZoneIndicator target={target} current={current} />

        {/* Adherence percentage */}
        {current && (
          <View className="flex-row justify-between items-center mt-2">
            <Text
              className={`text-xs ${
                isInRange ? "text-green-600" : "text-muted-foreground"
              }`}
            >
              {guidanceText}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {Math.round(adherence)}% adherence
            </Text>
          </View>
        )}
      </View>
    );
  },
);

TargetMetricsCard.displayName = "TargetMetricsCard";

interface TargetMetricsGridProps {
  targets?: IntensityTarget[];
  currentMetrics: {
    heartRate?: number;
    power?: number;
    cadence?: number;
    speed?: number;
  };
}

export const TargetMetricsGrid = memo<TargetMetricsGridProps>(
  function TargetMetricsGrid({
    targets,
    currentMetrics,
  }: TargetMetricsGridProps) {
    if (!targets || targets.length === 0) {
      return (
        <View className="p-4 bg-muted/20 rounded-lg">
          <Text className="text-center text-muted-foreground">
            No targets for this step
          </Text>
        </View>
      );
    }

    const getCurrentValue = (targetType: string): number | undefined => {
      switch (targetType) {
        case "%FTP":
        case "watts":
          return currentMetrics.power;
        case "%MaxHR":
        case "%ThresholdHR":
        case "bpm":
          return currentMetrics.heartRate;
        case "cadence":
          return currentMetrics.cadence;
        case "speed":
          return currentMetrics.speed;
        default:
          return undefined;
      }
    };

    return (
      <View className="gap-3">
        <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Targets & Current
        </Text>
        {targets.map((target, index) => (
          <TargetMetricsCard
            key={`${target.type}-${index}`}
            target={target}
            current={getCurrentValue(target.type)}
          />
        ))}
      </View>
    );
  },
);

TargetMetricsGrid.displayName = "TargetMetricsGrid";

// ================================
// Step Preview Components
// ================================

interface StepPreviewCardProps {
  step: WorkoutProfilePoint;
  isUpcoming?: boolean;
  showDuration?: boolean;
}

const StepPreviewCard = memo<StepPreviewCardProps>(function StepPreviewCard({
  step,
  isUpcoming = false,
  showDuration = true,
}: StepPreviewCardProps) {
  return (
    <View
      className={`p-3 rounded-lg border ${
        isUpcoming ? "border-blue-200 bg-blue-50" : "border-muted bg-background"
      }`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text
            className={`text-sm font-medium ${
              isUpcoming ? "text-blue-800" : "text-foreground"
            }`}
          >
            {step.name}
          </Text>
          {step.description && (
            <Text className="text-xs text-muted-foreground mt-1">
              {step.description}
            </Text>
          )}
        </View>

        {showDuration && (
          <View className="ml-2">
            <Text className="text-xs text-muted-foreground">
              {formatDurationCompact(step.duration)}
            </Text>
          </View>
        )}
      </View>

      {/* Intensity indicator */}
      <View className="flex-row items-center gap-2 mb-2">
        <View
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: step.color }}
        />
        <Text className="text-xs text-muted-foreground">
          {step.intensityType && step.intensity > 0
            ? `${Math.round(step.intensity)}% ${step.intensityType.replace("%", "")}`
            : "Recovery"}
        </Text>
      </View>

      {/* Targets preview */}
      {step.targets && step.targets.length > 0 && (
        <View className="flex-row flex-wrap gap-2">
          {step.targets.map((target, index) => (
            <View key={index} className="px-2 py-1 bg-muted/50 rounded-md">
              <Text className="text-xs text-muted-foreground">
                {getMetricDisplayName(target.type)}: {formatTargetRange(target)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
});

StepPreviewCard.displayName = "StepPreviewCard";

interface StepBreakdownProps {
  steps: WorkoutProfilePoint[];
  maxSteps?: number;
  showAll?: boolean;
  title?: string;
}

export const StepBreakdown = memo<StepBreakdownProps>(function StepBreakdown({
  steps,
  maxSteps = 5,
  showAll = false,
  title = "Step Breakdown",
}: StepBreakdownProps) {
  const displaySteps = showAll ? steps : steps.slice(0, maxSteps);
  const remainingCount = steps.length - displaySteps.length;

  return (
    <View className="mb-4">
      <Text className="text-sm font-medium mb-3">{title}</Text>
      <View className="gap-3">
        {displaySteps.map((step, index) => (
          <StepPreviewCard key={step.index} step={step} showDuration={true} />
        ))}
      </View>

      {remainingCount > 0 && (
        <View className="mt-3 p-3 bg-muted/20 rounded-lg">
          <Text className="text-center text-sm text-muted-foreground">
            ... and {remainingCount} more steps
          </Text>
        </View>
      )}
    </View>
  );
});

StepBreakdown.displayName = "StepBreakdown";

interface UpcomingStepsPreviewProps {
  steps: WorkoutProfilePoint[];
  title?: string;
}

export const UpcomingStepsPreview = memo<UpcomingStepsPreviewProps>(
  function UpcomingStepsPreview({
    steps,
    title = "Coming Up Next",
  }: UpcomingStepsPreviewProps) {
    if (steps.length === 0) {
      return null;
    }

    return (
      <View className="mb-4">
        <Text className="text-sm font-medium mb-3">{title}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="gap-3"
        >
          <View className="flex-row gap-3 px-1">
            {steps.map((step, index) => (
              <View key={step.index} className="w-64">
                <StepPreviewCard
                  step={step}
                  isUpcoming={true}
                  showDuration={true}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  },
);

UpcomingStepsPreview.displayName = "UpcomingStepsPreview";
