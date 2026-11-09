import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { Dimensions, View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import type { InsightTimelinePoint } from "@/components/charts/PlanVsActualChart";

interface PlanAdherenceMiniChartProps {
  timeline: InsightTimelinePoint[];
}

type AdherenceChartDatum = Record<string, unknown> & {
  index: number;
  adherence: number;
};

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

export function PlanAdherenceMiniChart({ timeline }: PlanAdherenceMiniChartProps) {
  const width = Math.max(130, Math.floor((Dimensions.get("window").width - 52) / 2));

  const chartData = useMemo<AdherenceChartDatum[]>(
    () =>
      timeline.map((point, index) => ({
        index,
        adherence: Math.max(0, Math.min(100, point.adherence_score ?? 0)),
      })),
    [timeline],
  );
  const adherence = useMemo(() => chartData.map((point) => point.adherence), [chartData]);
  const start = adherence[0] ?? 0;
  const end = adherence[adherence.length - 1] ?? 0;
  const latestBoundary = timeline[timeline.length - 1]?.boundary_state;
  const latestTint = boundaryTint(latestBoundary);

  return (
    <View className="bg-card border border-border rounded-lg p-3 flex-1 min-h-40">
      <Text className="text-sm font-semibold mb-1">Adherence</Text>
      <Text className="text-[11px] text-muted-foreground mb-2">Trend</Text>

      {chartData.length > 0 ? (
        <View style={{ height: 70, width }}>
          <CartesianChart<AdherenceChartDatum, "index", "adherence">
            data={chartData}
            xKey="index"
            yKeys={["adherence"]}
            domain={{ y: [0, 100] }}
            padding={{ left: 4, right: 4, top: 6, bottom: 6 }}
          >
            {({ points }) => (
              <Line points={points.adherence} color="rgba(249, 115, 22, 1)" strokeWidth={2} />
            )}
          </CartesianChart>
        </View>
      ) : (
        <View className="h-[70px] items-center justify-center bg-muted/40 rounded">
          <Text className="text-xs text-muted-foreground">No data</Text>
        </View>
      )}

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-[11px] text-muted-foreground">{Math.round(start)}%</Text>
        <View className={`px-2 py-0.5 rounded-full ${latestTint.container}`}>
          <Text className={`text-[10px] font-medium ${latestTint.text}`}>{Math.round(end)}%</Text>
        </View>
      </View>
    </View>
  );
}
