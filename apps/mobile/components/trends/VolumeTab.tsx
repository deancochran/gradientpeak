import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { TrendsOverviewSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { type VolumeDataPoint, VolumeTrendsChart } from "@/components/charts";

interface VolumeTrendsData {
  dataPoints: VolumeDataPoint[];
  totals: {
    totalDistance: number;
    totalTime: number;
    totalActivities: number;
  } | null;
}

interface VolumeTabProps {
  volumeData: VolumeTrendsData | null;
  volumeLoading: boolean;
  timeRange: string;
}

export function VolumeTab({ volumeData, volumeLoading, timeRange }: VolumeTabProps) {
  if (volumeLoading) {
    return <TrendsOverviewSkeleton />;
  }

  const dataPoints = volumeData?.dataPoints ?? [];
  const totals = volumeData?.totals ?? null;

  // Calculate averages
  const avgDistance = totals ? totals.totalDistance / totals.totalActivities : 0;
  const avgTime = totals ? totals.totalTime / totals.totalActivities : 0;

  return (
    <View className="gap-4">
      <VolumeTrendsChart data={dataPoints} height={300} />

      {totals && (
        <View className="gap-3 rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">{timeRange} Summary</Text>
          <VolumeMetricRow
            label="Total Distance"
            subtitle={`Avg: ${(avgDistance / 1000).toFixed(1)} km per activity`}
            value={`${(totals.totalDistance / 1000).toFixed(1)} km`}
            valueClassName="text-blue-600"
          />
          <View className="h-px bg-border" />
          <VolumeMetricRow
            label="Total Time"
            subtitle={`Avg: ${(avgTime / 3600).toFixed(1)} h per activity`}
            value={`${(totals.totalTime / 3600).toFixed(1)} h`}
            valueClassName="text-green-600"
          />
          <View className="h-px bg-border" />
          <VolumeMetricRow
            label="Total Activities"
            subtitle={`${dataPoints.length} weeks of data`}
            value={`${totals.totalActivities}`}
            valueClassName="text-orange-600"
          />
        </View>
      )}

      {dataPoints.length > 0 && (
        <View className="gap-2 rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Weekly Averages</Text>
          <AverageRow
            label="Distance per week"
            value={`${(
              dataPoints.reduce((sum, d) => sum + d.totalDistance, 0) / dataPoints.length / 1000
            ).toFixed(1)} km`}
          />
          <AverageRow
            label="Time per week"
            value={`${(
              dataPoints.reduce((sum, d) => sum + d.totalTime, 0) / dataPoints.length / 3600
            ).toFixed(1)} h`}
          />
          <AverageRow
            label="Activities per week"
            value={`${(
              dataPoints.reduce((sum, d) => sum + d.activityCount, 0) / dataPoints.length
            ).toFixed(1)}`}
          />
        </View>
      )}
    </View>
  );
}

function VolumeMetricRow({
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

function AverageRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-card-foreground">{label}</Text>
      <Text className="text-base font-semibold text-foreground">{value}</Text>
    </View>
  );
}
