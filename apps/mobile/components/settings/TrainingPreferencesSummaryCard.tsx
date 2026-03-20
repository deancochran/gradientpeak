import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import type { AthleteTrainingSettings } from "@repo/core";
import React from "react";
import { View } from "react-native";

interface TrainingPreferencesSummaryCardProps {
  settings: AthleteTrainingSettings;
  onOpen: () => void;
}

export function TrainingPreferencesSummaryCard({
  settings,
  onOpen,
}: TrainingPreferencesSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Preferences</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <Text className="text-xs text-muted-foreground">
            Progression pace
          </Text>
          <Text className="text-sm font-medium text-foreground">
            {(settings.training_style.progression_pace * 100).toFixed(0)}%
          </Text>
        </View>
        <View className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <Text className="text-xs text-muted-foreground">
            Recovery priority
          </Text>
          <Text className="text-sm font-medium text-foreground">
            {(settings.recovery_preferences.recovery_priority * 100).toFixed(0)}
            %
          </Text>
        </View>
        <View className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <Text className="text-xs text-muted-foreground">
            Target surplus preference
          </Text>
          <Text className="text-sm font-medium text-foreground">
            {(
              settings.goal_strategy_preferences.target_surplus_preference * 100
            ).toFixed(0)}
            %
          </Text>
        </View>
        <Button variant="outline" onPress={onOpen}>
          <Text>Open Preferences</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
