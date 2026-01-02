import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { WizardStep } from "../WizardStep";
import React, { useState } from "react";
import { View, Pressable } from "react-native";

interface SportMixStepProps {
  activities: Record<string, number>;
  onActivitiesChange: (activities: Record<string, number>) => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
}

const ACTIVITIES = [
  { key: "run", label: "Running", emoji: "🏃" },
  { key: "bike", label: "Cycling", emoji: "🚴" },
  { key: "swim", label: "Swimming", emoji: "🏊" },
  { key: "strength", label: "Strength", emoji: "💪" },
  { key: "other", label: "Other", emoji: "🎯" },
] as const;

const PRESETS: Array<{ name: string; values: Record<string, number> }> = [
  { name: "Running Only", values: { run: 1.0 } },
  { name: "Cycling Only", values: { bike: 1.0 } },
  { name: "Run-Focused", values: { run: 0.7, strength: 0.2, other: 0.1 } },
  {
    name: "Sprint Tri",
    values: { swim: 0.25, bike: 0.35, run: 0.35, strength: 0.05 },
  },
  {
    name: "Olympic Tri",
    values: { swim: 0.3, bike: 0.4, run: 0.25, strength: 0.05 },
  },
  {
    name: "Half/Full Ironman",
    values: { swim: 0.2, bike: 0.5, run: 0.25, strength: 0.05 },
  },
];

export function SportMixStep({
  activities,
  onActivitiesChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: SportMixStepProps) {
  const [showCustom, setShowCustom] = useState(false);

  // Calculate total percentage
  const total = Object.values(activities).reduce((sum, val) => sum + val, 0);

  // Get enabled activities
  const enabledActivities = ACTIVITIES.filter(
    (act) => activities[act.key] !== undefined && activities[act.key]! > 0,
  );

  const handlePresetSelect = (preset: (typeof PRESETS)[number]) => {
    onActivitiesChange(preset.values);
    setShowCustom(false);
  };

  const handleActivityChange = (key: string, value: number) => {
    const newActivities = { ...activities, [key]: value };
    onActivitiesChange(newActivities);
  };

  const handleToggleActivity = (key: string, enabled: boolean) => {
    if (enabled) {
      // Enable activity with small initial value
      const newActivities = { ...activities, [key]: 0.1 };
      onActivitiesChange(newActivities);
    } else {
      // Disable activity
      const newActivities = { ...activities };
      delete newActivities[key];
      onActivitiesChange(newActivities);
    }
  };

  const isValid = Math.abs(total - 1.0) < 0.01 && enabledActivities.length > 0;

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={totalSteps}
      title="What sports will you train?"
      description="Define how you'll distribute your training across activities"
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!isValid}
    >
      {/* Quick Presets */}
      {!showCustom && (
        <View className="gap-2">
          <Label>Choose a preset or customize:</Label>
          <View className="gap-2">
            {PRESETS.map((preset) => (
              <Pressable
                key={preset.name}
                onPress={() => handlePresetSelect(preset)}
                className="bg-card border border-border rounded-lg p-4 active:bg-accent"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-foreground font-medium">
                    {preset.name}
                  </Text>
                  <View className="flex-row gap-1">
                    {Object.entries(preset.values).map(([key, value]) => {
                      const activity = ACTIVITIES.find((a) => a.key === key);
                      return activity && value > 0 ? (
                        <Text key={key} className="text-lg">
                          {activity.emoji}
                        </Text>
                      ) : null;
                    })}
                  </View>
                </View>

                <View className="flex-row gap-2 mt-2 flex-wrap">
                  {Object.entries(preset.values).map(([key, value]) => {
                    const activity = ACTIVITIES.find((a) => a.key === key);
                    return activity && value > 0 ? (
                      <Text key={key} className="text-xs text-muted-foreground">
                        {activity.label} {Math.round(value * 100)}%
                      </Text>
                    ) : null;
                  })}
                </View>
              </Pressable>
            ))}
          </View>

          <Button
            variant="outline"
            onPress={() => setShowCustom(true)}
            className="mt-2"
          >
            <Text>Customize Distribution</Text>
          </Button>
        </View>
      )}

      {/* Custom Distribution */}
      {showCustom && (
        <View className="gap-4">
          <View className="flex-row items-center justify-between">
            <Label>Custom Distribution</Label>
            <Button
              variant="ghost"
              onPress={() => setShowCustom(false)}
              size="sm"
            >
              <Text>Use Presets</Text>
            </Button>
          </View>

          {/* Activity Toggles and Sliders */}
          {ACTIVITIES.map((activity) => {
            const isEnabled =
              activities[activity.key] !== undefined &&
              activities[activity.key]! > 0;
            const value = activities[activity.key] || 0;

            return (
              <Card key={activity.key}>
                <CardContent className="p-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-2xl">{activity.emoji}</Text>
                      <Text className="text-foreground font-medium">
                        {activity.label}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() =>
                        handleToggleActivity(activity.key, !isEnabled)
                      }
                      className={`px-3 py-1 rounded-full ${
                        isEnabled ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          isEnabled
                            ? "text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {isEnabled ? "Enabled" : "Disabled"}
                      </Text>
                    </Pressable>
                  </View>

                  {isEnabled && (
                    <View className="gap-2">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-2xl font-bold text-primary">
                          {Math.round(value * 100)}%
                        </Text>
                      </View>

                      <Slider
                        value={value}
                        onValueChange={(newValue) =>
                          handleActivityChange(activity.key, newValue)
                        }
                        minimumValue={0}
                        maximumValue={1}
                        step={0.05}
                        minimumTrackTintColor="#2563eb"
                        maximumTrackTintColor="#e5e7eb"
                      />
                    </View>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {/* Total Indicator */}
          <Card
            className={`${
              isValid
                ? "bg-primary/10 border-primary/20"
                : "bg-destructive/10 border-destructive/20"
            }`}
          >
            <CardContent className="p-4">
              <View className="flex-row items-center justify-between">
                <Text
                  className={`font-medium ${
                    isValid ? "text-primary" : "text-destructive"
                  }`}
                >
                  Total Percentage:
                </Text>
                <Text
                  className={`text-2xl font-bold ${
                    isValid ? "text-primary" : "text-destructive"
                  }`}
                >
                  {Math.round(total * 100)}%
                </Text>
              </View>

              {!isValid && (
                <Text className="text-sm text-destructive mt-2">
                  {total < 0.99
                    ? "Total must equal 100%"
                    : total > 1.01
                      ? "Total cannot exceed 100%"
                      : "Please enable at least one activity"}
                </Text>
              )}
            </CardContent>
          </Card>
        </View>
      )}

      {/* Current Selection Summary */}
      {!showCustom && enabledActivities.length > 0 && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">Your Sport Mix</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-2">
              {enabledActivities.map((activity) => (
                <View
                  key={activity.key}
                  className="flex-row items-center justify-between"
                >
                  <View className="flex-row items-center gap-2">
                    <Text className="text-lg">{activity.emoji}</Text>
                    <Text className="text-foreground">{activity.label}</Text>
                  </View>
                  <Text className="text-primary font-semibold">
                    {Math.round((activities[activity.key] || 0) * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>
      )}
    </WizardStep>
  );
}
