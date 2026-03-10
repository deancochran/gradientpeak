import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
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
          <Text className="text-xs text-muted-foreground">Aggressiveness</Text>
          <Text className="text-sm font-medium text-foreground">
            {(settings.behavior_controls_v1.aggressiveness * 100).toFixed(0)}%
          </Text>
        </View>
        <View className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <Text className="text-xs text-muted-foreground">
            Recovery Priority
          </Text>
          <Text className="text-sm font-medium text-foreground">
            {(settings.behavior_controls_v1.recovery_priority * 100).toFixed(0)}
            %
          </Text>
        </View>
        <View className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <Text className="text-xs text-muted-foreground">Variability</Text>
          <Text className="text-sm font-medium text-foreground">
            {(settings.behavior_controls_v1.variability * 100).toFixed(0)}%
          </Text>
        </View>
        <Button variant="outline" onPress={onOpen}>
          <Text>Open Preferences</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
