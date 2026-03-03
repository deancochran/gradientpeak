import { Slider } from "@/components/ui/slider";
import { Text } from "@/components/ui/text";
import { useIntensityScale } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import React from "react";
import { View } from "react-native";

interface IntensityScalingProps {
  service: ActivityRecorderService | null;
}

export function IntensityScaling({ service }: IntensityScalingProps) {
  const {
    scale,
    baseFtp,
    baseThresholdHr,
    baseWeight,
    baseThresholdPace,
    setIntensityScale,
    updateMetrics,
  } = useIntensityScale(service);

  const formatPace = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}/km`;
  };

  return (
    <View className="mb-6 px-1 space-y-6">
      {/* 1. Workout Intensity Slider */}
      <View>
        <View className="flex-row justify-between items-end mb-2">
          <View>
            <Text className="text-sm font-medium text-muted-foreground">
              Workout Intensity
            </Text>
            <Text className="text-2xl font-bold">
              {Math.round(scale * 100)}%
            </Text>
          </View>
          <View className="items-end">
            {baseFtp && (
              <Text className="text-sm font-semibold">
                {Math.round(baseFtp * scale)}W
              </Text>
            )}
            {baseThresholdPace && (
              <Text className="text-xs text-muted-foreground">
                {formatPace(baseThresholdPace / scale)}
              </Text>
            )}
          </View>
        </View>

        <Slider
          value={scale}
          minimumValue={0.5}
          maximumValue={1.5}
          step={0.01}
          onSlidingComplete={setIntensityScale}
          minimumTrackTintColor="#3b82f6"
          thumbTintColor="#3b82f6"
        />
        <Text className="text-[10px] text-muted-foreground italic mt-1">
          Scales all FTP and Pace targets for this session.
        </Text>
      </View>

      {/* 2. Threshold HR Adjustment */}
      {baseThresholdHr && (
        <View className="mt-4">
          <View className="flex-row justify-between items-end mb-2">
            <Text className="text-sm font-medium text-muted-foreground">
              Threshold HR
            </Text>
            <Text className="text-lg font-bold">{baseThresholdHr} bpm</Text>
          </View>
          <Slider
            value={baseThresholdHr}
            minimumValue={100}
            maximumValue={220}
            step={1}
            onSlidingComplete={(v) => updateMetrics({ thresholdHr: v })}
            minimumTrackTintColor="#ef4444"
            thumbTintColor="#ef4444"
          />
        </View>
      )}

      {/* 3. Weight Adjustment */}
      {baseWeight && (
        <View className="mt-4">
          <View className="flex-row justify-between items-end mb-2">
            <Text className="text-sm font-medium text-muted-foreground">
              Body Weight
            </Text>
            <Text className="text-lg font-bold">{baseWeight} kg</Text>
          </View>
          <Slider
            value={baseWeight}
            minimumValue={40}
            maximumValue={150}
            step={0.5}
            onSlidingComplete={(v) => updateMetrics({ weightKg: v })}
            minimumTrackTintColor="#10b981"
            thumbTintColor="#10b981"
          />
        </View>
      )}
    </View>
  );
}
