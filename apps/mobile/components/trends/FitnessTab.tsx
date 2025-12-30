import { EmptyStateCard, TrendsOverviewSkeleton } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import {
  TrainingLoadChart,
  ZoneDistributionOverTimeChart,
  type TrainingLoadData,
  type ZoneDistributionWeekData,
} from "@/components/charts";

interface FitnessTabProps {
  trainingLoadData: {
    dataPoints: TrainingLoadData[];
    currentStatus: {
      ctl: number;
      atl: number;
      tsb: number;
      form: string;
    } | null;
  } | null;
  zoneDistributionData: {
    weeklyData: ZoneDistributionWeekData[];
  } | null;
  fitnessLoading: boolean;
  timeRange: string;
}

export function FitnessTab({
  trainingLoadData,
  zoneDistributionData,
  fitnessLoading,
  timeRange,
}: FitnessTabProps) {
  if (fitnessLoading) {
    return <TrendsOverviewSkeleton />;
  }

  const dataPoints = trainingLoadData?.dataPoints ?? [];
  const currentStatus = trainingLoadData?.currentStatus ?? null;

  const getFormStatusColor = (form: string): string => {
    switch (form) {
      case "fresh":
        return "text-green-600";
      case "optimal":
        return "text-blue-600";
      case "neutral":
        return "text-muted-foreground";
      case "tired":
        return "text-orange-600";
      case "overreaching":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <View className="space-y-4">
      {/* Current Status */}
      {currentStatus && (
        <View className="p-4 rounded-lg border bg-card border-border">
          <Text className="text-sm font-medium text-muted-foreground mb-2">
            Current Form Status
          </Text>
          <Text
            className={`text-3xl font-bold ${getFormStatusColor(currentStatus.form)} capitalize`}
          >
            {currentStatus.form}
          </Text>
          <Text className="text-sm text-muted-foreground mt-2">
            TSB: {currentStatus.tsb > 0 ? "+" : ""}
            {currentStatus.tsb}
          </Text>
        </View>
      )}

      {/* Training Load Chart */}
      <TrainingLoadChart data={dataPoints} height={300} />

      {/* Training Metrics */}
      {currentStatus && (
        <View className="bg-card rounded-lg border border-border p-4">
          <Text className="text-base font-semibold text-foreground mb-3">
            Training Load Metrics
          </Text>

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">
                  Chronic Training Load (CTL)
                </Text>
                <Text className="text-xs text-muted-foreground">
                  42-day fitness
                </Text>
              </View>
              <Text className="text-2xl font-bold text-blue-600">
                {currentStatus.ctl}
              </Text>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">
                  Acute Training Load (ATL)
                </Text>
                <Text className="text-xs text-muted-foreground">
                  7-day fatigue
                </Text>
              </View>
              <Text className="text-2xl font-bold text-orange-600">
                {currentStatus.atl}
              </Text>
            </View>

            <View className="h-px bg-border" />

            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-sm text-card-foreground">
                  Training Stress Balance (TSB)
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Form indicator
                </Text>
              </View>
              <Text
                className={`text-2xl font-bold ${currentStatus.tsb > 0 ? "text-green-600" : currentStatus.tsb < -10 ? "text-orange-500" : "text-foreground"}`}
              >
                {currentStatus.tsb > 0 ? "+" : ""}
                {currentStatus.tsb}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Zone Distribution Over Time */}
      {zoneDistributionData && zoneDistributionData.weeklyData.length > 0 && (
        <ZoneDistributionOverTimeChart
          data={zoneDistributionData.weeklyData}
          height={350}
        />
      )}

      {/* Form Status Guide */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          Understanding Form Status
        </Text>

        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-green-600" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Fresh (TSB &gt; +25)
              </Text>
              <Text className="text-xs text-muted-foreground">
                Well rested, ready to race
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-blue-600" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Optimal (+5 to +25)
              </Text>
              <Text className="text-xs text-muted-foreground">
                Peak performance zone
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-gray-600" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Neutral (-10 to +5)
              </Text>
              <Text className="text-xs text-muted-foreground">
                Balanced training state
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-orange-600" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Tired (-30 to -10)
              </Text>
              <Text className="text-xs text-muted-foreground">
                Productive fatigue, recovery needed
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <View className="w-3 h-3 rounded-full bg-red-600" />
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">
                Overreaching (TSB &lt; -30)
              </Text>
              <Text className="text-xs text-muted-foreground">
                High fatigue, risk of overtraining
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
