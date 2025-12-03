import { EmptyStateCard, TrendsOverviewSkeleton } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import {
  TrainingLoadChart,
  type TrainingLoadData,
} from "../../app/(internal)/(tabs)/trends/components/charts";

interface Status {
  form: string;
  ctl: number;
  atl: number;
  tsb: number;
  weekProgress: {
    completedTSS: number;
    targetTSS: number;
    completedActivities: number;
    totalPlannedActivities: number;
  };
}

interface ActualCurve {
  dataPoints: Array<{
    date: string;
    ctl: number | null;
    atl: number | null;
    tsb: number | null;
  }>;
}

interface IdealCurve {
  targetCTL: number;
  startCTL: number;
  targetDate: string;
}

interface OverviewTabProps {
  status: Status | null;
  statusLoading: boolean;
  actualCurve: ActualCurve | null;
  idealCurve: IdealCurve | null;
  timeRange: string;
}

export function OverviewTab({
  status,
  statusLoading,
  actualCurve,
  idealCurve,
  timeRange,
}: OverviewTabProps) {
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
      case "overreached":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  if (statusLoading) {
    return <TrendsOverviewSkeleton />;
  }

  if (!status) {
    return (
      <EmptyStateCard
        icon={TrendingUp}
        title="No Training Data"
        description="Start tracking your activities to see your training trends and progress metrics."
        iconColor="text-blue-500"
      />
    );
  }

  return (
    <View className="space-y-4">
      {/* Current Status Card */}
      <View className="p-4 rounded-lg border bg-card border-border">
        <Text className="text-sm font-medium text-muted-foreground mb-2">
          Current Form Status
        </Text>
        <Text
          className={`text-3xl font-bold ${getFormStatusColor(status.form)} capitalize`}
        >
          {status.form}
        </Text>
        <Text className="text-sm text-muted-foreground mt-2">
          TSB: {status.tsb > 0 ? "+" : ""}
          {status.tsb}
        </Text>
      </View>

      {/* Training Load Chart */}
      {actualCurve &&
        actualCurve.dataPoints &&
        actualCurve.dataPoints.length > 0 && (
          <TrainingLoadChart
            data={actualCurve.dataPoints.map(
              (point): TrainingLoadData => ({
                date: point.date,
                ctl: point.ctl || 0,
                atl: point.atl || 0,
                tsb: point.tsb || 0,
              }),
            )}
            height={250}
          />
        )}

      {/* Training Metrics */}
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
            <Text className="text-2xl font-bold text-foreground">
              {status.ctl}
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
            <Text className="text-2xl font-bold text-foreground">
              {status.atl}
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
              className={`text-2xl font-bold ${status.tsb > 0 ? "text-green-600" : status.tsb < -10 ? "text-orange-500" : "text-foreground"}`}
            >
              {status.tsb > 0 ? "+" : ""}
              {status.tsb}
            </Text>
          </View>
        </View>
      </View>

      {/* Week Progress */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-3">
          This Week's Progress
        </Text>

        <View className="gap-3">
          <View>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-sm text-card-foreground">Weekly TSS</Text>
              <Text className="text-sm font-medium text-foreground">
                {status.weekProgress.completedTSS} /{" "}
                {status.weekProgress.targetTSS}
              </Text>
            </View>
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View
                className="h-full bg-blue-500"
                style={{
                  width: `${Math.min((status.weekProgress.completedTSS / status.weekProgress.targetTSS) * 100, 100)}%`,
                }}
              />
            </View>
          </View>

          <View>
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-sm text-card-foreground">Activities</Text>
              <Text className="text-sm font-medium text-foreground">
                {status.weekProgress.completedActivities} /{" "}
                {status.weekProgress.totalPlannedActivities}
              </Text>
            </View>
            <View className="h-2 bg-muted rounded-full overflow-hidden">
              <View
                className="h-full bg-green-500"
                style={{
                  width: `${Math.min((status.weekProgress.completedActivities / status.weekProgress.totalPlannedActivities) * 100, 100)}%`,
                }}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Training Curve Summary */}
      {actualCurve && actualCurve.dataPoints.length > 0 && (
        <View className="bg-card rounded-lg border border-border p-4">
          <Text className="text-base font-semibold text-foreground mb-3">
            Training Trend ({timeRange})
          </Text>
          <Text className="text-sm text-muted-foreground mb-2">
            {actualCurve.dataPoints.length} days of data
          </Text>

          {idealCurve && (
            <View className="mt-2 p-3 bg-blue-50 rounded-lg">
              <Text className="text-sm text-gray-700">
                📈 Target CTL: {idealCurve.targetCTL}
              </Text>
              <Text className="text-xs text-gray-600 mt-1">
                Starting: {idealCurve.startCTL} → Target by{" "}
                {new Date(idealCurve.targetDate).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
