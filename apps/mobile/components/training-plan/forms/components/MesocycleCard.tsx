import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import type { Mesocycle, TrainingPhase } from "@repo/core";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Activity,
  Clock,
} from "lucide-react-native";
import React, { useState } from "react";
import { View, Pressable } from "react-native";

interface MesocycleCardProps {
  mesocycle: Mesocycle;
  index: number;
  onChange: (mesocycle: Mesocycle) => void;
  onRemove: () => void;
}

const PHASE_OPTIONS: Array<{
  value: TrainingPhase;
  label: string;
  emoji: string;
}> = [
  { value: "base", label: "Base Building", emoji: "🏗️" },
  { value: "build", label: "Build", emoji: "📈" },
  { value: "peak", label: "Peak", emoji: "⛰️" },
  { value: "taper", label: "Taper", emoji: "📉" },
  { value: "recovery", label: "Recovery", emoji: "🛌" },
  { value: "maintenance", label: "Maintenance", emoji: "⚙️" },
];

export function MesocycleCard({
  mesocycle,
  index,
  onChange,
  onRemove,
}: MesocycleCardProps) {
  const [isExpanded, setIsExpanded] = useState(index === 0); // First card expanded by default

  const phaseOption = PHASE_OPTIONS.find((p) => p.value === mesocycle.phase);

  // Calculate derived hard intensity (sum must equal 1.0)
  const hardIntensity = Math.max(
    0,
    1 -
      mesocycle.intensity_distribution.easy -
      mesocycle.intensity_distribution.moderate,
  );

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        {/* Header (Always Visible) */}
        <Pressable
          onPress={() => setIsExpanded(!isExpanded)}
          className="p-4 flex-row items-center justify-between"
        >
          <View className="flex-1 pr-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-lg">{phaseOption?.emoji}</Text>
              <Text className="text-base font-semibold text-foreground">
                {mesocycle.name}
              </Text>
            </View>
            <View className="flex-row items-center gap-4">
              <View className="flex-row items-center gap-1">
                <Icon as={Clock} size={14} className="text-muted-foreground" />
                <Text className="text-sm text-muted-foreground">
                  {mesocycle.duration_weeks} weeks
                </Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Icon
                  as={Activity}
                  size={14}
                  className="text-muted-foreground"
                />
                <Text className="text-sm text-muted-foreground">
                  {phaseOption?.label}
                </Text>
              </View>
            </View>
          </View>
          <Icon
            as={isExpanded ? ChevronUp : ChevronDown}
            size={24}
            className="text-muted-foreground"
          />
        </Pressable>

        {/* Expanded Content */}
        {isExpanded && (
          <View className="px-4 pb-4 gap-4 border-t border-border pt-4">
            {/* Phase Name */}
            <View className="gap-2">
              <Label className="text-sm font-medium">Phase Name</Label>
              <Input
                value={mesocycle.name}
                onChangeText={(text) => onChange({ ...mesocycle, name: text })}
                placeholder="e.g., Base Building"
              />
            </View>

            {/* Phase Type */}
            <View className="gap-2">
              <Label className="text-sm font-medium">Phase Type</Label>
              <View className="gap-2">
                {PHASE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    variant={
                      mesocycle.phase === option.value ? "default" : "outline"
                    }
                    onPress={() =>
                      onChange({ ...mesocycle, phase: option.value })
                    }
                    className="justify-start"
                  >
                    <Text
                      className={
                        mesocycle.phase === option.value
                          ? "text-primary-foreground"
                          : "text-foreground"
                      }
                    >
                      {option.emoji} {option.label}
                    </Text>
                  </Button>
                ))}
              </View>
            </View>

            {/* Duration */}
            <View className="gap-2">
              <View className="flex-row justify-between items-center">
                <Label className="text-sm font-medium">Duration</Label>
                <Text className="text-sm font-semibold text-primary">
                  {mesocycle.duration_weeks} weeks
                </Text>
              </View>
              <Slider
                value={mesocycle.duration_weeks}
                onValueChange={(value: number) =>
                  onChange({
                    ...mesocycle,
                    duration_weeks: Math.round(value),
                  })
                }
                minimumValue={1}
                maximumValue={20}
                step={1}
                minimumTrackTintColor="#3b82f6"
                maximumTrackTintColor="#e5e7eb"
              />
            </View>

            {/* Intensity Distribution */}
            <View className="gap-3">
              <Label className="text-sm font-medium">
                Intensity Distribution
              </Label>

              {/* Easy */}
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs text-muted-foreground">
                    Easy/Recovery
                  </Text>
                  <Text className="text-xs font-semibold text-primary">
                    {Math.round(mesocycle.intensity_distribution.easy * 100)}%
                  </Text>
                </View>
                <Slider
                  value={mesocycle.intensity_distribution.easy}
                  onValueChange={(value: number) =>
                    onChange({
                      ...mesocycle,
                      intensity_distribution: {
                        ...mesocycle.intensity_distribution,
                        easy: value,
                      },
                    })
                  }
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  minimumTrackTintColor="#22c55e"
                  maximumTrackTintColor="#e5e7eb"
                />
              </View>

              {/* Moderate */}
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs text-muted-foreground">
                    Moderate/Tempo
                  </Text>
                  <Text className="text-xs font-semibold text-primary">
                    {Math.round(
                      mesocycle.intensity_distribution.moderate * 100,
                    )}
                    %
                  </Text>
                </View>
                <Slider
                  value={mesocycle.intensity_distribution.moderate}
                  onValueChange={(value: number) =>
                    onChange({
                      ...mesocycle,
                      intensity_distribution: {
                        ...mesocycle.intensity_distribution,
                        moderate: value,
                      },
                    })
                  }
                  minimumValue={0}
                  maximumValue={1}
                  step={0.05}
                  minimumTrackTintColor="#eab308"
                  maximumTrackTintColor="#e5e7eb"
                />
              </View>

              {/* Hard (Calculated) */}
              <View className="gap-2">
                <View className="flex-row justify-between items-center">
                  <Text className="text-xs text-muted-foreground">
                    Hard/High-Intensity
                  </Text>
                  <Text className="text-xs font-semibold text-primary">
                    {Math.round(hardIntensity * 100)}%
                  </Text>
                </View>
                <View className="h-1 bg-muted rounded-full overflow-hidden">
                  <View
                    className="h-full bg-red-500"
                    style={{ width: `${hardIntensity * 100}%` }}
                  />
                </View>
                <Text className="text-xs text-muted-foreground italic">
                  Automatically calculated (1 - easy - moderate)
                </Text>
              </View>
            </View>

            {/* TSS Multiplier */}
            <View className="gap-2">
              <View className="flex-row justify-between items-center">
                <Label className="text-sm font-medium">Volume Multiplier</Label>
                <Text className="text-sm font-semibold text-primary">
                  {mesocycle.tss_multiplier.toFixed(1)}x
                </Text>
              </View>
              <Slider
                value={mesocycle.tss_multiplier}
                onValueChange={(value: number) =>
                  onChange({
                    ...mesocycle,
                    tss_multiplier: Math.round(value * 10) / 10,
                  })
                }
                minimumValue={0.3}
                maximumValue={1.5}
                step={0.1}
                minimumTrackTintColor="#3b82f6"
                maximumTrackTintColor="#e5e7eb"
              />
              <Text className="text-xs text-muted-foreground">
                Adjusts weekly TSS targets for this phase (1.0 = baseline)
              </Text>
            </View>

            {/* Remove Button */}
            <Button
              variant="outline"
              onPress={onRemove}
              className="border-destructive"
            >
              <View className="flex-row items-center gap-2">
                <Icon as={Trash2} size={16} className="text-destructive" />
                <Text className="text-destructive font-semibold">
                  Remove Phase
                </Text>
              </View>
            </Button>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
