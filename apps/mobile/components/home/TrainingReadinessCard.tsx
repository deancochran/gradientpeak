import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import React from "react";
import { View } from "react-native";

interface TrainingReadinessCardProps {
  ctl: number;
  atl: number;
  tsb: number;
  form: "fresh" | "optimal" | "neutral" | "tired" | "overreaching";
}

export function TrainingReadinessCard({
  ctl,
  atl,
  tsb,
  form,
}: TrainingReadinessCardProps) {
  const getFormStatusColor = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
        return "text-green-600";
      case "optimal":
        return "text-blue-600";
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

  const getFormEmoji = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
        return "🌟";
      case "optimal":
        return "💪";
      case "neutral":
        return "➡️";
      case "tired":
        return "😓";
      case "overreaching":
        return "⚠️";
      default:
        return "📊";
    }
  };

  const getFormDescription = (formStatus: string): string => {
    switch (formStatus) {
      case "fresh":
        return "Well rested, ready to race";
      case "optimal":
        return "Peak performance zone";
      case "neutral":
        return "Balanced training state";
      case "tired":
        return "Productive fatigue, recovery needed";
      case "overreaching":
        return "High fatigue, risk of overtraining";
      default:
        return "";
    }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="w-full flex flex-row items-center justify-between">
          <Text className="text-lg text-muted-foreground">Training Status</Text>
          <Text className="text-2xl">{getFormEmoji(form)}</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form Status Display */}
        <View className="items-center py-2">
          <Text
            className={`text-4xl font-bold capitalize ${getFormStatusColor(form)}`}
          >
            {form}
          </Text>
          <Text className="text-sm text-muted-foreground mt-1 text-center">
            {getFormDescription(form)}
          </Text>
        </View>

        {/* Metrics Grid */}
        <View className="flex-row items-stretch gap-2">
          {/* CTL - Fitness */}
          <View className="flex-1 bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
            <Text className="text-2xl font-bold text-blue-600">{ctl}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Fitness (CTL)
            </Text>
            <Text className="text-xs text-muted-foreground">42-day avg</Text>
          </View>

          {/* ATL - Fatigue */}
          <View className="flex-1 bg-orange-500/10 rounded-lg p-3 border border-orange-500/20">
            <Text className="text-2xl font-bold text-orange-600">{atl}</Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Fatigue (ATL)
            </Text>
            <Text className="text-xs text-muted-foreground">7-day avg</Text>
          </View>

          {/* TSB - Form */}
          <View
            className={`flex-1 rounded-lg p-3 border ${
              tsb > 15
                ? "bg-green-500/10 border-green-500/20"
                : tsb > 5
                  ? "bg-blue-500/10 border-blue-500/20"
                  : tsb > -10
                    ? "bg-gray-500/10 border-gray-500/20"
                    : tsb > -20
                      ? "bg-orange-500/10 border-orange-500/20"
                      : "bg-red-500/10 border-red-500/20"
            }`}
          >
            <Text
              className={`text-2xl font-bold ${
                tsb > 15
                  ? "text-green-600"
                  : tsb > 5
                    ? "text-blue-600"
                    : tsb > -10
                      ? "text-gray-600"
                      : tsb > -20
                        ? "text-orange-600"
                        : "text-red-600"
              }`}
            >
              {tsb > 0 ? "+" : ""}
              {tsb}
            </Text>
            <Text className="text-xs text-muted-foreground mt-1">
              Form (TSB)
            </Text>
            <Text className="text-xs text-muted-foreground">CTL - ATL</Text>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}
