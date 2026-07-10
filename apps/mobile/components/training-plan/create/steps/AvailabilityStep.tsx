import type { WizardConstraintsInput } from "@repo/core";
import { Alert, AlertDescription } from "@repo/ui/components/alert";
import { Form, FormNumberField } from "@repo/ui/components/form";
import { Label } from "@repo/ui/components/label";
import { Text } from "@repo/ui/components/text";
import { useZodForm } from "@repo/ui/hooks";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { z } from "zod";
import { WizardStep } from "../WizardStep";

interface AvailabilityStepProps {
  constraints: WizardConstraintsInput;
  onConstraintsChange: (constraints: WizardConstraintsInput) => void;
  onNext: () => void;
  onBack: () => void;
  currentStep: number;
  totalSteps: number;
}

type AvailableDay = NonNullable<WizardConstraintsInput["available_days"]>[number];

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
  const form = useZodForm({
    schema: z.object({
      max_hours_per_week: z.number().nullable().optional(),
      max_sessions_per_week: z.number().nullable().optional(),
      min_rest_days_per_week: z.number().min(0),
    }),
    defaultValues: {
      max_hours_per_week: constraints.max_hours_per_week ?? null,
      max_sessions_per_week: constraints.max_sessions_per_week ?? null,
      min_rest_days_per_week: constraints.min_rest_days_per_week,
    },
  });

  const hoursPerWeek = form.watch("max_hours_per_week");
  const sessionsPerWeek = form.watch("max_sessions_per_week");
  const minRestDays = form.watch("min_rest_days_per_week");

  React.useEffect(() => {
    form.reset({
      max_hours_per_week: constraints.max_hours_per_week ?? null,
      max_sessions_per_week: constraints.max_sessions_per_week ?? null,
      min_rest_days_per_week: constraints.min_rest_days_per_week,
    });
  }, [
    constraints.max_hours_per_week,
    constraints.max_sessions_per_week,
    constraints.min_rest_days_per_week,
    form,
  ]);

  React.useEffect(() => {
    onConstraintsChange({
      ...constraints,
      max_hours_per_week: hoursPerWeek ?? undefined,
      max_sessions_per_week: sessionsPerWeek ?? undefined,
      min_rest_days_per_week: minRestDays,
    });
  }, [constraints, hoursPerWeek, minRestDays, onConstraintsChange, sessionsPerWeek]);

  const handlePresetSelect = (preset: (typeof LIFESTYLE_PRESETS)[number]) => {
    onConstraintsChange({
      ...constraints,
      max_hours_per_week: preset.hours,
      max_sessions_per_week: preset.sessions,
      min_rest_days_per_week: preset.minRestDays,
    });
  };

  const handleDayToggle = (day: AvailableDay) => {
    const currentDays = constraints.available_days || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];

    onConstraintsChange({
      ...constraints,
      available_days: newDays.length > 0 ? newDays : undefined,
    });
  };

  const isValid =
    (constraints.max_hours_per_week !== undefined && constraints.max_hours_per_week > 0) ||
    (constraints.max_sessions_per_week !== undefined && constraints.max_sessions_per_week > 0);

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
        <Label>Choose a training commitment level</Label>
        <View className="gap-2">
          {LIFESTYLE_PRESETS.map((preset) => {
            const isSelected =
              constraints.max_hours_per_week === preset.hours &&
              constraints.max_sessions_per_week === preset.sessions;

            return (
              <Pressable
                accessibilityLabel={`${preset.name}: ${preset.description}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                key={preset.name}
                onPress={() => handlePresetSelect(preset)}
                className={`rounded-lg border px-3 py-2.5 active:bg-accent ${
                  isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
                }`}
              >
                <View className="flex-row items-start justify-between mb-1">
                  <Text className="text-foreground font-semibold">{preset.name}</Text>
                  <View className="flex-row gap-3">
                    <View className="items-end">
                      <Text className="text-primary font-bold">{preset.hours}h</Text>
                      <Text className="text-xs text-muted-foreground">/week</Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-primary font-bold">{preset.sessions}x</Text>
                      <Text className="text-xs text-muted-foreground">/week</Text>
                    </View>
                  </View>
                </View>
                <Text className="text-sm text-muted-foreground">{preset.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-3 rounded-lg border border-border bg-muted/20 p-3">
        <View className="gap-0.5">
          <Text className="text-base font-semibold text-foreground">Custom values</Text>
          <Text className="text-sm text-muted-foreground">
            Adjust to match your exact availability.
          </Text>
        </View>
        <Form {...form}>
          <View className="gap-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormNumberField
                  control={form.control}
                  label="Hours per week"
                  name="max_hours_per_week"
                  placeholder="e.g., 8"
                  allowDecimal
                  min={0}
                />
              </View>
              <View className="flex-1">
                <FormNumberField
                  control={form.control}
                  label="Sessions per week"
                  name="max_sessions_per_week"
                  placeholder="e.g., 5"
                  allowDecimal={false}
                  min={0}
                />
              </View>
            </View>
            <FormNumberField
              control={form.control}
              description="Recovery is essential for improvement."
              label="Minimum rest days per week"
              name="min_rest_days_per_week"
              placeholder="e.g., 1"
              allowDecimal={false}
              min={0}
            />
          </View>
        </Form>
      </View>

      <View className="rounded-lg border border-border">
        <Pressable
          accessibilityLabel="Advanced availability options"
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          onPress={() => setShowAdvanced(!showAdvanced)}
          className="px-3 py-2.5 active:bg-accent"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-base font-semibold text-foreground">
                Available training days
              </Text>
              <Text className="text-sm text-muted-foreground">Optional</Text>
            </View>
            {showAdvanced ? (
              <ChevronUp size={20} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={20} className="text-muted-foreground" />
            )}
          </View>
        </Pressable>

        {showAdvanced && (
          <View className="gap-2 border-t border-border px-3 py-3">
            <View className="flex-row flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = constraints.available_days?.includes(day.key) || false;

                return (
                  <Pressable
                    accessibilityLabel={day.fullLabel}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    key={day.key}
                    onPress={() => handleDayToggle(day.key)}
                    className={`px-4 py-2 rounded-lg border ${
                      isSelected ? "bg-primary border-primary" : "bg-background border-border"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isSelected ? "text-primary-foreground" : "text-foreground"
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
        )}
      </View>

      {/* Validation Warning */}
      {!isValid && (
        <Alert icon={AlertCircle} variant="destructive">
          <AlertDescription>
            Please enter either hours per week or sessions per week
          </AlertDescription>
        </Alert>
      )}
    </WizardStep>
  );
}
