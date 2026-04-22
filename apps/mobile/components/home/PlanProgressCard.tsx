import { Progress } from "@repo/ui/components/progress";
import { Target } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
      <View className="flex-row items-center mb-2">
        <Target className="mr-2 text-primary" size={16} />
        <View className="flex-1">
          <Text className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Active Plan
          </Text>
          <Text className="text-base font-bold text-foreground" numberOfLines={1}>
            {planName}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-xs text-muted-foreground">{date}</Text>
          <Text className="text-xs font-semibold text-foreground">{weeksOut}w out</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <Progress value={progress} className="h-2" />
    </Wrapper>
  );
};

export default PlanProgressCard;
