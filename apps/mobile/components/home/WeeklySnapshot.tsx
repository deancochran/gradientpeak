import { Card, CardContent } from "@/components/ui/card";
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
      <Card className="bg-card border-border">
        <CardContent>
          <View className="flex-row items-center justify-between">
            {/* TSS */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {totalTSS}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">TSS</Text>
              {plannedTSS !== undefined && plannedTSS > 0 && (
                <Text className="text-[10px] text-muted-foreground mt-0.5">
                  / {plannedTSS}
                </Text>
              )}
            </View>

            {/* Divider */}
            <View className="h-12 w-px bg-border" />

            {/* Distance */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {distance}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Miles
              </Text>
              {plannedDistance !== undefined && plannedDistance > 0 && (
                <Text className="text-[10px] text-muted-foreground mt-0.5">
                  / {plannedDistance.toFixed(1)}
                </Text>
              )}
            </View>

            {/* Divider */}
            <View className="h-12 w-px bg-border" />

            {/* Workouts */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {workouts}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Workouts
              </Text>
              {plannedWorkouts !== undefined && plannedWorkouts > 0 && (
                <Text className="text-[10px] text-muted-foreground mt-0.5">
                  / {plannedWorkouts}
                </Text>
              )}
            </View>
          </View>
        </CardContent>
      </Card>
    </CardWrapper>
  );
};

export default WeeklySnapshot;
