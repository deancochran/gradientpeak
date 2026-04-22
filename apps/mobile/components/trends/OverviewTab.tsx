import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { TrendsOverviewSkeleton } from "@repo/ui/components/loading-skeletons";
import { Progress } from "@repo/ui/components/progress";
import { Text } from "@repo/ui/components/text";
import { TrendingUp } from "lucide-react-native";
import { View } from "react-native";
import { TrainingLoadChart, type TrainingLoadData } from "@/components/charts";

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
    <View className="gap-4">
      <View className="rounded-lg border border-border bg-card p-4">
        <Text className="mb-2 text-sm font-medium text-muted-foreground">Current Form Status</Text>
        <Text className={`text-3xl font-bold ${getFormStatusColor(status.form)} capitalize`}>
          {status.form}
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground">
          TSB: {status.tsb > 0 ? "+" : ""}
          {status.tsb}
        </Text>
      </View>

      {actualCurve && actualCurve.dataPoints && actualCurve.dataPoints.length > 0 && (
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

      <View className="gap-3 rounded-lg border border-border bg-card p-4">
        <Text className="text-base font-semibold text-foreground">Training Load Metrics</Text>
        <MetricRow
          label="Chronic Training Load (CTL)"
          subtitle="42-day fitness"
          value={`${status.ctl}`}
        />
        <View className="h-px bg-border" />
        <MetricRow
          label="Acute Training Load (ATL)"
          subtitle="7-day fatigue"
          value={`${status.atl}`}
        />
        <View className="h-px bg-border" />
        <MetricRow
          label="Training Stress Balance (TSB)"
          subtitle="Form indicator"
          value={`${status.tsb > 0 ? "+" : ""}${status.tsb}`}
          valueClassName={
            status.tsb > 0
              ? "text-green-600"
              : status.tsb < -10
                ? "text-orange-500"
                : "text-foreground"
          }
        />
      </View>

      <View className="gap-3 rounded-lg border border-border bg-card p-4">
        <Text className="text-base font-semibold text-foreground">This Week&apos;s Progress</Text>
        <ProgressRow
          label="Weekly TSS"
          value={`${status.weekProgress.completedTSS} / ${status.weekProgress.targetTSS}`}
          progress={Math.min(
            (status.weekProgress.completedTSS / status.weekProgress.targetTSS) * 100,
            100,
          )}
          indicatorClassName="bg-blue-500"
        />
        <ProgressRow
          label="Activities"
          value={`${status.weekProgress.completedActivities} / ${status.weekProgress.totalPlannedActivities}`}
          progress={Math.min(
            (status.weekProgress.completedActivities / status.weekProgress.totalPlannedActivities) *
              100,
            100,
          )}
          indicatorClassName="bg-green-500"
        />
      </View>

      {actualCurve && actualCurve.dataPoints.length > 0 && (
        <View className="gap-2 rounded-lg border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">
            Training Trend ({timeRange})
          </Text>
          <Text className="text-sm text-muted-foreground">
            {actualCurve.dataPoints.length} days of data
          </Text>

          {idealCurve ? (
            <Text className="text-xs text-muted-foreground">
              Target CTL {idealCurve.targetCTL}. Starting at {idealCurve.startCTL} and aiming for{" "}
              {new Date(idealCurve.targetDate).toLocaleDateString()}.
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function MetricRow({
  label,
  subtitle,
  value,
  valueClassName = "text-foreground",
}: {
  label: string;
  subtitle: string;
  value: string;
  valueClassName?: string;
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

function ProgressRow({
  indicatorClassName,
  label,
  progress,
  value,
}: {
  indicatorClassName: string;
  label: string;
  progress: number;
  value: string;
}) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-card-foreground">{label}</Text>
        <Text className="text-sm font-medium text-foreground">{value}</Text>
      </View>
      <Progress value={progress} className="h-2" indicatorClassName={indicatorClassName} />
    </View>
  );
}
