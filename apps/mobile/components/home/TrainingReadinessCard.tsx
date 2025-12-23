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
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="w-full flex flex-row items-between justify-center">
          <Text className="flex-1 text-xl ">Training Status: </Text>
          <Text className="text-xl font-bold">{form}</Text>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-row items-stretch gap-2">
        {/* Metrics Grid */}
        {/* CTL - Fitness */}
        <View className="flex-1 bg-muted/30 rounded-lg p-3">
          <Text className="text-xl font-bold ">{ctl}</Text>
          <Text className="text-xs text-muted-foreground">Fitness</Text>
        </View>

        {/* ATL - Fatigue */}
        <View className="flex-1 bg-muted/30 rounded-lg p-3">
          <Text className="text-xl font-bold ">{atl}</Text>
          <Text className="text-xs text-muted-foreground">Fatigue</Text>
        </View>

        {/* TSB - Form */}
        <View className="flex-1 bg-muted/30 rounded-lg p-3">
          <Text className={`text-xl font-bold `}>
            {tsb > 0 ? "+" : ""}
            {tsb}
          </Text>
          <Text className="text-xs text-muted-foreground">Form</Text>
        </View>
      </CardContent>
    </Card>
  );
}
