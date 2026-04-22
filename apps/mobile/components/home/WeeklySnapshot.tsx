import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface WeeklySnapshotProps {
  distance: number;
  workouts: number;
  totalTSS: number;
  plannedTSS?: number;
  plannedDistance?: number;
  plannedWorkouts?: number;
  onPress?: () => void;
}

const WeeklySnapshot: React.FC<WeeklySnapshotProps> = ({
  distance,
  workouts,
  totalTSS,
  plannedTSS,
  plannedDistance,
  plannedWorkouts,
  onPress,
}) => {
  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.7}>
      <View className="rounded-xl border border-border bg-card px-4 py-4">
        <View className="flex-row items-center justify-between">
          <MetricColumn label="TSS" planned={plannedTSS} value={`${totalTSS}`} />
          <View className="h-12 w-px bg-border" />
          <MetricColumn
            label="Miles"
            planned={
              plannedDistance !== undefined && plannedDistance > 0
                ? plannedDistance.toFixed(1)
                : undefined
            }
            value={`${distance}`}
          />
          <View className="h-12 w-px bg-border" />
          <MetricColumn label="Workouts" planned={plannedWorkouts} value={`${workouts}`} />
        </View>
      </View>
    </CardWrapper>
  );
};

function MetricColumn({
  label,
  planned,
  value,
}: {
  label: string;
  planned?: number | string;
  value: string;
}) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl font-semibold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">{label}</Text>
      {planned !== undefined && planned !== null ? (
        <Text className="mt-0.5 text-[10px] text-muted-foreground">/ {planned}</Text>
      ) : null}
    </View>
  );
}

export default WeeklySnapshot;
