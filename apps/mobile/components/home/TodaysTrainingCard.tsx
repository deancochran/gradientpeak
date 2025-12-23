import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Activity, Calendar, Heart } from "lucide-react-native";

interface TodaysTrainingCardProps {
  todaysActivity: {
    title: string;
    type: string;
    distance: number;
    duration: number;
    description?: string;
  } | null;
  onStartActivity: () => void;
  onViewPlan: () => void;
}

const TodaysTrainingCard: React.FC<TodaysTrainingCardProps> = ({
  todaysActivity,
  onStartActivity,
  onViewPlan,
}) => {
  const isRestDay =
    todaysActivity?.type?.toLowerCase().includes("rest") ||
    todaysActivity?.title?.toLowerCase().includes("rest");

  // No Activity Scheduled State
  if (!todaysActivity) {
    return (
      <View className="bg-card p-4 rounded-xl shadow-sm">
        <View className="items-center py-2">
          <View className="bg-muted p-2.5 rounded-full mb-2">
            <Calendar className="text-muted-foreground" size={20} />
          </View>
          <Text className="text-base font-bold text-foreground mb-1">
            No Activity Scheduled
          </Text>
          <Text
            className="text-xs text-muted-foreground text-center mb-3 px-2"
            numberOfLines={1}
          >
            Enjoy your free day or create a new training plan.
          </Text>
          <TouchableOpacity
            className="bg-muted px-4 py-2 rounded-lg"
            onPress={onViewPlan}
          >
            <Text className="text-foreground text-sm font-semibold">
              View Plan
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Rest Day State
  if (isRestDay) {
    return (
      <View className="bg-card p-4 rounded-xl shadow-sm">
        <View className="flex-row items-center mb-2">
          <View className="bg-green-500/10 p-2 rounded-full mr-2">
            <Heart className="text-green-500" size={18} />
          </View>
          <Text className="text-lg font-bold text-foreground">Rest Day</Text>
        </View>
        <Text
          className="text-sm text-muted-foreground leading-5 mb-3"
          numberOfLines={2}
        >
          {todaysActivity.description ||
            "Active recovery day. Focus on hydration, nutrition, and light stretching."}
        </Text>
        <TouchableOpacity
          className="border border-border bg-background px-4 py-2 rounded-lg items-center"
          onPress={onViewPlan}
        >
          <Text className="text-foreground text-sm font-semibold">
            View Full Week
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Active Training Day State
  const formatPace = (distance: number, duration: number) => {
    if (!distance || !duration) return null;
    const paceMinutes = duration / distance;
    const minutes = Math.floor(paceMinutes);
    const seconds = Math.round((paceMinutes - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}/mi`;
  };

  const targetPace = formatPace(
    todaysActivity.distance,
    todaysActivity.duration,
  );

  return (
    <View className="bg-card p-4 rounded-xl shadow-sm">
      {/* Header */}
      <View className="flex-row items-center mb-2">
        <View className="bg-primary/10 p-2 rounded-full mr-2">
          <Activity className="text-primary" size={18} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Today's Training
          </Text>
          <Text className="text-lg font-bold text-foreground" numberOfLines={1}>
            {todaysActivity.title}
          </Text>
        </View>
      </View>

      {/* Workout Details - Compact */}
      <View className="flex-row justify-between items-center mb-3 px-1">
        <View className="items-center">
          <Text className="text-xs text-muted-foreground mb-0.5">Distance</Text>
          <Text className="text-sm font-bold text-foreground">
            {todaysActivity.distance} mi
          </Text>
        </View>
        {targetPace && (
          <View className="items-center">
            <Text className="text-xs text-muted-foreground mb-0.5">Pace</Text>
            <Text className="text-sm font-bold text-foreground">
              {targetPace}
            </Text>
          </View>
        )}
        <View className="items-center">
          <Text className="text-xs text-muted-foreground mb-0.5">Duration</Text>
          <Text className="text-sm font-bold text-foreground">
            {todaysActivity.duration} min
          </Text>
        </View>
      </View>

      {/* CTA Button */}
      <TouchableOpacity
        className="bg-foreground py-2.5 rounded-lg items-center justify-center active:opacity-90"
        onPress={onStartActivity}
      >
        <Text className="text-background font-bold text-base">
          Start Activity
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default TodaysTrainingCard;
