import { Slider } from "@repo/ui/components/slider";
import { Text } from "@repo/ui/components/text";
import React from "react";
import { View } from "react-native";
import { useIntensityScale } from "@/lib/hooks/useActivityRecorder";
import type { ActivityRecorderService } from "@/lib/services/ActivityRecorder";

interface IntensityScalingProps {
  service: ActivityRecorderService | null;
}

export function IntensityScaling({ service }: IntensityScalingProps) {
  const { scale, baseFtp, baseThresholdPace, setIntensityScale } = useIntensityScale(service);

  const formatPace = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}/km`;
  };

  return (
    <View className="px-1">
      <View>
        <View className="mb-2 flex-row items-end justify-between">
          <View>
            <Text className="text-sm font-medium text-muted-foreground">Workout Intensity</Text>
            <Text className="text-2xl font-bold text-foreground">{Math.round(scale * 100)}%</Text>
          </View>
          <View className="items-end">
            {baseFtp && (
              <Text className="text-sm font-semibold text-foreground">
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
        <Text className="mt-1 text-[10px] italic text-muted-foreground">
          Session-only target scaling.
        </Text>
      </View>
    </View>
  );
}
