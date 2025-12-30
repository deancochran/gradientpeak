import { ChartSkeleton, EmptyStateCard } from "@/components/shared";
import { Text } from "@/components/ui/text";
import { Activity } from "lucide-react-native";
import { View } from "react-native";
import { IntensityDistributionChart } from "@/components/charts";

interface IntensityDistribution {
  recovery: number;
  endurance: number;
  tempo: number;
  threshold: number;
  vo2max: number;
  anaerobic: number;
  neuromuscular: number;
}

interface IntensityData {
  distribution: IntensityDistribution;
  totalActivities: number;
  activitiesWithIntensity: number;
  totalTSS: number;
  recommendations: string[];
}

interface IntensityTabProps {
  intensityData: IntensityData | null;
  intensityLoading: boolean;
  dateRange: { start_date: string; end_date: string };
  onZonePress: (config: {
    title: string;
    subtitle?: string;
    dateFrom: string;
    dateTo: string;
    intensityZone: string;
  }) => void;
}

export function IntensityTab({
  intensityData,
  intensityLoading,
  dateRange,
  onZonePress,
}: IntensityTabProps) {
  if (intensityLoading) {
    return <ChartSkeleton height={320} />;
  }

  if (!intensityData) {
    return (
      <EmptyStateCard
        icon={Activity}
        title="No Intensity Data"
        description="Complete activities with power data to see your training intensity distribution and zones."
        iconColor="text-purple-500"
      />
    );
  }

  const distributionPercent = {
    recovery: intensityData.distribution.recovery || 0,
    endurance: intensityData.distribution.endurance || 0,
    tempo: intensityData.distribution.tempo || 0,
    threshold: intensityData.distribution.threshold || 0,
    vo2max: intensityData.distribution.vo2max || 0,
    anaerobic: intensityData.distribution.anaerobic || 0,
    neuromuscular: intensityData.distribution.neuromuscular || 0,
  };

  const totalActivities = intensityData.totalActivities || 0;
  const activitiesWithIntensity = intensityData.activitiesWithIntensity || 0;
  const totalTSS = intensityData.totalTSS || 0;
  const recommendations = intensityData.recommendations || [];

  const intensities = [
    {
      key: "recovery",
      label: "Recovery",
      description: "< 0.55 IF",
      color: "bg-blue-400",
      emoji: "🔵",
    },
    {
      key: "endurance",
      label: "Endurance",
      description: "0.55-0.75 IF",
      color: "bg-green-400",
      emoji: "🟢",
    },
    {
      key: "tempo",
      label: "Tempo",
      description: "0.75-0.85 IF",
      color: "bg-yellow-400",
      emoji: "🟡",
    },
    {
      key: "threshold",
      label: "Threshold",
      description: "0.85-0.95 IF",
      color: "bg-orange-400",
      emoji: "🟠",
    },
    {
      key: "vo2max",
      label: "VO2max",
      description: "0.95-1.05 IF",
      color: "bg-red-400",
      emoji: "🔴",
    },
    {
      key: "anaerobic",
      label: "Anaerobic",
      description: "1.05-1.15 IF",
      color: "bg-red-600",
      emoji: "🔥",
    },
    {
      key: "neuromuscular",
      label: "Sprint",
      description: "> 1.15 IF",
      color: "bg-purple-600",
      emoji: "⚡",
    },
  ];

  const zoneLabels: Record<string, string> = {
    recovery: "Recovery",
    endurance: "Endurance",
    tempo: "Tempo",
    threshold: "Threshold",
    vo2max: "VO2max",
    anaerobic: "Anaerobic",
    neuromuscular: "Sprint",
  };

  return (
    <View className="space-y-4">
      {/* Intensity Distribution Chart */}
      <IntensityDistributionChart
        data={distributionPercent}
        totalTSS={totalTSS}
        onZonePress={(zoneKey) => {
          onZonePress({
            title: `${zoneLabels[zoneKey]} Zone Activities`,
            subtitle: `Activities in the ${zoneLabels[zoneKey].toLowerCase()} intensity zone`,
            dateFrom: dateRange.start_date,
            dateTo: dateRange.end_date,
            intensityZone: zoneKey,
          });
        }}
        height={320}
      />

      {/* Info Banner */}
      <View className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <Text className="text-sm font-semibold text-blue-900 mb-1">
          📊 Intensity Calculated from IF
        </Text>
        <Text className="text-xs text-blue-700">
          Zones are calculated from your actual Intensity Factor (IF) after each
          activity. This shows your real training distribution.
        </Text>
      </View>

      {/* Summary */}
      <View className="bg-card rounded-lg border border-border p-4">
        <Text className="text-base font-semibold text-foreground mb-2">
          Intensity Distribution Details
        </Text>
        <Text className="text-sm text-muted-foreground">
          {totalActivities} total activities • {activitiesWithIntensity} with
          power data
        </Text>
        <Text className="text-xs text-muted-foreground mt-1">
          Total TSS: {totalTSS}
        </Text>
      </View>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <View className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <Text className="text-sm font-semibold text-blue-900 mb-2">
            💡 Training Insights
          </Text>
          {recommendations.map((rec, index) => (
            <Text key={index} className="text-xs text-blue-700 mb-1">
              • {rec}
            </Text>
          ))}
        </View>
      )}

      {/* Distribution Bars */}
      <View className="bg-card rounded-lg border border-border overflow-hidden">
        {intensities.map((intensity, index) => {
          const percentage =
            distributionPercent[
              intensity.key as keyof typeof distributionPercent
            ];

          return (
            <View
              key={intensity.key}
              className={`p-4 ${index !== intensities.length - 1 ? "border-b border-border" : ""}`}
            >
              <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center flex-1">
                  <Text className="text-lg mr-2">{intensity.emoji}</Text>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      {intensity.label}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {intensity.description}
                    </Text>
                  </View>
                </View>
                <Text className="text-sm font-semibold text-foreground">
                  {percentage.toFixed(1)}%
                </Text>
              </View>

              {/* Progress Bar */}
              <View className="h-3 bg-muted rounded-full overflow-hidden">
                <View
                  className={`h-full ${intensity.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </View>

              {/* TSS breakdown */}
              <Text className="text-xs text-muted-foreground mt-1">
                {percentage > 0
                  ? `${percentage.toFixed(1)}% of total TSS`
                  : "No activities in this zone"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Guidance */}
      <View className="bg-muted/50 border border-border rounded-lg p-4">
        <Text className="text-sm font-semibold text-foreground mb-2">
          💡 Training Distribution Tips
        </Text>
        <Text className="text-xs text-card-foreground leading-5">
          • <Text className="font-semibold">80/20 Rule:</Text> 80%
          recovery/endurance, 20% threshold/vo2max/anaerobic{"\n"}•{" "}
          <Text className="font-semibold">Polarized:</Text> Lots of endurance +
          some vo2max/anaerobic, minimal tempo/threshold{"\n"}•{" "}
          <Text className="font-semibold">Pyramidal:</Text> Most endurance,
          moderate tempo, least threshold/vo2max
        </Text>
      </View>
    </View>
  );
}
