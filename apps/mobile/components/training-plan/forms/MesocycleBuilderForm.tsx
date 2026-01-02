import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { Mesocycle } from "@repo/core";
import {
  MESOCYCLE_PRESETS,
  getMesocyclePresetOptions,
  type MesocyclePresetKey,
} from "@repo/core";
import { Plus, AlertCircle, CheckCircle } from "lucide-react-native";
import React, { useState } from "react";
import { View, ScrollView } from "react-native";
import { MesocycleCard } from "./components/MesocycleCard";

interface MesocycleBuilderFormProps {
  data: Mesocycle[] | null;
  onChange: (mesocycles: Mesocycle[]) => void;
  periodizationData?: {
    starting_ctl: number;
    target_ctl: number;
    target_date: string;
  };
  errors: Record<string, string>;
}

export function MesocycleBuilderForm({
  data,
  onChange,
  periodizationData,
  errors,
}: MesocycleBuilderFormProps) {
  const [mesocycles, setMesocycles] = useState<Mesocycle[]>(data || []);
  const [selectedPreset, setSelectedPreset] =
    useState<MesocyclePresetKey | null>(null);

  // Calculate weeks until target date
  const weeksUntilTarget = periodizationData?.target_date
    ? Math.floor(
        (new Date(periodizationData.target_date).getTime() -
          new Date().getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      )
    : 0;

  // Calculate total weeks in current mesocycles
  const totalWeeks = mesocycles.reduce(
    (sum, meso) => sum + meso.duration_weeks,
    0,
  );

  const weeksMatch = Math.abs(totalWeeks - weeksUntilTarget) <= 1;

  // Handle preset selection
  const handlePresetSelect = (presetKey: MesocyclePresetKey) => {
    setSelectedPreset(presetKey);
    const preset = MESOCYCLE_PRESETS[presetKey];
    setMesocycles(preset);
    onChange(preset);
  };

  // Handle add mesocycle
  const handleAddMesocycle = () => {
    const newMesocycle: Mesocycle = {
      name: `Phase ${mesocycles.length + 1}`,
      phase: "base",
      duration_weeks: 4,
      intensity_distribution: {
        easy: 0.7,
        moderate: 0.2,
        hard: 0.1,
      },
      tss_multiplier: 1.0,
    };
    const updated = [...mesocycles, newMesocycle];
    setMesocycles(updated);
    onChange(updated);
  };

  // Handle update mesocycle
  const handleUpdateMesocycle = (index: number, mesocycle: Mesocycle) => {
    const updated = [...mesocycles];
    updated[index] = mesocycle;
    setMesocycles(updated);
    onChange(updated);
  };

  // Handle remove mesocycle
  const handleRemoveMesocycle = (index: number) => {
    const updated = mesocycles.filter((_, i) => i !== index);
    setMesocycles(updated);
    onChange(updated);
  };

  const presetOptions = getMesocyclePresetOptions();

  return (
    <View className="gap-6">
      {/* Header */}
      <View className="gap-2">
        <Text className="text-2xl font-bold">Training Phases</Text>
        <Text className="text-muted-foreground">
          Define the mesocycles (training blocks) that make up your periodized
          plan
        </Text>
      </View>

      {/* Preset Templates */}
      <View className="gap-3">
        <Text className="text-base font-semibold">Quick Start Templates</Text>
        <View className="gap-2">
          {presetOptions.map((option) => (
            <Button
              key={option.key}
              variant={selectedPreset === option.key ? "default" : "outline"}
              onPress={() => handlePresetSelect(option.key)}
              className="justify-start"
            >
              <View className="flex-1">
                <Text
                  className={
                    selectedPreset === option.key
                      ? "text-primary-foreground font-semibold"
                      : "text-foreground font-semibold"
                  }
                >
                  {option.label}
                </Text>
                <Text
                  className={
                    selectedPreset === option.key
                      ? "text-primary-foreground/80 text-xs"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {option.description} •{" "}
                  {option.weeks > 0
                    ? `${option.weeks} weeks`
                    : "Start from scratch"}
                </Text>
              </View>
            </Button>
          ))}
        </View>
      </View>

      {/* Duration Validation */}
      {periodizationData && mesocycles.length > 0 && (
        <Card
          className={
            weeksMatch
              ? "bg-success/10 border-success"
              : "bg-amber-500/10 border-amber-500"
          }
        >
          <CardContent className="p-4">
            <View className="flex-row items-start gap-2">
              {weeksMatch ? (
                <CheckCircle size={20} color="#22c55e" />
              ) : (
                <AlertCircle size={20} color="#f59e0b" />
              )}
              <View className="flex-1">
                <Text
                  className={
                    weeksMatch
                      ? "text-success font-semibold mb-1"
                      : "text-amber-600 font-semibold mb-1"
                  }
                >
                  {weeksMatch
                    ? "Phase Duration Matches Target"
                    : "Duration Mismatch"}
                </Text>
                <Text
                  className={
                    weeksMatch
                      ? "text-success text-sm"
                      : "text-amber-600 text-sm"
                  }
                >
                  Total: {totalWeeks} weeks • Target: {weeksUntilTarget} weeks
                  {!weeksMatch &&
                    ` • Adjust phase durations by ${Math.abs(totalWeeks - weeksUntilTarget)} weeks`}
                </Text>
              </View>
            </View>
          </CardContent>
        </Card>
      )}

      {/* Mesocycle List */}
      {mesocycles.length > 0 && (
        <View className="gap-3">
          <Text className="text-base font-semibold">
            Training Phases ({mesocycles.length})
          </Text>
          <View className="gap-3">
            {mesocycles.map((mesocycle, index) => (
              <MesocycleCard
                key={index}
                mesocycle={mesocycle}
                index={index}
                onChange={(updated) => handleUpdateMesocycle(index, updated)}
                onRemove={() => handleRemoveMesocycle(index)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Add Mesocycle Button */}
      <Button variant="outline" onPress={handleAddMesocycle}>
        <View className="flex-row items-center gap-2">
          <Plus size={20} color="#3b82f6" />
          <Text className="text-primary font-semibold">Add Training Phase</Text>
        </View>
      </Button>

      {/* Error Display */}
      {errors.mesocycles && (
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="p-4">
            <Text className="text-destructive text-sm">
              {errors.mesocycles}
            </Text>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="p-4 gap-2">
          <Text className="font-semibold mb-1">💡 Mesocycle Tips</Text>
          <Text className="text-sm text-muted-foreground">
            • A typical training plan has 3-6 distinct phases
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Base phases build aerobic foundation (70%+ easy intensity)
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Build phases increase intensity (50% easy, 30% moderate, 20% hard)
          </Text>
          <Text className="text-sm text-muted-foreground">
            • Peak and taper phases sharpen fitness before your goal event
          </Text>
          <Text className="text-sm text-muted-foreground">
            • TSS multiplier adjusts weekly volume (1.1 = 10% more training)
          </Text>
        </CardContent>
      </Card>
    </View>
  );
}
