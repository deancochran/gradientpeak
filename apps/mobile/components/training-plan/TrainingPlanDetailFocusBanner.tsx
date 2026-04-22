import { Text } from "@repo/ui/components/text";
import React from "react";
import { TouchableOpacity, View } from "react-native";

interface TrainingPlanDetailFocusBannerProps {
  ctaLabel: string;
  description: string;
  onPress: () => void;
  title: string;
}

export function TrainingPlanDetailFocusBanner({
  ctaLabel,
  description,
  onPress,
  title,
}: TrainingPlanDetailFocusBannerProps) {
  return (
    <View className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
      <Text className="text-sm font-semibold text-primary">{title}</Text>
      <Text className="mt-1 text-xs text-muted-foreground">{description}</Text>
      <TouchableOpacity
        onPress={onPress}
        className="mt-2 self-start rounded-full bg-primary px-3 py-1.5"
        activeOpacity={0.8}
      >
        <Text className="text-xs font-semibold text-primary-foreground">{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
