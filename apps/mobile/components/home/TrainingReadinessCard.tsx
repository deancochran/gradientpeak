import { Text } from "@repo/ui/components/text";
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
      <View className="gap-3 rounded-xl border border-border bg-card px-4 py-4">
        <View className="flex-row items-center justify-between">
          <ReadinessMetric code="CTL" label="Fitness" value={`${ctl}`} />
          <View className="h-12 w-px bg-border" />
          <ReadinessMetric code="ATL" label="Fatigue" value={`${atl}`} />
          <View className="h-12 w-px bg-border" />
          <ReadinessMetric code="TSB" label="Form" value={`${tsb > 0 ? "+" : ""}${tsb}`} />
        </View>

        <Text className="border-t border-border pt-2 text-center text-xs text-muted-foreground">
          <Text className={getFormStatusColor(form)}>{getFormStatusText(form)}</Text>
          {" · "}
          {getReadinessText(form)}
        </Text>
      </View>
    </CardWrapper>
  );
}

function ReadinessMetric({ code, label, value }: { code: string; label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl font-semibold text-foreground">{value}</Text>
      <Text className="mt-0.5 text-xs text-muted-foreground">{label}</Text>
      <Text className="text-[10px] text-muted-foreground">{code}</Text>
    </View>
  );
}
