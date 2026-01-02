import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { WizardStep } from "../WizardStep";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useState } from "react";
import { View, Pressable } from "react-native";
import type { WizardConstraintsInput } from "@repo/core";

interface AvailabilityStepProps {
  constraints: WizardConstraintsInput;
  onConstraintsChange: (constraints: WizardConstraintsInput) => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
}

const LIFESTYLE_PRESETS = [
  {
    name: "Casual",
    description: "Training around a busy schedule",
    hours: 4,
    sessions: 3,
    minRestDays: 2,
  },
  {
    name: "Weekend Warrior",
    description: "Focus on weekends with some weekday training",
    hours: 6,
    sessions: 4,
    minRestDays: 2,
  },
  {
    name: "Committed",
    description: "Consistent training 5-6 days per week",
    hours: 8,
    sessions: 5,
    minRestDays: 1,
  },
  {
    name: "Serious Athlete",
    description: "High volume, focused training",
    hours: 12,
    sessions: 6,
    minRestDays: 1,
  },
];

const DAYS_OF_WEEK = [
  { key: "monday", label: "Mon", fullLabel: "Monday" },
  { key: "tuesday", label: "Tue", fullLabel: "Tuesday" },
  { key: "wednesday", label: "Wed", fullLabel: "Wednesday" },
  { key: "thursday", label: "Thu", fullLabel: "Thursday" },
  { key: "friday", label: "Fri", fullLabel: "Friday" },
  { key: "saturday", label: "Sat", fullLabel: "Saturday" },
  { key: "sunday", label: "Sun", fullLabel: "Sunday" },
] as const;

export function AvailabilityStep({
  constraints,
  onConstraintsChange,
  onNext,
  onBack,
  currentStep,
  totalSteps,
}: AvailabilityStepProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handlePresetSelect = (preset: (typeof LIFESTYLE_PRESETS)[number]) => {
    onConstraintsChange({
      ...constraints,
      max_hours_per_week: preset.hours,
      max_sessions_per_week: preset.sessions,
      min_rest_days_per_week: preset.minRestDays,
    });
  };

  const handleDayToggle = (day: string) => {
    const currentDays = constraints.available_days || [];
    const newDays = currentDays.includes(day as any)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day as any];

    onConstraintsChange({
      ...constraints,
      available_days: newDays.length > 0 ? (newDays as any) : undefined,
    });
  };

  const isValid =
    (constraints.max_hours_per_week !== undefined &&
      constraints.max_hours_per_week > 0) ||
    (constraints.max_sessions_per_week !== undefined &&
      constraints.max_sessions_per_week > 0);

  return (
    <WizardStep
      currentStep={currentStep}
      totalSteps={totalSteps}
      title="How much time can you commit?"
      description="Help us design a plan that fits your schedule"
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!isValid}
    >
      {/* Lifestyle Presets */}
      <View className="gap-2">
        <Label>Choose a training commitment level:</Label>
        <View className="gap-2">
          {LIFESTYLE_PRESETS.map((preset) => (
            <Pressable
              key={preset.name}
              onPress={() => handlePresetSelect(preset)}
              className={`bg-card border rounded-lg p-4 active:bg-accent ${
                constraints.max_hours_per_week === preset.hours &&
                constraints.max_sessions_per_week === preset.sessions
                  ? "border-primary bg-primary/5"
                  : "border-border"
              }`}
            >
              <View className="flex-row items-start justify-between mb-1">
                <Text className="text-foreground font-semibold">
                  {preset.name}
                </Text>
                <View className="flex-row gap-3">
                  <View className="items-end">
                    <Text className="text-primary font-bold">
                      {preset.hours}h
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      /week
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-primary font-bold">
                      {preset.sessions}x
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      /week
                    </Text>
                  </View>
                </View>
              </View>
              <Text className="text-sm text-muted-foreground">
                {preset.description}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Custom Values */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom Values</CardTitle>
          <CardDescription>
            Adjust to match your exact availability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <View className="gap-4">
            {/* Hours per Week */}
            <View className="gap-2">
              <Label nativeID="hours-per-week">
                Hours per Week (Optional)
              </Label>
              <Input
                placeholder="e.g., 8"
                value={
                  constraints.max_hours_per_week !== undefined
                    ? constraints.max_hours_per_week.toString()
                    : ""
                }
                onChangeText={(text) => {
                  const value = parseFloat(text);
                  onConstraintsChange({
                    ...constraints,
                    max_hours_per_week: isNaN(value) ? undefined : value,
                  });
                }}
                keyboardType="numeric"
                aria-labelledby="hours-per-week"
              />
            </View>

            {/* Sessions per Week */}
            <View className="gap-2">
              <Label nativeID="sessions-per-week">
                Sessions per Week (Optional)
              </Label>
              <Input
                placeholder="e.g., 5"
                value={
                  constraints.max_sessions_per_week !== undefined
                    ? constraints.max_sessions_per_week.toString()
                    : ""
                }
                onChangeText={(text) => {
                  const value = parseInt(text);
                  onConstraintsChange({
                    ...constraints,
                    max_sessions_per_week: isNaN(value) ? undefined : value,
                  });
                }}
                keyboardType="numeric"
                aria-labelledby="sessions-per-week"
              />
            </View>

            {/* Min Rest Days */}
            <View className="gap-2">
              <Label nativeID="min-rest-days">
                Minimum Rest Days per Week
              </Label>
              <Input
                placeholder="e.g., 1"
                value={constraints.min_rest_days_per_week.toString()}
                onChangeText={(text) => {
                  const value = parseInt(text);
                  onConstraintsChange({
                    ...constraints,
                    min_rest_days_per_week: isNaN(value) || value < 0 ? 1 : value,
                  });
                }}
                keyboardType="numeric"
                aria-labelledby="min-rest-days"
              />
              <Text className="text-xs text-muted-foreground">
                Recovery is essential for improvement
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>

      {/* Advanced Options */}
      <Card>
        <Pressable
          onPress={() => setShowAdvanced(!showAdvanced)}
          className="active:bg-accent"
        >
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <CardTitle className="text-base">Advanced Options</CardTitle>
              {showAdvanced ? (
                <ChevronUp size={20} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={20} className="text-muted-foreground" />
              )}
            </View>
            <CardDescription>
              Specify which days you can train (optional)
            </CardDescription>
          </CardHeader>
        </Pressable>

        {showAdvanced && (
          <CardContent>
            <View className="gap-2">
              <Label>Available Training Days</Label>
              <View className="flex-row flex-wrap gap-2">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected =
                    constraints.available_days?.includes(day.key as any) ||
                    false;

                  return (
                    <Pressable
                      key={day.key}
                      onPress={() => handleDayToggle(day.key)}
                      className={`px-4 py-2 rounded-lg border ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "bg-background border-border"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          isSelected
                            ? "text-primary-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-xs text-muted-foreground mt-2">
                Leave empty to allow training any day of the week
              </Text>
            </View>
          </CardContent>
        )}
      </Card>

      {/* Validation Warning */}
      {!isValid && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-4">
            <Text className="text-sm text-destructive">
              Please enter either hours per week or sessions per week
            </Text>
          </CardContent>
        </Card>
      )}
    </WizardStep>
  );
}
