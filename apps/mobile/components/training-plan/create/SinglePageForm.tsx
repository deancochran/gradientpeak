import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FitnessProjectionChart } from "@/components/charts/FitnessProjectionChart";
import React, { useState, useMemo } from "react";
import { View, ScrollView, Pressable } from "react-native";
import type { Mesocycle, PublicActivityCategory } from "@repo/core";
import { autoGenerateMesocycles } from "@repo/core";

export type PlanPreset = "beginner" | "intermediate" | "advanced";

interface PresetConfig {
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  maxConsecutiveDays: number;
  minRestDays: number;
}

const PRESETS: Record<PlanPreset, PresetConfig> = {
  beginner: {
    tssMin: 100,
    tssMax: 250,
    activitiesPerWeek: 3,
    maxConsecutiveDays: 2,
    minRestDays: 2,
  },
  intermediate: {
    tssMin: 200,
    tssMax: 400,
    activitiesPerWeek: 4,
    maxConsecutiveDays: 3,
    minRestDays: 2,
  },
  advanced: {
    tssMin: 350,
    tssMax: 600,
    activitiesPerWeek: 5,
    maxConsecutiveDays: 4,
    minRestDays: 1,
  },
};

export interface TrainingPlanFormData {
  name: string;
  description: string;
  preset: PlanPreset;
  targetDate: string;
  tssMin: number;
  tssMax: number;
  activitiesPerWeek: number;
  maxConsecutiveDays: number;
  minRestDays: number;
  startingCTL: number;
  targetCTL: number;
  rampRate: number;
  mesocycles?: Mesocycle[];
  activityDistribution?: Record<PublicActivityCategory, number>;
}

interface SinglePageFormProps {
  formData: TrainingPlanFormData;
  onFormDataChange: (data: Partial<TrainingPlanFormData>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  errors?: Record<string, string>;
  currentCTL?: number;
}

export function SinglePageForm({
  formData,
  onFormDataChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  errors = {},
  currentCTL = 0,
}: SinglePageFormProps) {
  const [activeTab, setActiveTab] = useState("basic");

  const handlePresetChange = (preset: PlanPreset) => {
    const presetConfig = PRESETS[preset];
    onFormDataChange({
      preset,
      ...presetConfig,
    });
  };

  const avgTSS = Math.round((formData.tssMin + formData.tssMax) / 2);

  // Auto-generate mesocycles when target date changes
  const mesocycles = useMemo(() => {
    if (formData.mesocycles) return formData.mesocycles;
    return autoGenerateMesocycles(formData.targetDate);
  }, [formData.targetDate, formData.mesocycles]);

  // Calculate estimated target CTL if not explicitly set
  const effectiveTargetCTL = useMemo(() => {
    if (formData.targetCTL > 0) return formData.targetCTL;
    return Math.max(Math.round(avgTSS * 0.15), formData.startingCTL + 10);
  }, [formData.targetCTL, avgTSS, formData.startingCTL]);

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Fitness Projection Chart - Always Visible */}
        <View className="p-4 bg-background border-b border-border">
          <FitnessProjectionChart
            currentCTL={formData.startingCTL}
            targetCTL={effectiveTargetCTL}
            targetDate={formData.targetDate}
            weeklyTSSAvg={avgTSS}
            mesocycles={mesocycles}
            rampRate={formData.rampRate}
            recoveryWeekFrequency={3}
            recoveryWeekReduction={0.5}
            height={220}
          />

          {/* Minimal Summary */}
          <View className="flex-row gap-2 mt-3">
            <View className="flex-1 bg-muted/30 rounded-lg p-2">
              <Text className="text-xs text-muted-foreground">Weekly TSS</Text>
              <Text className="text-sm font-semibold">
                {formData.tssMin}-{formData.tssMax}
              </Text>
            </View>
            <View className="flex-1 bg-muted/30 rounded-lg p-2">
              <Text className="text-xs text-muted-foreground">
                Activities/Week
              </Text>
              <Text className="text-sm font-semibold">
                {formData.activitiesPerWeek}
              </Text>
            </View>
            <View className="flex-1 bg-muted/30 rounded-lg p-2">
              <Text className="text-xs text-muted-foreground">Target CTL</Text>
              <Text className="text-sm font-semibold">
                {effectiveTargetCTL}
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <View className="px-4 pt-3 pb-2 border-b border-border bg-background">
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TabsList>
                <TabsTrigger value="basic">
                  <Text className="text-xs">Basic</Text>
                </TabsTrigger>
                <TabsTrigger value="targets">
                  <Text className="text-xs">Targets</Text>
                </TabsTrigger>
                <TabsTrigger value="recovery">
                  <Text className="text-xs">Recovery</Text>
                </TabsTrigger>
                <TabsTrigger value="activities">
                  <Text className="text-xs">Activity Mix</Text>
                </TabsTrigger>
                <TabsTrigger value="phases">
                  <Text className="text-xs">Phases</Text>
                </TabsTrigger>
              </TabsList>
            </ScrollView>
          </View>

          <View className="px-4 pt-4">
            {/* Basic Tab */}
            <TabsContent value="basic" className="gap-4">
              <View className="gap-2">
                <Label nativeID="plan-name">
                  <Text className="text-sm font-medium">
                    Plan Name <Text className="text-destructive">*</Text>
                  </Text>
                </Label>
                <Input
                  aria-labelledby="plan-name"
                  placeholder="e.g., Marathon Prep 2024"
                  value={formData.name}
                  onChangeText={(value) => onFormDataChange({ name: value })}
                  autoFocus
                  maxLength={100}
                />
                {errors.name && (
                  <Text className="text-xs text-destructive">
                    {errors.name}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Label nativeID="plan-description">
                  <Text className="text-sm font-medium">Description</Text>
                </Label>
                <Input
                  aria-labelledby="plan-description"
                  placeholder="Brief description"
                  value={formData.description}
                  onChangeText={(value) =>
                    onFormDataChange({ description: value })
                  }
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                  style={{ minHeight: 60 }}
                />
              </View>

              <View className="gap-2">
                <Label nativeID="training-level">
                  <Text className="text-sm font-medium">
                    Level <Text className="text-destructive">*</Text>
                  </Text>
                </Label>
                <View className="flex-row gap-2">
                  {(
                    ["beginner", "intermediate", "advanced"] as PlanPreset[]
                  ).map((preset) => (
                    <Pressable
                      key={preset}
                      onPress={() => handlePresetChange(preset)}
                      className={`flex-1 border rounded-lg p-3 ${
                        formData.preset === preset
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium text-center ${
                          formData.preset === preset
                            ? "text-primary"
                            : "text-foreground"
                        }`}
                      >
                        {preset.charAt(0).toUpperCase() + preset.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View className="gap-2">
                <Label nativeID="target-date">
                  <Text className="text-sm font-medium">
                    Target Date <Text className="text-destructive">*</Text>
                  </Text>
                </Label>
                <Input
                  aria-labelledby="target-date"
                  value={formData.targetDate}
                  onChangeText={(text) =>
                    onFormDataChange({ targetDate: text })
                  }
                  placeholder="YYYY-MM-DD"
                />
                {errors.targetDate && (
                  <Text className="text-xs text-destructive">
                    {errors.targetDate}
                  </Text>
                )}
              </View>
            </TabsContent>

            {/* Targets Tab */}
            <TabsContent value="targets" className="gap-4">
              <View className="gap-3">
                <Label>
                  <Text className="text-sm font-medium">Weekly TSS Range</Text>
                </Label>
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-2">
                    <Label nativeID="tss-min">
                      <Text className="text-xs text-muted-foreground">Min</Text>
                    </Label>
                    <Input
                      aria-labelledby="tss-min"
                      value={formData.tssMin.toString()}
                      onChangeText={(text) =>
                        onFormDataChange({ tssMin: parseInt(text) || 0 })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1 gap-2">
                    <Label nativeID="tss-max">
                      <Text className="text-xs text-muted-foreground">Max</Text>
                    </Label>
                    <Input
                      aria-labelledby="tss-max"
                      value={formData.tssMax.toString()}
                      onChangeText={(text) =>
                        onFormDataChange({ tssMax: parseInt(text) || 0 })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                {errors.tssMin && (
                  <Text className="text-xs text-destructive">
                    {errors.tssMin}
                  </Text>
                )}
                {errors.tssMax && (
                  <Text className="text-xs text-destructive">
                    {errors.tssMax}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Label nativeID="activities-per-week">
                  <Text className="text-sm font-medium">
                    Activities per Week
                  </Text>
                </Label>
                <Input
                  aria-labelledby="activities-per-week"
                  value={formData.activitiesPerWeek.toString()}
                  onChangeText={(text) =>
                    onFormDataChange({
                      activitiesPerWeek: parseInt(text) || 0,
                    })
                  }
                  keyboardType="numeric"
                />
                {errors.activitiesPerWeek && (
                  <Text className="text-xs text-destructive">
                    {errors.activitiesPerWeek}
                  </Text>
                )}
              </View>

              <View className="gap-3">
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-2">
                    <Label nativeID="starting-ctl">
                      <Text className="text-xs text-muted-foreground">
                        Starting CTL
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="starting-ctl"
                      value={formData.startingCTL.toString()}
                      onChangeText={(text) =>
                        onFormDataChange({
                          startingCTL: parseInt(text) || 0,
                        })
                      }
                      keyboardType="numeric"
                    />
                  </View>
                  <View className="flex-1 gap-2">
                    <Label nativeID="target-ctl">
                      <Text className="text-xs text-muted-foreground">
                        Target CTL
                      </Text>
                    </Label>
                    <Input
                      aria-labelledby="target-ctl"
                      value={formData.targetCTL.toString()}
                      onChangeText={(text) =>
                        onFormDataChange({ targetCTL: parseInt(text) || 0 })
                      }
                      keyboardType="numeric"
                      placeholder={effectiveTargetCTL.toString()}
                    />
                  </View>
                </View>
              </View>

              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Label nativeID="ramp-rate">
                    <Text className="text-sm font-medium">Ramp Rate</Text>
                  </Label>
                  <Text className="text-sm font-semibold">
                    {formData.rampRate.toFixed(2)}
                  </Text>
                </View>
                <Slider
                  value={formData.rampRate}
                  onValueChange={(value) =>
                    onFormDataChange({ rampRate: value })
                  }
                  minimumValue={0.01}
                  maximumValue={0.15}
                  step={0.01}
                  minimumTrackTintColor="#3b82f6"
                  maximumTrackTintColor="#e5e7eb"
                />
                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted-foreground">
                    Conservative
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Aggressive
                  </Text>
                </View>
              </View>
            </TabsContent>

            {/* Recovery Tab */}
            <TabsContent value="recovery" className="gap-4">
              <View className="gap-2">
                <Label nativeID="max-consecutive">
                  <Text className="text-sm font-medium">
                    Max Consecutive Training Days
                  </Text>
                </Label>
                <Input
                  aria-labelledby="max-consecutive"
                  value={formData.maxConsecutiveDays.toString()}
                  onChangeText={(text) =>
                    onFormDataChange({
                      maxConsecutiveDays: parseInt(text) || 0,
                    })
                  }
                  keyboardType="numeric"
                />
                {errors.maxConsecutiveDays && (
                  <Text className="text-xs text-destructive">
                    {errors.maxConsecutiveDays}
                  </Text>
                )}
              </View>

              <View className="gap-2">
                <Label nativeID="min-rest">
                  <Text className="text-sm font-medium">
                    Min Rest Days per Week
                  </Text>
                </Label>
                <Input
                  aria-labelledby="min-rest"
                  value={formData.minRestDays.toString()}
                  onChangeText={(text) =>
                    onFormDataChange({
                      minRestDays: parseInt(text) || 0,
                    })
                  }
                  keyboardType="numeric"
                />
                {errors.minRestDays && (
                  <Text className="text-xs text-destructive">
                    {errors.minRestDays}
                  </Text>
                )}
              </View>

              <View className="bg-muted/30 rounded-lg p-3 mt-2">
                <Text className="text-xs text-muted-foreground">
                  Train up to {formData.maxConsecutiveDays} days in a row, with
                  at least {formData.minRestDays} rest day
                  {formData.minRestDays !== 1 ? "s" : ""} per week
                </Text>
              </View>
            </TabsContent>

            {/* Activity Mix Tab */}
            <TabsContent value="activities" className="gap-4">
              <View className="gap-2">
                <Text className="text-sm font-medium">
                  Activity Distribution
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Single-sport by default. Multi-sport customization coming
                  soon.
                </Text>
              </View>

              <View className="bg-muted/30 rounded-lg p-4">
                <View className="flex-row justify-between items-center">
                  <Text className="text-sm">Running</Text>
                  <Text className="text-sm font-medium">100%</Text>
                </View>
              </View>
            </TabsContent>

            {/* Phases Tab */}
            <TabsContent value="phases" className="gap-4">
              <View className="gap-2">
                <Text className="text-sm font-medium">Training Phases</Text>
                <Text className="text-xs text-muted-foreground">
                  Mesocycles are auto-generated based on your target date. You
                  can customize them after creation.
                </Text>
              </View>

              <View className="bg-muted/30 rounded-lg p-4">
                <View className="gap-2">
                  {mesocycles.map((cycle, index) => (
                    <View
                      key={index}
                      className="flex-row justify-between items-center py-2 border-b border-border last:border-b-0"
                    >
                      <Text className="text-sm font-medium">{cycle.name}</Text>
                      <Text className="text-xs text-muted-foreground">
                        {cycle.duration_weeks} weeks
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </TabsContent>
          </View>
        </Tabs>
      </ScrollView>

      {/* Fixed Footer */}
      <View className="absolute bottom-0 left-0 right-0 p-4 border-t border-border bg-background">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            onPress={onCancel}
            disabled={isSubmitting}
            className="flex-1"
          >
            <Text className="text-foreground">Cancel</Text>
          </Button>
          <Button
            onPress={onSubmit}
            disabled={isSubmitting || !formData.name.trim()}
            className="flex-1"
          >
            <Text className="text-primary-foreground font-semibold">
              {isSubmitting ? "Creating..." : "Create Plan"}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
