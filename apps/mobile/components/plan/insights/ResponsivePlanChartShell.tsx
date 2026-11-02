import { Text } from "@repo/ui/components/text";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Line } from "react-native-svg";

export type PlanChartGeometry = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type ChartState = "empty" | "loading" | "ready" | "unavailable";

function markerX(position: number, geometry: PlanChartGeometry) {
  const bounded = Math.max(0, Math.min(1, position));
  return geometry.left + bounded * (geometry.right - geometry.left);
}

/** One responsive frame and interaction grammar shared by Plan analysis charts. */
export function ResponsivePlanChartShell({
  axisLabel,
  children,
  emptyLabel,
  endLabel,
  goalColor,
  goalLabel = "Goal",
  goalPosition,
  gridColor,
  legend,
  onNearestX,
  selectedLabel,
  staleLabel,
  startLabel,
  state = "ready",
  summary,
  testID,
  todayColor,
  todayLabel = "Today",
  todayPosition,
  yLabels,
}: {
  axisLabel: string;
  children: (geometry: PlanChartGeometry) => ReactNode;
  emptyLabel: string;
  endLabel: string;
  goalColor: string;
  goalLabel?: string;
  goalPosition?: number;
  gridColor: string;
  legend: ReactNode;
  onNearestX?: (x: number, geometry: PlanChartGeometry) => void;
  selectedLabel?: string;
  staleLabel?: string;
  startLabel: string;
  state?: ChartState;
  summary: string;
  testID: string;
  todayColor: string;
  todayLabel?: string;
  todayPosition?: number;
  yLabels?: readonly string[];
}) {
  const [width, setWidth] = useState(300);
  const geometry = useMemo<PlanChartGeometry>(() => {
    const left = Math.max(8, Math.min(42, width - 24));
    return {
      bottom: 142,
      height: 172,
      left,
      right: Math.max(left + 1, width - 8),
      top: 14,
      width,
    };
  }, [width]);
  const selectNearest = useCallback(
    (event: { nativeEvent?: { locationX?: number } }) => {
      const locationX = event.nativeEvent?.locationX;
      if (typeof locationX !== "number") return;
      onNearestX?.(Math.max(geometry.left, Math.min(geometry.right, locationX)), geometry);
    },
    [geometry, onNearestX],
  );

  if (state !== "ready") {
    return (
      <View
        accessibilityLiveRegion="polite"
        className="min-h-44 items-center justify-center rounded-2xl bg-card p-4"
        testID={testID}
      >
        <Text className="text-center text-sm text-muted-foreground">
          {state === "loading"
            ? "Loading chart…"
            : state === "empty"
              ? emptyLabel
              : "Chart is unavailable."}
        </Text>
      </View>
    );
  }

  const horizontalLines = [geometry.top, (geometry.top + geometry.bottom) / 2, geometry.bottom];

  return (
    <View className="gap-2 rounded-2xl bg-card p-3" testID={testID}>
      <Text className="text-xs font-semibold text-foreground">{axisLabel}</Text>
      <View
        accessible
        accessibilityLabel={summary}
        accessibilityRole="image"
        testID={`${testID}-accessibility-summary`}
      />
      <View
        onLayout={(event) => {
          const measuredWidth = event.nativeEvent.layout.width;
          if (measuredWidth > 0 && measuredWidth !== width) setWidth(measuredWidth);
        }}
        onMoveShouldSetResponder={() => Boolean(onNearestX)}
        onResponderGrant={selectNearest}
        onResponderMove={selectNearest}
        onResponderRelease={selectNearest}
        onStartShouldSetResponder={() => Boolean(onNearestX)}
        testID={`${testID}-interaction`}
      >
        <Svg
          height={geometry.height}
          testID={`${testID}-plot`}
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width="100%"
        >
          {horizontalLines.map((y) => (
            <Line
              key={y}
              stroke={gridColor}
              strokeWidth={1}
              x1={geometry.left}
              x2={geometry.right}
              y1={y}
              y2={y}
            />
          ))}
          {todayPosition === undefined ? null : (
            <Line
              stroke={todayColor}
              strokeDasharray="3 4"
              strokeWidth={1.5}
              testID={`${testID}-today-marker`}
              x1={markerX(todayPosition, geometry)}
              x2={markerX(todayPosition, geometry)}
              y1={geometry.top}
              y2={geometry.bottom}
            />
          )}
          {goalPosition === undefined ? null : (
            <Line
              stroke={goalColor}
              strokeDasharray="2 4"
              strokeWidth={1.5}
              testID={`${testID}-goal-marker`}
              x1={markerX(goalPosition, geometry)}
              x2={markerX(goalPosition, geometry)}
              y1={geometry.top}
              y2={geometry.bottom}
            />
          )}
          {children(geometry)}
        </Svg>
        <View className="absolute bottom-7 left-0 top-1 justify-between" pointerEvents="none">
          {(yLabels ?? []).map((label) => (
            <Text className="w-9 text-right text-[9px] text-muted-foreground" key={label}>
              {label}
            </Text>
          ))}
        </View>
      </View>
      <View className="flex-row justify-between" testID={`${testID}-dates`}>
        <Text className="text-[10px] text-muted-foreground">{startLabel}</Text>
        <Text className="text-[10px] text-muted-foreground">{endLabel}</Text>
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1" testID={`${testID}-legend`}>
        {legend}
        {todayPosition === undefined ? null : (
          <Text className="text-xs text-foreground">┊ {todayLabel}</Text>
        )}
        {goalPosition === undefined ? null : (
          <Text className="text-xs text-foreground">┊ {goalLabel}</Text>
        )}
      </View>
      {selectedLabel ? (
        <Text className="text-xs text-muted-foreground" testID={`${testID}-selected`}>
          Selected: {selectedLabel}
        </Text>
      ) : null}
      {staleLabel ? (
        <Text className="text-xs text-muted-foreground" testID={`${testID}-stale`}>
          {staleLabel}
        </Text>
      ) : null}
    </View>
  );
}
