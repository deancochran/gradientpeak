import {
  type ActivityPlanStructureV3,
  calculateActivityPlanStats,
  compileActivityPlanV3,
  formatDurationCompact,
} from "@repo/core";
import { MetricCard } from "@repo/ui/components/metric-card";
import { Text } from "@repo/ui/components/text";
import { Activity, Clock, ListOrdered, Repeat } from "lucide-react-native";
import { memo } from "react";
import { View } from "react-native";

export const ActivityMetricsGrid = memo<{ structure: ActivityPlanStructureV3 }>(
  function ActivityMetricsGrid({ structure }) {
    const compiled = compileActivityPlanV3(structure);
    const stats = calculateActivityPlanStats(compiled);
    const boundaries = compiled.occurrences.filter((item) => item.role !== "activity").length;
    return (
      <View className="mb-4 gap-3">
        <Text className="mb-2 text-sm font-medium">Activity Overview</Text>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricCard
              icon={Clock}
              label="Exact time"
              value={
                stats.duration.exactElapsedSeconds === null
                  ? "Open"
                  : formatDurationCompact(stats.duration.exactElapsedSeconds)
              }
              color="text-blue-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={Activity}
              label="Occurrences"
              value={`${stats.occurrenceCount}`}
              color="text-green-500"
            />
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricCard
              icon={Repeat}
              label="Categories"
              value={`${compiled.categories.length}`}
              subtitle={compiled.categories.join(" · ")}
              color="text-yellow-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={ListOrdered}
              label="Boundaries"
              value={`${boundaries}`}
              color="text-purple-500"
            />
          </View>
        </View>
      </View>
    );
  },
);
ActivityMetricsGrid.displayName = "ActivityMetricsGrid";
