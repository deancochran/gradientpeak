import { resolveGoalReadinessViewModel } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

function formatReadinessPercent(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(value)}%`;
}

function getReadinessTone(viewModel: ReturnType<typeof resolveGoalReadinessViewModel>) {
  if (viewModel.band === "estimating") {
    return {
      color: "rgba(100, 116, 139, 0.85)",
      track: "rgba(148, 163, 184, 0.3)",
      fill: "#f1f5f9",
    };
  }

  if (viewModel.band === "above_target_range") {
    return {
      color: "rgba(22, 163, 74, 0.95)",
      track: "rgba(187, 247, 208, 0.75)",
      fill: "#f0fdf4",
    };
  }

  if (viewModel.band === "in_target_range") {
    return {
      color: "rgba(37, 99, 235, 0.95)",
      track: "rgba(191, 219, 254, 0.85)",
      fill: "#eff6ff",
    };
  }

  if (viewModel.band === "building_toward_target") {
    return {
      color: "rgba(217, 119, 6, 0.95)",
      track: "rgba(253, 230, 138, 0.9)",
      fill: "#fffbeb",
    };
  }

  return {
    color: "rgba(220, 38, 38, 0.95)",
    track: "rgba(254, 202, 202, 0.9)",
    fill: "#fef2f2",
  };
}

export function GoalReadinessRing({
  value,
  target,
}: {
  value: number | null;
  target?: number | null;
}) {
  const size = 54;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : null;
  const isLoadingValue = numericValue === null;
  const progress = numericValue === null ? 0 : Math.max(0, Math.min(100, numericValue));
  const visualProgress = progress > 0 && progress < 100 ? Math.max(progress, 1) : progress;
  const strokeDashoffset = circumference - (visualProgress / 100) * circumference;
  const viewModel = resolveGoalReadinessViewModel({ value: numericValue, target });
  const tone = getReadinessTone(viewModel);
  const percentLabel = formatReadinessPercent(numericValue);

  return (
    <View className="w-[64px] items-center" testID="goal-readiness-ring">
      <View
        className="relative h-[54px] w-[54px] items-center justify-center rounded-full bg-muted/30"
        accessibilityLabel={
          isLoadingValue ? "Goal readiness estimating" : `Goal readiness ${percentLabel}`
        }
        accessibilityRole="image"
      >
        <Svg height={size} width={size} className="absolute">
          <Circle cx={size / 2} cy={size / 2} r={radius + strokeWidth / 2} fill={tone.fill} />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tone.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tone.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          {isLoadingValue ? <View className="h-2 w-5 rounded-full bg-muted-foreground/30" /> : null}
          {percentLabel ? (
            <Text className="text-center text-xs font-semibold text-foreground">
              {percentLabel}
            </Text>
          ) : null}
        </View>
      </View>
      <Text className="mt-1 text-center text-[10px] font-semibold" style={{ color: tone.color }}>
        {viewModel.label}
      </Text>
    </View>
  );
}
