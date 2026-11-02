import { Text } from "@repo/ui/components/text";
import type React from "react";
import { ActivityIndicator, View } from "react-native";

type TrainingPathSelectedDayPanelProps = {
  action?: React.ReactNode;
  children: React.ReactNode;
  emptyState?: string;
  eventCount: number;
  loading?: boolean;
  metadata?: string[];
  metrics?: Array<{ label: string; value: string }>;
  testID?: string;
  title: string;
};

export function TrainingPathSelectedDayPanel({
  action,
  children,
  emptyState = "No planned or completed work for this day.",
  eventCount,
  loading = false,
  metadata = [],
  metrics = [],
  testID = "training-path-selected-day-panel",
  title,
}: TrainingPathSelectedDayPanelProps) {
  const hasChildren = eventCount > 0;

  return (
    <View
      className="gap-3 rounded-2xl bg-card px-3 py-3"
      testID={loading ? `${testID}-loading` : testID}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="min-w-0 flex-1 text-base font-semibold text-foreground"
              numberOfLines={1}
            >
              {title}
            </Text>
            {loading ? (
              <ActivityIndicator size="small" testID={`${testID}-loading-indicator`} />
            ) : null}
          </View>
          {metadata.length > 0 ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={2}>
              {metadata.join(" · ")}
            </Text>
          ) : null}
        </View>
        {action ? <View className="shrink-0">{action}</View> : null}
      </View>

      {metrics.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
          {metrics.map((metric) => (
            <InlineDayMetric key={`${metric.label}-${metric.value}`} {...metric} />
          ))}
        </View>
      ) : null}

      <View className="gap-2">
        {loading ? (
          <Text className="text-xs text-muted-foreground">Loading selected day.</Text>
        ) : hasChildren ? (
          children
        ) : (
          <Text className="text-xs text-muted-foreground">{emptyState}</Text>
        )}
      </View>
    </View>
  );
}

function InlineDayMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text className="text-[10px] font-medium text-muted-foreground">{label}</Text>
      <Text className="text-xs font-semibold text-foreground">{value}</Text>
    </View>
  );
}
