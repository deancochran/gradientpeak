import { Text } from "@/components/ui/text";
import { useColorScheme } from "nativewind";
import { Dimensions, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import type { InsightTimelinePoint } from "@/components/charts/PlanVsActualChart";

interface PlanAdherenceMiniChartProps {
  timeline: InsightTimelinePoint[];
}

function boundaryTint(boundary?: string) {
  if (boundary === "safe") {
    return {
      container: "bg-emerald-500/15",
      text: "text-emerald-700 dark:text-emerald-300",
    };
  }
  if (boundary === "caution") {
    return {
      container: "bg-amber-500/15",
      text: "text-amber-700 dark:text-amber-300",
    };
  }
  return {
    container: "bg-red-500/15",
    text: "text-red-700 dark:text-red-300",
  };
}

export function PlanAdherenceMiniChart({
  timeline,
}: PlanAdherenceMiniChartProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const width = Math.max(
    130,
    Math.floor((Dimensions.get("window").width - 52) / 2),
  );

  const adherence = timeline.map((point) =>
    Math.max(0, Math.min(100, point.adherence_score)),
  );
  const start = adherence[0] ?? 0;
  const end = adherence[adherence.length - 1] ?? 0;
  const latestBoundary = timeline[timeline.length - 1]?.boundary_state;
  const latestTint = boundaryTint(latestBoundary);

  return (
    <View className="bg-card border border-border rounded-lg p-3 flex-1 min-h-40">
      <Text className="text-sm font-semibold mb-1">Adherence</Text>
      <Text className="text-[11px] text-muted-foreground mb-2">Trend</Text>

      {adherence.length > 0 ? (
        <LineChart
          data={{ labels: [], datasets: [{ data: adherence }] }}
          width={width}
          height={70}
          withDots={false}
          withHorizontalLabels={false}
          withVerticalLabels={false}
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLines={false}
          withHorizontalLines={false}
          chartConfig={{
            backgroundColor: isDark ? "#0a0a0a" : "#ffffff",
            backgroundGradientFrom: isDark ? "#0a0a0a" : "#ffffff",
            backgroundGradientTo: isDark ? "#0a0a0a" : "#ffffff",
            decimalPlaces: 0,
            color: () => "rgba(249, 115, 22, 1)",
            labelColor: () => "rgba(0,0,0,0)",
            propsForBackgroundLines: { strokeWidth: 0 },
          }}
          bezier
          style={{ marginLeft: -20, paddingRight: 8 }}
        />
      ) : (
        <View className="h-[70px] items-center justify-center bg-muted/40 rounded">
          <Text className="text-xs text-muted-foreground">No data</Text>
        </View>
      )}

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-[11px] text-muted-foreground">
          {Math.round(start)}%
        </Text>
        <View className={`px-2 py-0.5 rounded-full ${latestTint.container}`}>
          <Text className={`text-[10px] font-medium ${latestTint.text}`}>
            {Math.round(end)}%
          </Text>
        </View>
      </View>
    </View>
  );
}
