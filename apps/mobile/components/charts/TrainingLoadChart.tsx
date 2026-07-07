import { Text } from "@repo/ui/components/text";
import { useMemo } from "react";
import { View } from "react-native";
import { CartesianChart, Line } from "victory-native";
import type { InsightTimelinePoint } from "./PlanVsActualChart";

export interface TrainingLoadData {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface TrainingLoadChartProps {
  data?: TrainingLoadData[];
  timeline?: InsightTimelinePoint[];
  height?: number;
}

type TrainingLoadChartDatum = Record<string, unknown> &
  TrainingLoadData & {
    index: number;
  };

type TrainingLoadChartYKey = "ctl" | "atl" | "tsb";

export function TrainingLoadChart({ data, timeline, height = 250 }: TrainingLoadChartProps) {
  const useTimeline = !!timeline && timeline.length > 0;
  const normalizedData = useMemo<TrainingLoadData[]>(
    () =>
      useTimeline
        ? (timeline ?? []).map((point) => {
            const completedLoad = point.completed_load_tss ?? point.actual_tss ?? 0;
            const scheduledLoad = point.scheduled_load_tss ?? point.scheduled_tss ?? 0;
            return {
              date: point.date,
              ctl: completedLoad,
              atl: scheduledLoad,
              tsb: completedLoad - scheduledLoad,
            };
          })
        : data || [],
    [data, timeline, useTimeline],
  );

  const isEmpty = normalizedData.length === 0;

  const recentData = useMemo<TrainingLoadChartDatum[]>(
    () => normalizedData.slice(-30).map((point, index) => ({ ...point, index })),
    [normalizedData],
  );

  return (
    <View className="bg-card rounded-lg border border-border p-4">
      <Text className="text-base font-semibold text-foreground mb-2">
        {useTimeline ? "Load Balance" : "Training Load Curve"}
      </Text>
      <Text className="text-xs text-muted-foreground mb-4">
        {useTimeline
          ? "Actual vs scheduled load with daily delta"
          : "CTL (Fitness), ATL (Fatigue), and TSB (Form) over time"}
      </Text>

      <View style={{ height: height - 50 }}>
        {isEmpty ? (
          <View className="flex-1 items-center justify-center bg-muted/30 rounded">
            <Text className="text-muted-foreground text-sm mb-1">
              {useTimeline ? "No load timeline available" : "No training load data yet"}
            </Text>
            <Text className="text-muted-foreground text-xs text-center px-4">
              {useTimeline
                ? "Add and complete sessions to compare scheduled and actual load"
                : "Complete activities to track your fitness (CTL), fatigue (ATL), and form (TSB)"}
            </Text>
          </View>
        ) : (
          <CartesianChart<TrainingLoadChartDatum, "index", TrainingLoadChartYKey>
            data={recentData}
            xKey="index"
            yKeys={["ctl", "atl", "tsb"]}
            domainPadding={{ left: 8, right: 8, top: 12, bottom: 12 }}
            padding={{ left: 4, right: 4, top: 4, bottom: 4 }}
          >
            {({ points }) => (
              <>
                <Line points={points.ctl} color="rgba(59, 130, 246, 1)" strokeWidth={3} />
                <Line points={points.atl} color="rgba(245, 158, 11, 1)" strokeWidth={3} />
                <Line points={points.tsb} color="rgba(16, 185, 129, 1)" strokeWidth={2} />
              </>
            )}
          </CartesianChart>
        )}
      </View>

      {/* Legend */}
      <View className="flex-row justify-center mt-2 gap-6">
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-blue-500 mr-1" />
          <Text className="text-xs text-muted-foreground">
            {useTimeline ? "Actual" : "CTL (Fitness)"}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-yellow-500 mr-1" />
          <Text className="text-xs text-muted-foreground">
            {useTimeline ? "Scheduled" : "ATL (Fatigue)"}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-0.5 bg-green-500 mr-1" />
          <Text className="text-xs text-muted-foreground">
            {useTimeline ? "Delta" : "TSB (Form)"}
          </Text>
        </View>
      </View>

      {/* Current values */}
      {!isEmpty && recentData.length > 0 && (
        <View className="flex-row justify-around mt-4 pt-3 border-t border-border">
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">
              {useTimeline ? "Actual Today" : "Current CTL"}
            </Text>
            <Text className="text-sm font-semibold text-blue-600">
              {Math.round(recentData[recentData.length - 1]?.ctl)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">
              {useTimeline ? "Scheduled Today" : "Current ATL"}
            </Text>
            <Text className="text-sm font-semibold text-yellow-600">
              {Math.round(recentData[recentData.length - 1]?.atl)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-xs text-muted-foreground">
              {useTimeline ? "Delta Today" : "Current TSB"}
            </Text>
            <Text
              className={`text-sm font-semibold ${
                recentData[recentData.length - 1]?.tsb > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {recentData[recentData.length - 1]?.tsb > 0 ? "+" : ""}
              {Math.round(recentData[recentData.length - 1]?.tsb)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
