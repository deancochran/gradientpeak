import { TrendsOverviewSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { View } from "react-native";
import {
  TrainingLoadChart,
  type TrainingLoadData,
  ZoneDistributionOverTimeChart,
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

  return (
    <View className="gap-4">
      {currentStatus && (
        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
            Current Load-History Balance
          </Text>
          <Text className="text-3xl font-bold text-foreground">
            TSB: {currentStatus.tsb > 0 ? "+" : ""}
            {currentStatus.tsb}
          </Text>
          <Text className="text-sm text-muted-foreground mt-2">
            Difference between the 42-day and 7-day load-history averages
          </Text>
        </View>
      )}

      <TrainingLoadChart data={dataPoints} height={300} />

      {currentStatus && (
        <View className="gap-3 rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Training Load Metrics</Text>
          <FitnessMetricRow
            label="Chronic Training Load (CTL)"
            subtitle="42-day load-history average"
            value={`${currentStatus.ctl}`}
            valueClassName="text-foreground"
          />
          <View className="h-px bg-border" />
          <FitnessMetricRow
            label="Acute Training Load (ATL)"
            subtitle="7-day load-history average"
            value={`${currentStatus.atl}`}
            valueClassName="text-foreground"
          />
          <View className="h-px bg-border" />
          <FitnessMetricRow
            label="Training Stress Balance (TSB)"
            subtitle="Difference between CTL and ATL"
            value={`${currentStatus.tsb > 0 ? "+" : ""}${currentStatus.tsb}`}
            valueClassName="text-foreground"
          />
        </View>
      )}

      {zoneDistributionData && zoneDistributionData.weeklyData.length > 0 && (
        <ZoneDistributionOverTimeChart data={zoneDistributionData.weeklyData} height={350} />
      )}

      <View className="gap-2 rounded-lg border border-border bg-card p-4">
        <Text className="text-base font-semibold text-foreground">About Load History</Text>
        <Text className="text-sm text-muted-foreground">
          CTL and ATL summarize recorded training load over different time windows. TSB shows the
          difference between those summaries. These values describe past activity data and do not
          assess readiness or predict outcomes.
        </Text>
      </View>
    </View>
  );
}

function FitnessMetricRow({
  label,
  subtitle,
  value,
  valueClassName,
}: {
  label: string;
  subtitle: string;
  value: string;
  valueClassName: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-sm text-card-foreground">{label}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
      <Text className={`text-2xl font-bold ${valueClassName}`}>{value}</Text>
    </View>
  );
}
