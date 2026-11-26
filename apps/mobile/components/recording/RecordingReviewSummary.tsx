import { Text } from "@repo/ui/components/text";
import { View } from "react-native";

interface RecordingReviewSummaryProps {
  activityCategory: string;
  durationSeconds: number;
  movingSeconds: number;
  distanceMeters: number;
  calories: number | null | undefined;
  laps: readonly number[];
}

export function RecordingReviewSummary({
  activityCategory,
  durationSeconds,
  movingSeconds,
  distanceMeters,
  calories,
  laps,
}: RecordingReviewSummaryProps) {
  const metrics = [
    { label: "Time", value: formatDuration(durationSeconds) },
    { label: "Moving", value: formatDuration(movingSeconds) },
    { label: "Distance", value: `${(distanceMeters / 1000).toFixed(2)} km` },
    ...(calories && calories > 0
      ? [{ label: "Calories", value: `${Math.round(calories)} cal` }]
      : []),
  ];

  return (
    <View className="gap-4" testID="recording-review-summary">
      <View>
        <Text className="text-lg font-bold text-foreground">Review your {activityCategory}</Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your recording is saved on this device. Add notes and choose who can see it before saving.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2" testID="recording-review-metrics">
        {metrics.map((metric) => (
          <View
            key={metric.label}
            className="min-w-24 flex-1 rounded-xl border border-border bg-card px-3 py-2"
          >
            <Text className="text-xs font-medium text-muted-foreground">{metric.label}</Text>
            <Text className="mt-1 text-base font-bold text-foreground">{metric.value}</Text>
          </View>
        ))}
      </View>

      {laps.length > 0 ? (
        <View
          className="rounded-xl border border-border bg-card p-3"
          testID="recording-review-laps"
        >
          <Text className="text-sm font-bold text-foreground">Laps · {laps.length}</Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            {laps
              .map((lap, index) => `Lap ${index + 1} ${formatDuration(lap / 1000)}`)
              .join("  ·  ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`
    : `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
