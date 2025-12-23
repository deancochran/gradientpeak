import React, { useState } from "react";
import { View, TouchableOpacity } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { ChevronDown, ChevronUp } from "lucide-react-native";

interface WeeklyLedgerProps {
  totalDistance: number; // in km
  totalTime: number; // in minutes
  activityCount: number;
  unit?: "km" | "mi";
  defaultCollapsed?: boolean;
}

export function WeeklyLedger({
  totalDistance,
  totalTime,
  activityCount,
  unit = "mi",
  defaultCollapsed = true
}: WeeklyLedgerProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Convert km to miles if needed
  const displayDistance = unit === "mi"
    ? (totalDistance * 0.621371).toFixed(1)
    : totalDistance.toFixed(1);

  // Convert minutes to hours and minutes
  const hours = Math.floor(totalTime / 60);
  const minutes = totalTime % 60;
  const displayTime = hours > 0
    ? `${hours}h ${minutes}m`
    : `${minutes}m`;

  // Check if there's any data to show
  const hasData = totalDistance > 0 || totalTime > 0 || activityCount > 0;

  if (!hasData) {
    return null; // Don't show ledger if there's no data
  }

  return (
    <Card className="mt-4">
      <TouchableOpacity
        onPress={() => setIsCollapsed(!isCollapsed)}
        activeOpacity={0.7}
      >
        <CardContent className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-semibold text-base">This Week</Text>
            <Icon
              as={isCollapsed ? ChevronDown : ChevronUp}
              size={20}
              className="text-muted-foreground"
            />
          </View>

          {!isCollapsed && (
            <View className="mt-4 gap-3">
              {/* Distance */}
              <View className="flex-row items-center justify-between">
                <Text className="text-muted-foreground">Distance</Text>
                <Text className="font-semibold text-lg">
                  {displayDistance} {unit}
                </Text>
              </View>

              <View className="h-px bg-border" />

              {/* Time */}
              <View className="flex-row items-center justify-between">
                <Text className="text-muted-foreground">Time</Text>
                <Text className="font-semibold text-lg">
                  {displayTime}
                </Text>
              </View>

              <View className="h-px bg-border" />

              {/* Activity Count */}
              <View className="flex-row items-center justify-between">
                <Text className="text-muted-foreground">Activities</Text>
                <Text className="font-semibold text-lg">
                  {activityCount}
                </Text>
              </View>
            </View>
          )}
        </CardContent>
      </TouchableOpacity>
    </Card>
  );
}
