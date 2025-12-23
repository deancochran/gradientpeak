import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Progress } from "@/components/ui/progress";
import { Target } from "lucide-react-native";

interface PlanProgressCardProps {
  planName: string;
  weeksOut: number;
  progress: number;
  date: string;
  onPress?: () => void;
}

const PlanProgressCard: React.FC<PlanProgressCardProps> = ({
  planName,
  weeksOut,
  progress,
  date,
  onPress,
}) => {
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper
      className="bg-card p-4 rounded-xl shadow-sm"
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {/* Header with Icon */}
      <View className="flex-row items-center mb-2">
        <View className="bg-primary/10 p-2 rounded-full mr-2">
          <Target className="text-primary" size={16} />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Active Plan
          </Text>
          <Text
            className="text-base font-bold text-foreground"
            numberOfLines={1}
          >
            {planName}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-muted-foreground">{date}</Text>
          <Text className="text-xs font-semibold text-foreground">
            {weeksOut}w out
          </Text>
        </View>
      </View>

      {/* Progress Bar */}
      <Progress value={progress} className="h-2" />
    </Wrapper>
  );
};

export default PlanProgressCard;
