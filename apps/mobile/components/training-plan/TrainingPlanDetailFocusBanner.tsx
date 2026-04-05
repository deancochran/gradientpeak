import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { TouchableOpacity } from "react-native";

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
    <Card className="border-primary/40 bg-primary/5 mb-4">
      <CardContent className="p-3">
        <Text className="text-sm text-primary font-semibold">{title}</Text>
        <Text className="text-xs text-muted-foreground mt-1">{description}</Text>
        <TouchableOpacity
          onPress={onPress}
          className="self-start mt-2 px-3 py-1.5 rounded-full bg-primary"
          activeOpacity={0.8}
        >
          <Text className="text-xs font-semibold text-primary-foreground">{ctaLabel}</Text>
        </TouchableOpacity>
      </CardContent>
    </Card>
  );
}
