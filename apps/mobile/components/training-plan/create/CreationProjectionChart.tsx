import { Text } from "@/components/ui/text";
import { useFont } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { runOnJS, useAnimatedReaction } from "react-native-reanimated";
import {
  CartesianChart,
  Line,
  Scatter,
  useChartPressState,
} from "victory-native";
import { format } from "date-fns";
import type {
  NoHistoryProjectionMetadata,
  ProjectionChartPayload,
} from "@repo/core";

interface CreationProjectionChartProps {
  projectionChart?: ProjectionChartPayload;
  isPreviewPending?: boolean;
}

type ProjectionChartDatum = Record<string, unknown> & {
  index: number;
  loadTss: number;
  fitnessCtl: number;
};

type ProjectionPoint = ProjectionChartPayload["points"][number];

const chartYKeys: ("loadTss" | "fitnessCtl")[] = ["loadTss", "fitnessCtl"];
const chartPadding = { left: 18, right: 22, top: 10, bottom: 16 };
const chartDomainPadding = { left: 8, right: 8, top: 12 };

const formatIsoDate = (isoDate: string, pattern: string) => {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return format(date, pattern);
};

const isDateWithinRange = (
  date: string,
  startDate: string,
  endDate: string,
) => {
  return date >= startDate && date <= endDate;
};

const toUtcDate = (isoDate: string): Date | null => {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const toPercentReductionLabel = (factor: number) => {
  const reduction = Math.max(0, Math.min(1, 1 - factor));
  return `${Math.round(reduction * 100)}%`;
};

const toDateOnlyUtc = (value: Date) => value.toISOString().slice(0, 10);

const getTodayDateOnlyUtc = () => toDateOnlyUtc(new Date());

const formatNoHistoryConfidence = (
  confidence: NoHistoryProjectionMetadata["projection_floor_confidence"],
) => confidence ?? "n/a";

type GoalPointPlacement = {
  marker: {
    id: string;
    name: string;
    target_date: string;
    source: "projection";
  };
  pointIndex: number;
  stackIndex: number;
  stackSize: number;
};

const resolveGoalPointPlacements = (
  points: ProjectionPoint[],
  payload: ProjectionChartPayload,
): GoalPointPlacement[] => {
  if (points.length === 0) {
    return [];
  }

  const mergedMarkers: Array<{
    id: string;
    name: string;
    target_date: string;
    source: "projection";
  }> = payload.goal_markers.map((goal) => ({
    ...goal,
    source: "projection",
  }));

  if (mergedMarkers.length === 0) {
    return [];
  }

  const indexByPointDate = new Map<string, number>();
  const pointTimes = points.map((point, index) => {
    if (!indexByPointDate.has(point.date)) {
      indexByPointDate.set(point.date, index);
    }

    const pointDate = toUtcDate(point.date);
    return pointDate ? pointDate.getTime() : Number.NaN;
  });

  const indexedPlacements: Array<{
    marker: GoalPointPlacement["marker"];
    pointIndex: number;
  }> = [];

  for (const goal of mergedMarkers) {
    const directIndex = indexByPointDate.get(goal.target_date);
    if (directIndex !== undefined) {
      indexedPlacements.push({ marker: goal, pointIndex: directIndex });
      continue;
    }

    const goalDate = toUtcDate(goal.target_date);
    if (!goalDate) {
      continue;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    const goalTime = goalDate.getTime();

    for (let index = 0; index < pointTimes.length; index++) {
      const pointTime = pointTimes[index];
      if (!Number.isFinite(pointTime)) {
        continue;
      }

      const distance = Math.abs(pointTime - goalTime);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    indexedPlacements.push({ marker: goal, pointIndex: bestIndex });
  }

  const placementsByIndex = new Map<number, typeof indexedPlacements>();
  for (const placement of indexedPlacements) {
    const current = placementsByIndex.get(placement.pointIndex) ?? [];
    current.push(placement);
    placementsByIndex.set(placement.pointIndex, current);
  }

  const stackedPlacements: GoalPointPlacement[] = [];
  const sortedIndexes = Array.from(placementsByIndex.keys()).sort(
    (a, b) => a - b,
  );

  for (const pointIndex of sortedIndexes) {
    const placementsAtIndex = placementsByIndex.get(pointIndex) ?? [];
    const stackSize = placementsAtIndex.length;

    placementsAtIndex.forEach((placement, stackIndex) => {
      stackedPlacements.push({
        marker: placement.marker,
        pointIndex,
        stackIndex,
        stackSize,
      });
    });
  }

  return stackedPlacements;
};

const buildDisplayedPoints = (input: {
  projectionChart?: ProjectionChartPayload;
}): ProjectionPoint[] => {
  const basePoints = input.projectionChart?.points ?? [];
  if (basePoints.length === 0) {
    return [];
  }

  const today = getTodayDateOnlyUtc();
  const projectionEndDate = basePoints[basePoints.length - 1]?.date;

  const endDateCandidates = [today, projectionEndDate].filter(
    (value): value is string => Boolean(value),
  );
  const targetEndDate = endDateCandidates
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
  if (!targetEndDate) {
    return basePoints;
  }

  const filtered = basePoints.filter((point) => point.date >= today);
  const seedPoint =
    filtered[0] ?? basePoints[basePoints.length - 1] ?? basePoints[0];
  if (!seedPoint) {
    return [];
  }

  const displayed: ProjectionPoint[] = [...filtered];
  if (displayed.length === 0 || displayed[0]?.date !== today) {
    displayed.unshift({
      date: today,
      predicted_load_tss: seedPoint.predicted_load_tss,
      predicted_fitness_ctl: seedPoint.predicted_fitness_ctl,
    });
  }

  const lastPoint = displayed[displayed.length - 1] ?? seedPoint;
  if (lastPoint.date < targetEndDate) {
    displayed.push({
      date: targetEndDate,
      predicted_load_tss: lastPoint.predicted_load_tss,
      predicted_fitness_ctl: lastPoint.predicted_fitness_ctl,
    });
  }

  return displayed;
};

const resolveSelectedMicrocycle = (
  payload: ProjectionChartPayload | undefined,
  selectedDate: string | undefined,
) => {
  if (!payload || !selectedDate) {
    return undefined;
  }

  return payload.microcycles.find((microcycle) =>
    isDateWithinRange(
      selectedDate,
      microcycle.week_start_date,
      microcycle.week_end_date,
    ),
  );
};

export const CreationProjectionChart = React.memo(
  function CreationProjectionChart({
    projectionChart,
    isPreviewPending = false,
  }: CreationProjectionChartProps) {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === "dark";
    const { width } = useWindowDimensions();
    const chartWidth = width - 48;
    const axisFont = useFont(
      require("@/assets/fonts/SpaceMono-Regular.ttf"),
      10,
    );
    const { state: chartPressState } = useChartPressState({
      x: 0,
      y: { loadTss: 0, fitnessCtl: 0 },
    });

    const points = useMemo(
      () =>
        buildDisplayedPoints({
          projectionChart,
        }),
      [projectionChart],
    );
    const [selectedPointIndex, setSelectedPointIndex] = useState(0);

    useEffect(() => {
      if (!points.length) {
        setSelectedPointIndex(0);
        return;
      }

      setSelectedPointIndex((previous) => {
        if (previous < points.length) {
          return previous;
        }
        return points.length - 1;
      });
    }, [points]);

    const goalPointPlacements = useMemo(
      () =>
        projectionChart
          ? resolveGoalPointPlacements(points, projectionChart)
          : [],
      [points, projectionChart],
    );

    const renderedGoalMarkers = useMemo(
      () => goalPointPlacements.map((placement) => placement.marker),
      [goalPointPlacements],
    );

    const labelStride = useMemo(() => {
      if (!points.length) {
        return 1;
      }
      return Math.max(1, Math.floor(points.length / 6));
    }, [points.length]);

    const shortDateLabels = useMemo(
      () => points.map((point) => formatIsoDate(point.date, "MMM d")),
      [points],
    );

    const longDateLabels = useMemo(
      () => points.map((point) => formatIsoDate(point.date, "EEE, MMM d")),
      [points],
    );

    const chartLabels = useMemo(
      () =>
        points.map((point, index) => {
          const isShownLabel =
            index === 0 ||
            index % labelStride === 0 ||
            index === points.length - 1;
          return isShownLabel ? (shortDateLabels[index] ?? point.date) : "";
        }),
      [labelStride, points, shortDateLabels],
    );

    const chartData = useMemo(
      (): ProjectionChartDatum[] =>
        points.map((point, index) => ({
          index,
          loadTss: point.predicted_load_tss,
          fitnessCtl: point.predicted_fitness_ctl,
        })),
      [points],
    );

    const xAxisConfig = useMemo(
      () => ({
        axisSide: "bottom" as const,
        font: axisFont,
        tickCount: Math.min(6, Math.max(2, points.length)),
        labelColor: isDark ? "#a3a3a3" : "#737373",
        lineColor: isDark
          ? "rgba(38, 38, 38, 0.55)"
          : "rgba(228, 228, 228, 0.75)",
        lineWidth: 1,
        formatXLabel: (value: unknown) => {
          const index = Math.round(Number(value));
          return chartLabels[index] ?? "";
        },
      }),
      [axisFont, chartLabels, isDark, points.length],
    );

    const yAxisConfig = useMemo(
      () => [
        {
          yKeys: ["loadTss"] as ("loadTss" | "fitnessCtl")[],
          axisSide: "left" as const,
          domain: [0] as [number],
          font: axisFont,
          tickCount: 5,
          labelColor: isDark ? "#93c5fd" : "#1d4ed8",
          lineColor: isDark
            ? "rgba(38, 38, 38, 0.55)"
            : "rgba(228, 228, 228, 0.75)",
          lineWidth: 1,
          formatYLabel: (value: unknown) => `${Math.round(Number(value))}`,
        },
        {
          yKeys: ["fitnessCtl"] as ("loadTss" | "fitnessCtl")[],
          axisSide: "right" as const,
          domain: [0] as [number],
          font: axisFont,
          tickCount: 5,
          labelColor: isDark ? "#6ee7b7" : "#047857",
          lineWidth: 0,
          formatYLabel: (value: unknown) => `${Number(value).toFixed(0)}`,
        },
      ],
      [axisFont, isDark],
    );

    const handleSelectPoint = useCallback(
      (index: number) => {
        setSelectedPointIndex((previous) => {
          if (!points.length) {
            return 0;
          }

          const clampedIndex = Math.max(0, Math.min(index, points.length - 1));
          if (clampedIndex === previous) {
            return previous;
          }

          return clampedIndex;
        });
      },
      [points.length],
    );

    useAnimatedReaction(
      () => chartPressState.matchedIndex.value,
      (nextIndex, previousIndex) => {
        if (nextIndex === previousIndex || nextIndex < 0) {
          return;
        }
        runOnJS(handleSelectPoint)(nextIndex);
      },
      [handleSelectPoint],
    );

    const selectedPoint = points[selectedPointIndex];
    const selectedPointSummary = selectedPoint
      ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date}. Weekly load ${Math.round(selectedPoint.predicted_load_tss)} TSS. Fitness ${selectedPoint.predicted_fitness_ctl.toFixed(1)} CTL.`
      : "No point selected.";
    const activePhase = useMemo(() => {
      if (!projectionChart || !selectedPoint) {
        return undefined;
      }

      return projectionChart.periodization_phases.find((phase) =>
        isDateWithinRange(selectedPoint.date, phase.start_date, phase.end_date),
      );
    }, [projectionChart, selectedPoint]);

    const activePhaseSummary = activePhase
      ? `${activePhase.name}, ${formatIsoDate(activePhase.start_date, "MMM d")} to ${formatIsoDate(activePhase.end_date, "MMM d")}.`
      : "No active phase.";

    const goalDatesSummary = renderedGoalMarkers.length
      ? renderedGoalMarkers
          .map(
            (goal) =>
              `${goal.name || "Goal"} on ${formatIsoDate(goal.target_date, "MMM d")}`,
          )
          .join(". ")
      : "No goal dates.";

    const microcycleSummary = projectionChart?.microcycles?.length
      ? `${projectionChart.microcycles.length} microcycles with deterministic ramp, taper, event, and recovery patterns.`
      : "No microcycles.";

    const constraintSummaryText = projectionChart?.constraint_summary
      ? `Ramp clamps: ${projectionChart.constraint_summary.tss_ramp_clamp_weeks} load week(s), ${projectionChart.constraint_summary.ctl_ramp_clamp_weeks} fitness week(s). Recovery weeks: ${projectionChart.constraint_summary.recovery_weeks}.`
      : "No ramp/recovery constraint summary.";

    const selectedMicrocycle = useMemo(
      () => resolveSelectedMicrocycle(projectionChart, selectedPoint?.date),
      [projectionChart, selectedPoint?.date],
    );

    const selectedWeekSummary = selectedMicrocycle?.metadata
      ? `${formatIsoDate(selectedMicrocycle.week_start_date, "MMM d")} to ${formatIsoDate(selectedMicrocycle.week_end_date, "MMM d")}. Requested ${Math.round(selectedMicrocycle.metadata.tss_ramp.raw_requested_weekly_tss)} TSS${selectedMicrocycle.metadata.tss_ramp.floor_override_applied ? `, floored to ${Math.round(selectedMicrocycle.metadata.tss_ramp.requested_weekly_tss)} TSS` : ""}, applied ${Math.round(selectedMicrocycle.metadata.tss_ramp.applied_weekly_tss)} TSS${selectedMicrocycle.metadata.tss_ramp.floor_override_applied ? " (floor minimum applied)" : selectedMicrocycle.metadata.tss_ramp.clamped ? " due to load ramp cap" : " within load ramp cap"}. Requested CTL ramp ${selectedMicrocycle.metadata.ctl_ramp.requested_ctl_ramp.toFixed(2)}, applied ${selectedMicrocycle.metadata.ctl_ramp.applied_ctl_ramp.toFixed(2)}${selectedMicrocycle.metadata.ctl_ramp.clamped ? " due to CTL cap" : " within CTL cap"}.${selectedMicrocycle.metadata.recovery.active ? ` Recovery active at ${toPercentReductionLabel(selectedMicrocycle.metadata.recovery.reduction_factor)} load reduction.` : " Recovery not active."}`
      : "No per-week safety metadata available for this point.";

    const recoverySegmentSummary = projectionChart?.recovery_segments?.length
      ? projectionChart.recovery_segments
          .map(
            (segment) =>
              `${segment.goal_name} recovery ${formatIsoDate(segment.start_date, "MMM d")} to ${formatIsoDate(segment.end_date, "MMM d")}`,
          )
          .join(". ")
      : "No explicit post-goal recovery windows.";

    const chartAccessibilitySummary =
      projectionChart && points.length
        ? `Projection chart with ${points.length} points. ${selectedPointSummary} Active phase: ${activePhaseSummary} Goal dates: ${goalDatesSummary} ${microcycleSummary} ${constraintSummaryText} ${recoverySegmentSummary}`
        : undefined;
    const noHistoryMetadata = projectionChart?.no_history;
    const noHistoryReasons = noHistoryMetadata?.fitness_inference_reasons ?? [];
    const noHistoryConfidenceLabel = noHistoryMetadata
      ? formatNoHistoryConfidence(noHistoryMetadata.projection_floor_confidence)
      : "n/a";
    const noHistoryFloorAppliedLabel =
      noHistoryMetadata?.projection_floor_applied ? "Yes" : "No";
    const noHistoryAvailabilityClampLabel =
      noHistoryMetadata?.floor_clamped_by_availability ? "On" : "Off";
    const noHistoryAccessibilitySummary = noHistoryMetadata
      ? `No-history mode. Confidence ${noHistoryConfidenceLabel}. Floor applied ${noHistoryFloorAppliedLabel}. Availability clamp ${noHistoryAvailabilityClampLabel}.`
      : undefined;

    return (
      <View className="gap-3 rounded-lg border border-border bg-card p-3">
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold">Projection</Text>
          {isPreviewPending && (
            <Text className="text-xs text-muted-foreground">Refreshing...</Text>
          )}
        </View>

        {noHistoryMetadata ? (
          <View
            className="gap-1 rounded-md border border-border bg-muted/20 p-2"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={noHistoryAccessibilitySummary}
          >
            <Text className="text-[11px] text-muted-foreground">
              No-history mode
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Confidence: {noHistoryConfidenceLabel}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Floor applied: {noHistoryFloorAppliedLabel}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Availability clamp: {noHistoryAvailabilityClampLabel}
            </Text>
            {noHistoryReasons.slice(0, 2).map((reason) => (
              <Text key={reason} className="text-[11px] text-muted-foreground">
                - {reason}
              </Text>
            ))}
          </View>
        ) : null}

        {!projectionChart || points.length === 0 ? (
          <View className="rounded-md border border-dashed border-border bg-muted/20 p-3">
            <Text className="text-xs text-muted-foreground">
              Add required goal details to preview projected load and fitness.
            </Text>
          </View>
        ) : (
          <>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={{ width: chartWidth, height: 220 }}>
                <CartesianChart<
                  ProjectionChartDatum,
                  "index",
                  "loadTss" | "fitnessCtl"
                >
                  data={chartData}
                  xKey="index"
                  yKeys={chartYKeys}
                  chartPressState={chartPressState}
                  padding={chartPadding}
                  domainPadding={chartDomainPadding}
                  xAxis={xAxisConfig}
                  yAxis={yAxisConfig}
                >
                  {({ points: plottedPoints }) => (
                    <>
                      <Line
                        points={plottedPoints.loadTss}
                        color="rgba(59, 130, 246, 0.95)"
                        strokeWidth={2}
                        curveType="natural"
                        animate={{ type: "timing", duration: 220 }}
                      />
                      <Line
                        points={plottedPoints.fitnessCtl}
                        color="rgba(16, 185, 129, 0.95)"
                        strokeWidth={2}
                        curveType="natural"
                        animate={{ type: "timing", duration: 220 }}
                      />
                      <Scatter
                        points={goalPointPlacements
                          .map(({ pointIndex, stackIndex, stackSize }) => {
                            const point = plottedPoints.fitnessCtl[pointIndex];
                            if (!point) {
                              return undefined;
                            }

                            const stackOffset =
                              (stackIndex - (stackSize - 1) / 2) * 8;

                            return {
                              ...point,
                              y: Number(point.y ?? 0) - stackOffset,
                            };
                          })
                          .filter((point) => point !== undefined)}
                        color="rgba(251, 191, 36, 1)"
                        radius={4.5}
                      />
                    </>
                  )}
                </CartesianChart>
              </View>
            </View>

            <View className="mt-1 flex-row flex-wrap items-center gap-3 px-1">
              <View className="flex-row items-center gap-1.5">
                <View className="h-0.5 w-5 rounded-full bg-blue-500" />
                <Text className="text-[11px] text-muted-foreground">
                  Weekly load (TSS/week, left axis)
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-0.5 w-5 rounded-full bg-emerald-500" />
                <Text className="text-[11px] text-muted-foreground">
                  Fitness (CTL, right axis)
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-full border border-amber-600 bg-amber-400" />
                <Text className="text-[11px] text-muted-foreground">
                  Goal dates
                </Text>
              </View>
            </View>

            <Text className="px-1 text-[11px] text-muted-foreground">
              Raw projected values are shown directly: weekly load in TSS/week
              and fitness in CTL.
            </Text>
            <Text className="px-1 text-[11px] text-muted-foreground">
              Projection window:{" "}
              {formatIsoDate(projectionChart.start_date, "MMM d, yyyy")} to{" "}
              {formatIsoDate(projectionChart.end_date, "MMM d, yyyy")}
            </Text>

            <View
              accessible={true}
              accessibilityRole="text"
              accessibilityLabel={chartAccessibilitySummary}
            />

            <View
              className="gap-2 rounded-md bg-muted/20 p-3"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Selected point: ${selectedPointSummary} Active phase: ${activePhaseSummary}`}
            >
              <Text className="text-xs font-medium">Selected point</Text>
              <Text className="text-xs text-muted-foreground">
                {selectedPoint
                  ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date} - Weekly load ${Math.round(selectedPoint.predicted_load_tss)} TSS - Fitness ${selectedPoint.predicted_fitness_ctl.toFixed(1)} CTL`
                  : "Tap a point to inspect projected details."}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Active phase: {activePhase?.name ?? "-"}
              </Text>
            </View>

            <View
              className="gap-2 rounded-md border border-border bg-muted/20 p-3"
              accessibilityRole="text"
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Constrained week context. ${selectedWeekSummary}`}
            >
              <Text className="text-xs font-medium">
                Constrained week context
              </Text>
              {selectedMicrocycle?.metadata ? (
                <>
                  <Text className="text-[11px] text-muted-foreground">
                    Week:{" "}
                    {formatIsoDate(selectedMicrocycle.week_start_date, "MMM d")}{" "}
                    - {formatIsoDate(selectedMicrocycle.week_end_date, "MMM d")}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Weekly load: requested{" "}
                    {Math.round(
                      selectedMicrocycle.metadata.tss_ramp
                        .raw_requested_weekly_tss,
                    )}
                    {selectedMicrocycle.metadata.tss_ramp.floor_override_applied
                      ? `, floored to ${Math.round(
                          selectedMicrocycle.metadata.tss_ramp
                            .requested_weekly_tss,
                        )}`
                      : ""}
                    , applied{" "}
                    {Math.round(
                      selectedMicrocycle.metadata.tss_ramp.applied_weekly_tss,
                    )}
                    {selectedMicrocycle.metadata.tss_ramp.floor_override_applied
                      ? " (floor minimum applied)"
                      : selectedMicrocycle.metadata.tss_ramp.clamped
                        ? " (clamped by ramp cap)"
                        : " (within ramp cap)"}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    CTL ramp: requested{" "}
                    {selectedMicrocycle.metadata.ctl_ramp.requested_ctl_ramp.toFixed(
                      2,
                    )}
                    , applied{" "}
                    {selectedMicrocycle.metadata.ctl_ramp.applied_ctl_ramp.toFixed(
                      2,
                    )}
                    {selectedMicrocycle.metadata.ctl_ramp.clamped
                      ? " (clamped)"
                      : " (within cap)"}
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Recovery:{" "}
                    {selectedMicrocycle.metadata.recovery.active
                      ? `active with ${toPercentReductionLabel(selectedMicrocycle.metadata.recovery.reduction_factor)} reduction`
                      : "not active"}
                  </Text>
                </>
              ) : (
                <Text className="text-[11px] text-muted-foreground">
                  This point has no per-week ramp metadata.
                </Text>
              )}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityRole="tablist"
              accessibilityLabel="Projection points"
              accessibilityHint="Swipe left or right to browse dates, then double tap to select"
            >
              <View className="flex-row gap-2">
                {points.map((point, index) => {
                  const isActive = index === selectedPointIndex;
                  const dateLabel = shortDateLabels[index] ?? point.date;
                  return (
                    <Pressable
                      key={`${point.date}-${index}`}
                      onPress={() => handleSelectPoint(index)}
                      className={`rounded-full border px-3 py-1 ${isActive ? "border-primary bg-primary/10" : "border-border bg-background"}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Point ${index + 1} of ${points.length}, ${dateLabel}`}
                      accessibilityHint={`Weekly load ${Math.round(point.predicted_load_tss)} TSS and fitness ${point.predicted_fitness_ctl.toFixed(1)} CTL`}
                      hitSlop={8}
                      style={{
                        minHeight: 44,
                        minWidth: 44,
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        className={`text-xs ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {dateLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View
              className="gap-2"
              accessibilityRole="text"
              accessibilityLabel={`Goal dates: ${goalDatesSummary}`}
            >
              <Text className="text-xs font-medium">Goal dates</Text>
              <View className="flex-row flex-wrap gap-2">
                {renderedGoalMarkers.map((goal, goalIndex) => (
                  <View
                    key={`${goal.id}-${goal.target_date}-${goalIndex}`}
                    className="rounded-full border border-amber-300 bg-amber-100/50 px-3 py-1"
                  >
                    <Text className="text-xs text-amber-900">
                      {formatIsoDate(goal.target_date, "MMM d")}:{" "}
                      {goal.name || "Goal"}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="gap-2">
              <Text className="text-xs font-medium">Periodization phases</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {projectionChart.periodization_phases.map((phase) => {
                    const isActivePhase = selectedPoint
                      ? isDateWithinRange(
                          selectedPoint.date,
                          phase.start_date,
                          phase.end_date,
                        )
                      : false;
                    return (
                      <View
                        key={phase.id}
                        className={`rounded-md border px-3 py-2 ${isActivePhase ? "border-primary bg-primary/10" : "border-border bg-muted/20"}`}
                      >
                        <Text className="text-xs font-medium">
                          {phase.name}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {formatIsoDate(phase.start_date, "MMM d")} -{" "}
                          {formatIsoDate(phase.end_date, "MMM d")}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {Math.round(phase.target_weekly_tss_min)}-
                          {Math.round(phase.target_weekly_tss_max)} TSS/wk
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            {projectionChart.microcycles?.length ? (
              <View className="gap-2">
                <Text className="text-xs font-medium">Microcycles</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View className="flex-row gap-2">
                    {projectionChart.microcycles.map((microcycle) => (
                      <View
                        key={`${microcycle.week_start_date}-${microcycle.week_end_date}`}
                        className="rounded-md border border-border bg-muted/20 px-3 py-2"
                      >
                        <Text className="text-xs font-medium">
                          {formatIsoDate(microcycle.week_start_date, "MMM d")} -{" "}
                          {formatIsoDate(microcycle.week_end_date, "MMM d")}
                        </Text>
                        <Text className="text-[11px] capitalize text-muted-foreground">
                          {microcycle.phase} - {microcycle.pattern}
                        </Text>
                        <Text className="text-[11px] text-muted-foreground">
                          {Math.round(microcycle.planned_weekly_tss)} TSS / CTL{" "}
                          {microcycle.projected_ctl.toFixed(1)}
                        </Text>
                        {microcycle.metadata ? (
                          <Text className="text-[11px] text-muted-foreground">
                            {microcycle.metadata.tss_ramp.clamped ||
                            microcycle.metadata.ctl_ramp.clamped
                              ? "Ramp clamped"
                              : "Ramp within limits"}
                            {microcycle.metadata.recovery.active
                              ? ` - Recovery (${Math.round((1 - microcycle.metadata.recovery.reduction_factor) * 100)}% reduction)`
                              : ""}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {projectionChart.constraint_summary ? (
              <View
                className="gap-1 rounded-md border border-border bg-muted/20 p-3"
                accessibilityRole="text"
                accessibilityLabel={`Ramp and recovery guardrails. ${constraintSummaryText}`}
              >
                <Text className="text-xs font-medium">
                  Ramp and recovery guardrails
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  Profile:{" "}
                  {
                    projectionChart.constraint_summary
                      .normalized_creation_config.optimization_profile
                  }
                  {" | "}Recovery window:{" "}
                  {
                    projectionChart.constraint_summary
                      .normalized_creation_config.post_goal_recovery_days
                  }{" "}
                  day(s)
                  {" | "}Max weekly load ramp:{" "}
                  {
                    projectionChart.constraint_summary
                      .normalized_creation_config.max_weekly_tss_ramp_pct
                  }
                  %{" | "}Max weekly CTL ramp:{" "}
                  {
                    projectionChart.constraint_summary
                      .normalized_creation_config.max_ctl_ramp_per_week
                  }
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  Clamped weeks - Load:{" "}
                  {projectionChart.constraint_summary.tss_ramp_clamp_weeks},
                  Fitness:{" "}
                  {projectionChart.constraint_summary.ctl_ramp_clamp_weeks},
                  Recovery: {projectionChart.constraint_summary.recovery_weeks}
                </Text>
              </View>
            ) : null}

            {projectionChart.recovery_segments?.length ? (
              <View
                className="gap-2"
                accessibilityRole="text"
                accessibilityLabel={`Post-goal recovery windows. ${recoverySegmentSummary}`}
              >
                <Text className="text-xs font-medium">
                  Post-goal recovery windows
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {projectionChart.recovery_segments.map((segment) => (
                    <View
                      key={`${segment.goal_id}-${segment.start_date}`}
                      className="rounded-full border border-emerald-300 bg-emerald-100/50 px-3 py-1"
                    >
                      <Text className="text-xs text-emerald-900">
                        {segment.goal_name}:{" "}
                        {formatIsoDate(segment.start_date, "MMM d")} -{" "}
                        {formatIsoDate(segment.end_date, "MMM d")}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
    );
  },
);
