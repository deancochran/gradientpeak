import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { TrendsOverviewSkeleton } from "@repo/ui/components/loading-skeletons";
import { Text } from "@repo/ui/components/text";
import { TrendingUp } from "lucide-react-native";
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
    <View className="gap-4">
      {currentStatus && (
        <View className="rounded-lg border border-border bg-card p-4">
          <Text className="mb-2 text-sm font-medium text-muted-foreground">
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

      <TrainingLoadChart data={dataPoints} height={300} />

      {currentStatus && (
        <View className="gap-3 rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Training Load Metrics</Text>
          <FitnessMetricRow
            label="Chronic Training Load (CTL)"
            subtitle="42-day fitness"
            value={`${currentStatus.ctl}`}
            valueClassName="text-blue-600"
          />
          <View className="h-px bg-border" />
          <FitnessMetricRow
            label="Acute Training Load (ATL)"
            subtitle="7-day fatigue"
            value={`${currentStatus.atl}`}
            valueClassName="text-orange-600"
          />
          <View className="h-px bg-border" />
          <FitnessMetricRow
            label="Training Stress Balance (TSB)"
            subtitle="Form indicator"
            value={`${currentStatus.tsb > 0 ? "+" : ""}${currentStatus.tsb}`}
            valueClassName={
              currentStatus.tsb > 0
                ? "text-green-600"
                : currentStatus.tsb < -10
                  ? "text-orange-500"
                  : "text-foreground"
            }
          />
        </View>
      )}

      {zoneDistributionData && zoneDistributionData.weeklyData.length > 0 && (
        <ZoneDistributionOverTimeChart data={zoneDistributionData.weeklyData} height={350} />
      )}

      <View className="gap-2 rounded-lg border border-border bg-card p-4">
        <Text className="text-base font-semibold text-foreground">Understanding Form Status</Text>
        <StatusGuideRow
          colorClassName="bg-green-600"
          title="Fresh (TSB > +25)"
          subtitle="Well rested, ready to race"
        />
        <StatusGuideRow
          colorClassName="bg-blue-600"
          title="Optimal (+5 to +25)"
          subtitle="Peak performance zone"
        />
        <StatusGuideRow
          colorClassName="bg-gray-600"
          title="Neutral (-10 to +5)"
          subtitle="Balanced training state"
        />
        <StatusGuideRow
          colorClassName="bg-orange-600"
          title="Tired (-30 to -10)"
          subtitle="Productive fatigue, recovery needed"
        />
        <StatusGuideRow
          colorClassName="bg-red-600"
          title="Overreaching (TSB < -30)"
          subtitle="High fatigue, risk of overtraining"
        />
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

function StatusGuideRow({
  colorClassName,
  subtitle,
  title,
}: {
  colorClassName: string;
  subtitle: string;
  title: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-3 w-3 rounded-full ${colorClassName}`} />
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
    </View>
  );
}
