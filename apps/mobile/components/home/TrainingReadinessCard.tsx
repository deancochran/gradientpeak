import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface TrainingReadinessCardProps {
  ctl: number;
  atl: number;
  tsb: number;
  form: "fresh" | "optimal" | "neutral" | "tired" | "overreaching";
  onPress?: () => void;
}

export function TrainingReadinessCard({
  ctl,
  atl,
  tsb,
  form,
  onPress,
}: TrainingReadinessCardProps) {
  const getFormStatusText = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
        return "Fresh";
      case "optimal":
        return "Optimal";
      case "neutral":
        return "Neutral";
      case "tired":
        return "Tired";
      case "overreaching":
        return "Overreaching";
      default:
        return "Unknown";
    }
  };

  const getReadinessText = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
        return "Ready";
      case "optimal":
        return "Ready";
      case "neutral":
        return "Moderate";
      case "tired":
        return "Fatigued";
      case "overreaching":
        return "Rest";
      default:
        return "";
    }
  };

  const getFormStatusColor = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
      case "optimal":
        return "text-foreground";
      case "neutral":
        return "text-muted-foreground";
      case "tired":
        return "text-orange-600";
      case "overreaching":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper onPress={onPress} activeOpacity={0.7}>
      <Card className="bg-card border-border">
        <CardContent className="space-y-3">
          {/* Metrics Grid - Compact 3 columns */}
          <View className="flex-row items-center justify-between">
            {/* CTL - Fitness */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {ctl}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Fitness
              </Text>
              <Text className="text-[10px] text-muted-foreground">CTL</Text>
            </View>

            {/* Divider */}
            <View className="h-12 w-px bg-border" />

            {/* ATL - Fatigue */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {atl}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">
                Fatigue
              </Text>
              <Text className="text-[10px] text-muted-foreground">ATL</Text>
            </View>

            {/* Divider */}
            <View className="h-12 w-px bg-border" />

            {/* TSB - Form */}
            <View className="items-center flex-1">
              <Text className="text-2xl font-semibold text-foreground">
                {tsb > 0 ? "+" : ""}
                {tsb}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5">Form</Text>
              <Text className="text-[10px] text-muted-foreground">TSB</Text>
            </View>
          </View>

          {/* Status Line - Minimalist */}
          <View className="pt-2 border-t border-border">
            <Text className="text-xs text-center text-muted-foreground">
              <Text className={getFormStatusColor(form)}>
                {getFormStatusText(form)}
              </Text>
              {" · "}
              {getReadinessText(form)}
            </Text>
          </View>
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
