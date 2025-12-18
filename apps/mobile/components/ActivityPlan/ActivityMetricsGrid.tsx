import { memo } from "react";
import { View } from "react-native";
import { Activity, Clock, TrendingUp, Zap } from "lucide-react-native";
import {
  type ActivityPlanStructureV2,
  calculateActivityStatsV2,
  formatDurationCompact,
} from "@repo/core";
import { Text } from "@/components/ui/text";
import { MetricCard } from "./MetricCard";

interface ActivityMetricsGridProps {
  structure: ActivityPlanStructureV2;
}

export const ActivityMetricsGrid = memo<ActivityMetricsGridProps>(
  function ActivityMetricsGrid({ structure }) {
    const stats = calculateActivityStatsV2(structure);

    return (
      <View className="gap-3 mb-4">
        <Text className="text-sm font-medium mb-2">Activity Overview</Text>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1">
            <MetricCard
              icon={Clock}
              label="Duration"
              value={formatDurationCompact(stats.totalDuration)}
              color="text-blue-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={Activity}
              label="Steps"
              value={stats.totalSteps.toString()}
              subtitle={`${stats.intervalCount} intervals`}
              color="text-green-500"
            />
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <MetricCard
              icon={Zap}
              label="Avg Power"
              value={`${Math.round(stats.avgPower)}%`}
              subtitle="FTP target"
              color="text-yellow-500"
            />
          </View>
          <View className="flex-1">
            <MetricCard
              icon={TrendingUp}
              label="Est. TSS"
              value={`${Math.round(stats.estimatedTSS)}`}
              subtitle={`~${Math.round(stats.estimatedCalories)} cal`}
              color="text-purple-500"
            />
          </View>
        </View>
      </View>
    );
  },
);

ActivityMetricsGrid.displayName = "ActivityMetricsGrid";
