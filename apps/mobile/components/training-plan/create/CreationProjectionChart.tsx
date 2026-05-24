import type { ProjectionChartPayload } from "@repo/core";
import { Text } from "@repo/ui/components/text";
import { useFont } from "@shopify/react-native-skia";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { CartesianChart, Line } from "victory-native";
import { useTheme } from "@/lib/stores/theme-store";
import {
  formatCompactAxisNumber,
  formatIsoDate,
  formatWeeklyTss,
  toPercentReductionLabel,
} from "./projection-chart/formatters";
import {
  formatDiagnosticNumber,
  formatNoHistoryConfidence,
  resolveContinuousProjectionDiagnostics,
  resolveProjectionConfidenceHint,
  summarizeNumericRecord,
  toSentenceKey,
} from "./projection-chart/metadata";
import { ProjectionChartLegends } from "./projection-chart/ProjectionChartLegends";
import {
  isDateWithinRange,
  resolveGoalPointPlacements,
  resolvePhaseBandPlacements,
  resolvePhaseBoundaryMarkers,
  resolvePhaseLegendItems,
} from "./projection-chart/placements";

interface CreationProjectionChartProps {
  projectionChart?: ProjectionChartPayload;
  isPreviewPending?: boolean;
  compact?: boolean;
  chartMaxHeight?: number;
}

type ProjectionChartDatum = Record<string, unknown> & {
  index: number;
  loadTss: number;
  fitnessCtl: number;
  fatigueAtl: number;
  readinessScore: number;
};

type ChartYKey = "loadTss" | "fitnessCtl" | "fatigueAtl";

type ProjectionPoint = ProjectionChartPayload["points"][number];

const chartYKeys: ChartYKey[] = ["loadTss", "fitnessCtl", "fatigueAtl"];

const lineConfig: Array<{
  key: ChartYKey;
  label: string;
  color: string;
}> = [
  {
    key: "loadTss",
    label: "Load",
    color: "rgba(59, 130, 246, 0.95)",
  },
  {
    key: "fitnessCtl",
    label: "Fitness",
    color: "rgba(16, 185, 129, 0.95)",
  },
  {
    key: "fatigueAtl",
    label: "Fatigue",
    color: "rgba(245, 158, 11, 0.95)",
  },
];

const defaultLineVisibility: Record<ChartYKey, boolean> = {
  loadTss: true,
  fitnessCtl: true,
  fatigueAtl: true,
};
const defaultChartHeight = 300;
const minChartHeight = 120;
const leftAxisLabelGutter = 2;
const rightAxisLabelGutter = 2;
const chartPadding = {
  left: leftAxisLabelGutter,
  right: rightAxisLabelGutter,
  top: 6,
  bottom: 12,
};
const chartDomainPadding = { left: 0, right: 0, top: 8 };
const markerEdgeInset = 0;
const goalDateLabelWidth = 34;
const goalDateLabelHalfWidth = goalDateLabelWidth / 2;
const phaseAxisStripHeight = 2;

const roundUpAxisMax = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return 100;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;

  let roundedNormalized = 10;
  if (normalized <= 1) {
    roundedNormalized = 1;
  } else if (normalized <= 2) {
    roundedNormalized = 2;
  } else if (normalized <= 5) {
    roundedNormalized = 5;
  }

  return roundedNormalized * magnitude;
};

const getAxisFontSource = (): Parameters<typeof useFont>[0] => {
  try {
    return require("../../../assets/fonts/SpaceMono-Regular.ttf") as Parameters<typeof useFont>[0];
  } catch {
    return undefined;
  }
};

type PlotBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

const areBoundsEqual = (left: PlotBounds, right: PlotBounds) =>
  left.left === right.left &&
  left.right === right.right &&
  left.top === right.top &&
  left.bottom === right.bottom;

const ChartBoundsSync = React.memo(function ChartBoundsSync({
  chartBounds,
  onChange,
}: {
  chartBounds: PlotBounds;
  onChange: (chartBounds: PlotBounds) => void;
}) {
  useEffect(() => {
    onChange(chartBounds);
  }, [chartBounds, onChange]);

  return null;
});

const buildDisplayedPoints = (input: {
  projectionChart?: ProjectionChartPayload;
}): ProjectionPoint[] => {
  const projection = input.projectionChart;
  return projection?.display_points ?? projection?.points ?? [];
};

const resolveSelectedMicrocycle = (
  payload: ProjectionChartPayload | undefined,
  selectedDate: string | undefined,
) => {
  if (!payload || !selectedDate) {
    return undefined;
  }

  return payload.microcycles.find((microcycle) =>
    isDateWithinRange(selectedDate, microcycle.week_start_date, microcycle.week_end_date),
  );
};

export const CreationProjectionChart = React.memo(function CreationProjectionChart({
  projectionChart,
  isPreviewPending = false,
  compact = false,
  chartMaxHeight,
}: CreationProjectionChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { width } = useWindowDimensions();
  const [measuredChartContainerWidth, setMeasuredChartContainerWidth] = useState(0);
  const fallbackChartContainerWidth = width;
  const chartWidth = Math.max(1, measuredChartContainerWidth || fallbackChartContainerWidth);
  const resolvedChartHeight = Math.max(
    minChartHeight,
    Math.floor(chartMaxHeight ?? defaultChartHeight),
  );
  const [plotBounds, setPlotBounds] = useState<PlotBounds>(() => ({
    left: chartPadding.left + chartDomainPadding.left + markerEdgeInset,
    right: chartWidth - chartPadding.right - chartDomainPadding.right - markerEdgeInset,
    top: chartPadding.top,
    bottom: resolvedChartHeight - chartPadding.bottom,
  }));
  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    setMeasuredChartContainerWidth((previousWidth) =>
      previousWidth !== nextWidth ? nextWidth : previousWidth,
    );
  }, []);
  const axisFont = useFont(getAxisFontSource(), 9);
  const points = useMemo(
    () =>
      buildDisplayedPoints({
        projectionChart,
      }),
    [projectionChart],
  );
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);
  const [lineVisibility, setLineVisibility] = useState(defaultLineVisibility);

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
    () => (projectionChart ? resolveGoalPointPlacements(points, projectionChart) : []),
    [points, projectionChart],
  );

  const renderedGoalMarkers = useMemo(
    () => goalPointPlacements.map((placement) => placement.marker),
    [goalPointPlacements],
  );
  const goalLineIndices = useMemo(
    () =>
      Array.from(new Set(goalPointPlacements.map((p) => p.pointIndex))).filter(
        (index) => index >= 0 && index < points.length,
      ),
    [goalPointPlacements, points.length],
  );
  const phaseBoundaryMarkers = useMemo(
    () => resolvePhaseBoundaryMarkers(points, projectionChart),
    [points, projectionChart],
  );
  const handlePlotBoundsChange = useCallback((nextBounds: PlotBounds) => {
    setPlotBounds((previous) => (areBoundsEqual(previous, nextBounds) ? previous : nextBounds));
  }, []);
  useEffect(() => {
    const fallbackBounds: PlotBounds = {
      left: chartPadding.left + chartDomainPadding.left + markerEdgeInset,
      right: chartWidth - chartPadding.right - chartDomainPadding.right - markerEdgeInset,
      top: chartPadding.top,
      bottom: resolvedChartHeight - chartPadding.bottom,
    };

    setPlotBounds((previous) => {
      if (previous.right > previous.left) {
        return previous;
      }

      return fallbackBounds;
    });
  }, [chartWidth, resolvedChartHeight]);
  const markerXForIndex = useCallback(
    (index: number) => {
      if (points.length <= 1) {
        return plotBounds.left;
      }
      const ratio = Math.max(0, Math.min(1, index / (points.length - 1)));
      return plotBounds.left + ratio * Math.max(0, plotBounds.right - plotBounds.left);
    },
    [plotBounds.left, plotBounds.right, points.length],
  );
  const phaseBandPlacements = useMemo(
    () =>
      resolvePhaseBandPlacements({
        points,
        projectionChart,
        isDark,
        markerXForIndex,
      }),
    [isDark, markerXForIndex, points, projectionChart],
  );
  const phaseLegendItems = useMemo(
    () => resolvePhaseLegendItems(phaseBandPlacements),
    [phaseBandPlacements],
  );
  const goalDateLabelPlacements = useMemo(() => {
    if (goalPointPlacements.length === 0) {
      return [] as Array<{ key: string; left: number; dateLabel: string }>;
    }
    const dedupedByIndex = new Map<number, string>();

    for (const placement of goalPointPlacements) {
      if (!dedupedByIndex.has(placement.pointIndex)) {
        dedupedByIndex.set(
          placement.pointIndex,
          formatIsoDate(placement.marker.target_date, "MMM d"),
        );
      }
    }

    return Array.from(dedupedByIndex.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([index, dateLabel]) => {
        const centerX = markerXForIndex(index);
        const left = centerX - goalDateLabelHalfWidth;

        return {
          key: `goal-date-${index}`,
          left,
          dateLabel,
        };
      });
  }, [goalPointPlacements, markerXForIndex]);
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
          index === 0 || index % labelStride === 0 || index === points.length - 1;
        return isShownLabel ? (shortDateLabels[index] ?? point.date) : "";
      }),
    [labelStride, points, shortDateLabels],
  );

  const rightAxisDomainMax = useMemo(() => {
    if (!points.length) {
      return 100;
    }

    const includeFitness = lineVisibility.fitnessCtl;
    const includeFatigue = lineVisibility.fatigueAtl;
    let maxValue = 0;

    for (const point of points) {
      if (includeFitness) {
        maxValue = Math.max(maxValue, point.predicted_fitness_ctl);
      }
      if (includeFatigue) {
        maxValue = Math.max(maxValue, point.predicted_fatigue_atl);
      }
    }

    return roundUpAxisMax(Math.max(100, maxValue));
  }, [lineVisibility.fatigueAtl, lineVisibility.fitnessCtl, points]);

  const chartData = useMemo(
    (): ProjectionChartDatum[] =>
      points.map((point, index) => ({
        index,
        loadTss: point.predicted_load_tss,
        fitnessCtl: point.predicted_fitness_ctl,
        fatigueAtl: point.predicted_fatigue_atl,
        readinessScore: point.readiness_score,
      })),
    [points],
  );

  const leftAxisUnitLabel = "TSS/wk";
  const rightAxisUnitLabel = "pts";
  const leftAxisUnitColor = isDark ? "#93c5fd" : "#1d4ed8";
  const rightAxisUnitColor = isDark ? "#a3a3a3" : "#525252";

  const xAxisConfig = useMemo(
    () => ({
      axisSide: "bottom" as const,
      font: axisFont,
      tickCount: Math.min(6, Math.max(2, points.length)),
      labelColor: isDark ? "#a3a3a3" : "#737373",
      lineColor: isDark ? "rgba(38, 38, 38, 0.55)" : "rgba(228, 228, 228, 0.75)",
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
        yKeys: ["loadTss"] as ChartYKey[],
        axisSide: "left" as const,
        domain: [0] as [number],
        labelPosition: "outset" as const,
        labelOffset: 8,
        font: axisFont,
        tickCount: 5,
        labelColor: isDark ? "#93c5fd" : "#1d4ed8",
        lineColor: isDark ? "rgba(38, 38, 38, 0.55)" : "rgba(228, 228, 228, 0.75)",
        lineWidth: 1,
        formatYLabel: (value: unknown) => formatCompactAxisNumber(Number(value)),
      },
      {
        yKeys: ["fitnessCtl", "fatigueAtl"] as ChartYKey[],
        axisSide: "right" as const,
        domain: [0, rightAxisDomainMax] as [number, number],
        labelPosition: "outset" as const,
        labelOffset: 8,
        font: axisFont,
        tickCount: 5,
        labelColor: isDark ? "#a3a3a3" : "#525252",
        lineColor: "transparent",
        lineWidth: 0,
        formatYLabel: (value: unknown) => formatCompactAxisNumber(Number(value)),
      },
    ],
    [axisFont, isDark, rightAxisDomainMax],
  );

  const toggleLineVisibility = useCallback((key: ChartYKey) => {
    setLineVisibility((previous) => {
      const currentlyVisibleCount = lineConfig.reduce(
        (count, line) => count + (previous[line.key] ? 1 : 0),
        0,
      );

      if (previous[key] && currentlyVisibleCount <= 1) {
        return previous;
      }

      return {
        ...previous,
        [key]: !previous[key],
      };
    });
  }, []);
  const activeLineCount = useMemo(
    () => lineConfig.reduce((count, line) => count + (lineVisibility[line.key] ? 1 : 0), 0),
    [lineVisibility],
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

  const selectedPoint = points[selectedPointIndex];
  const selectedReadiness = selectedPoint?.readiness_score;
  const projectionConfidenceHint = resolveProjectionConfidenceHint(projectionChart, selectedPoint);
  const selectedPointSummary = selectedPoint
    ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date}. Weekly load ${formatWeeklyTss(selectedPoint.predicted_load_tss)} TSS. Fitness ${selectedPoint.predicted_fitness_ctl.toFixed(1)} CTL. Fatigue ${selectedPoint.predicted_fatigue_atl.toFixed(1)} ATL. Readiness ${Math.round(selectedReadiness ?? 0)} out of 100.`
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
        .map((goal) => `${goal.name || "Goal"} on ${formatIsoDate(goal.target_date, "MMM d")}`)
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
    ? `${formatIsoDate(selectedMicrocycle.week_start_date, "MMM d")} to ${formatIsoDate(selectedMicrocycle.week_end_date, "MMM d")}. Requested ${formatWeeklyTss(selectedMicrocycle.metadata.tss_ramp.raw_requested_weekly_tss)} TSS${selectedMicrocycle.metadata.tss_ramp.floor_override_applied ? `, floored to ${formatWeeklyTss(selectedMicrocycle.metadata.tss_ramp.requested_weekly_tss)} TSS` : ""}, applied ${formatWeeklyTss(selectedMicrocycle.metadata.tss_ramp.applied_weekly_tss)} TSS${selectedMicrocycle.metadata.tss_ramp.floor_override_applied ? " (floor minimum applied)" : selectedMicrocycle.metadata.tss_ramp.clamped ? " due to load ramp cap" : " within load ramp cap"}. Requested CTL ramp ${selectedMicrocycle.metadata.ctl_ramp.requested_ctl_ramp.toFixed(2)}, applied ${selectedMicrocycle.metadata.ctl_ramp.applied_ctl_ramp.toFixed(2)}${selectedMicrocycle.metadata.ctl_ramp.clamped ? " due to CTL cap" : " within CTL cap"}.${selectedMicrocycle.metadata.recovery.active ? ` Recovery active at ${toPercentReductionLabel(selectedMicrocycle.metadata.recovery.reduction_factor)} load reduction.` : " Recovery not active."}`
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
  const noHistoryFloorEnabledLabel = noHistoryMetadata?.projection_floor_applied ? "Yes" : "No";
  const noHistoryAvailabilityClampLabel = noHistoryMetadata?.floor_clamped_by_availability
    ? "On"
    : "Off";
  const fitnessSignal =
    typeof noHistoryMetadata?.fitness_signal_0_1 === "number"
      ? Math.round(noHistoryMetadata.fitness_signal_0_1 * 100)
      : null;
  const goalDemandScore =
    typeof noHistoryMetadata?.goal_demand_score_0_1 === "number"
      ? Math.round(noHistoryMetadata.goal_demand_score_0_1 * 100)
      : null;
  const evidenceConfidenceScore = noHistoryMetadata?.evidence_confidence?.score;
  const evidenceConfidenceState = noHistoryMetadata?.evidence_confidence?.state;
  const readinessBand = noHistoryMetadata?.projection_feasibility?.readiness_band;
  const unmetDemand = noHistoryMetadata?.projection_feasibility?.demand_gap.unmet_weekly_tss;
  const dominantLimiters = noHistoryMetadata?.projection_feasibility?.dominant_limiters ?? [];
  const projectionRiskScore =
    typeof projectionChart?.risk_score === "number" ? Math.round(projectionChart.risk_score) : null;
  const noHistoryAccessibilitySummary = noHistoryMetadata
    ? `Adaptive demand confidence ${noHistoryConfidenceLabel}. Demand floor enabled ${noHistoryFloorEnabledLabel}. Availability clamp ${noHistoryAvailabilityClampLabel}. Evidence confidence ${evidenceConfidenceState ?? "n/a"} ${evidenceConfidenceScore !== undefined ? evidenceConfidenceScore.toFixed(2) : "n/a"}. Readiness ${readinessBand ?? "n/a"}.${fitnessSignal !== null ? ` Fitness signal ${fitnessSignal} percent.` : ""}${goalDemandScore !== null ? ` Goal demand ${goalDemandScore} percent.` : ""}${projectionRiskScore !== null ? ` Risk score ${projectionRiskScore} percent.` : ""}`
    : undefined;
  const continuousDiagnostics = useMemo(
    () => resolveContinuousProjectionDiagnostics(projectionChart),
    [projectionChart],
  );
  const effectiveOptimizerSummary = summarizeNumericRecord(
    continuousDiagnostics.effectiveOptimizer,
    4,
  );
  const objectiveSummary = summarizeNumericRecord(continuousDiagnostics.objectiveComposition, 5);
  const activeConstraintSummary = continuousDiagnostics.activeConstraints
    .slice(0, 3)
    .map((item) => toSentenceKey(item))
    .join(", ");
  const bindingConstraintSummary = continuousDiagnostics.bindingConstraints
    .slice(0, 3)
    .map((item) => toSentenceKey(item))
    .join(", ");
  const showContinuousDiagnostics =
    Boolean(effectiveOptimizerSummary) ||
    Boolean(objectiveSummary) ||
    activeConstraintSummary.length > 0 ||
    bindingConstraintSummary.length > 0 ||
    continuousDiagnostics.clampPressure !== undefined ||
    continuousDiagnostics.curvatureContribution !== undefined;
  return (
    <View
      style={{ width: "100%" }}
      className={
        compact ? "gap-1 px-2 pt-1 pb-1" : "gap-1 rounded-lg border border-border bg-card px-2 py-1"
      }
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-semibold">Projection</Text>
        {isPreviewPending && <Text className="text-xs text-muted-foreground">Refreshing...</Text>}
      </View>

      {!compact && noHistoryMetadata ? (
        <View
          className="gap-1 rounded-md border border-border bg-muted/20 p-2"
          accessibilityRole="text"
          accessibilityLiveRegion="polite"
          accessibilityLabel={noHistoryAccessibilitySummary}
        >
          <Text className="text-[11px] text-muted-foreground">Adaptive demand</Text>
          <Text className="text-[11px] text-muted-foreground">
            Confidence: {noHistoryConfidenceLabel}
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            Evidence confidence: {evidenceConfidenceState ?? "n/a"}{" "}
            {evidenceConfidenceScore !== undefined ? `(${evidenceConfidenceScore.toFixed(2)})` : ""}
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            Readiness: {readinessBand ?? "n/a"}
            {unmetDemand !== undefined ? ` | Demand gap: ~${Math.round(unmetDemand)} TSS` : ""}
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            Demand floor enabled: {noHistoryFloorEnabledLabel}
          </Text>
          <Text className="text-[11px] text-muted-foreground">
            Availability clamp: {noHistoryAvailabilityClampLabel}
          </Text>
          {fitnessSignal !== null ? (
            <Text className="text-[11px] text-muted-foreground">
              Fitness signal: {fitnessSignal}%
            </Text>
          ) : null}
          {goalDemandScore !== null ? (
            <Text className="text-[11px] text-muted-foreground">
              Goal demand: {goalDemandScore}%
            </Text>
          ) : null}
          {projectionRiskScore !== null ? (
            <Text className="text-[11px] text-muted-foreground">
              Risk score: {projectionRiskScore}%
            </Text>
          ) : null}
          {dominantLimiters.slice(0, 2).map((limiter) => (
            <Text key={limiter} className="text-[11px] text-muted-foreground">
              limiter: {limiter}
            </Text>
          ))}
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
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <View onLayout={handleChartLayout} style={{ width: "100%" }}>
              <View
                style={{
                  width: chartWidth,
                  height: resolvedChartHeight,
                  alignSelf: "center",
                }}
              >
                <CartesianChart<ProjectionChartDatum, "index", ChartYKey>
                  data={chartData}
                  xKey="index"
                  yKeys={chartYKeys}
                  padding={chartPadding}
                  domainPadding={chartDomainPadding}
                  xAxis={xAxisConfig}
                  yAxis={yAxisConfig}
                >
                  {({ points: plottedPoints, chartBounds }) => (
                    <>
                      <ChartBoundsSync
                        chartBounds={chartBounds as PlotBounds}
                        onChange={handlePlotBoundsChange}
                      />
                      {lineConfig.map((line) =>
                        lineVisibility[line.key] ? (
                          <Line
                            key={line.key}
                            points={plottedPoints[line.key]}
                            color={line.color}
                            strokeWidth={2}
                            curveType="natural"
                            animate={{ type: "timing", duration: 220 }}
                          />
                        ) : null,
                      )}
                    </>
                  )}
                </CartesianChart>
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,
                  }}
                >
                  {phaseBandPlacements.map((phaseBand) => (
                    <View
                      key={`phase-band-${phaseBand.key}`}
                      style={{
                        position: "absolute",
                        left: phaseBand.left,
                        top: Math.max(0, plotBounds.bottom - 1),
                        width: phaseBand.width,
                        height: phaseAxisStripHeight,
                        backgroundColor: phaseBand.color,
                        borderRadius: 0,
                      }}
                    />
                  ))}
                  {phaseBoundaryMarkers.map((marker) => (
                    <View
                      key={`phase-line-${marker.index}`}
                      style={{
                        position: "absolute",
                        left: markerXForIndex(marker.index),
                        top: plotBounds.top,
                        height: Math.max(0, plotBounds.bottom - plotBounds.top),
                        width: 1,
                        backgroundColor: isDark
                          ? "rgba(148, 163, 184, 0.45)"
                          : "rgba(71, 85, 105, 0.35)",
                      }}
                    />
                  ))}
                  {goalLineIndices.map((index) => (
                    <View
                      key={`goal-line-${index}`}
                      style={{
                        position: "absolute",
                        left: markerXForIndex(index),
                        top: plotBounds.top,
                        height: Math.max(0, plotBounds.bottom - plotBounds.top),
                        width: 1,
                        backgroundColor: isDark
                          ? "rgba(251, 191, 36, 0.8)"
                          : "rgba(217, 119, 6, 0.75)",
                      }}
                    />
                  ))}
                  <Text
                    className="text-[9px] text-muted-foreground"
                    style={{
                      position: "absolute",
                      left: 2,
                      top: 0,
                      color: leftAxisUnitColor,
                    }}
                  >
                    {leftAxisUnitLabel}
                  </Text>
                  <Text
                    className="text-[9px] text-muted-foreground"
                    style={{
                      position: "absolute",
                      right: 2,
                      top: 0,
                      color: rightAxisUnitColor,
                    }}
                  >
                    {rightAxisUnitLabel}
                  </Text>
                  {goalDateLabelPlacements.map((label) => (
                    <Text
                      key={label.key}
                      className="text-[9px] text-amber-700"
                      numberOfLines={1}
                      style={{
                        position: "absolute",
                        left: label.left,
                        top: Math.min(resolvedChartHeight - 10, plotBounds.bottom + 2),
                        width: goalDateLabelWidth,
                        textAlign: "center",
                      }}
                    >
                      {label.dateLabel}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <ProjectionChartLegends
            lineConfig={lineConfig}
            lineVisibility={lineVisibility}
            activeLineCount={activeLineCount}
            phaseLegendItems={phaseLegendItems}
            onToggleLineVisibility={toggleLineVisibility}
          />

          {!compact && (
            <>
              <Text className="px-1 text-[11px] text-muted-foreground">
                Raw projected values are shown directly: weekly load in TSS/week, fitness in CTL,
                and fatigue in ATL. Readiness is still calculated from core projection output
                (0-100) and shown in selected-point details below, but not drawn as a chart line.
              </Text>
              <Text className="px-1 text-[11px] text-muted-foreground">
                CTL and ATL are training-state metrics only and are not suitability or safety
                determinations.
              </Text>
              <Text className="px-1 text-[11px] text-muted-foreground">
                Projection window: {formatIsoDate(projectionChart.start_date, "MMM d, yyyy")} to{" "}
                {formatIsoDate(projectionChart.end_date, "MMM d, yyyy")}
              </Text>

              <View
                accessible={true}
                accessibilityRole="text"
                accessibilityLabel={`${chartAccessibilitySummary ?? ""}`.trim()}
              />

              <View
                className="gap-2 rounded-md bg-muted/20 p-3"
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`Selected point: ${selectedPointSummary} Active phase: ${activePhaseSummary}`}
              >
                <Text className="text-xs font-medium">Training state</Text>
                <Text className="text-xs text-muted-foreground">
                  {selectedPoint
                    ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date} - Weekly load ${formatWeeklyTss(selectedPoint.predicted_load_tss)} TSS - CTL ${selectedPoint.predicted_fitness_ctl.toFixed(1)} - ATL ${selectedPoint.predicted_fatigue_atl.toFixed(1)} - Readiness ${Math.round(selectedReadiness ?? 0)}/100`
                    : "Tap a point to inspect projected details."}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  CTL/ATL describe training load and fatigue trends only; they do not determine
                  athlete suitability.
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Active phase: {activePhase?.name ?? "-"}
                </Text>
                {projectionConfidenceHint ? (
                  <Text className="text-xs text-muted-foreground">{projectionConfidenceHint}</Text>
                ) : null}
              </View>

              <View
                className="gap-2 rounded-md border border-border bg-muted/20 p-3"
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`Constrained week context. ${selectedWeekSummary}`}
              >
                <Text className="text-xs font-medium">Constrained week context</Text>
                {selectedMicrocycle?.metadata ? (
                  <>
                    <Text className="text-[11px] text-muted-foreground">
                      Week: {formatIsoDate(selectedMicrocycle.week_start_date, "MMM d")} -{" "}
                      {formatIsoDate(selectedMicrocycle.week_end_date, "MMM d")}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
                      Weekly load: requested{" "}
                      {formatWeeklyTss(
                        selectedMicrocycle.metadata.tss_ramp.raw_requested_weekly_tss,
                      )}
                      {selectedMicrocycle.metadata.tss_ramp.floor_override_applied
                        ? `, floored to ${formatWeeklyTss(
                            selectedMicrocycle.metadata.tss_ramp.requested_weekly_tss,
                          )}`
                        : ""}
                      , applied{" "}
                      {formatWeeklyTss(selectedMicrocycle.metadata.tss_ramp.applied_weekly_tss)}
                      {selectedMicrocycle.metadata.tss_ramp.floor_override_applied
                        ? " (floor minimum applied)"
                        : selectedMicrocycle.metadata.tss_ramp.clamped
                          ? " (clamped by ramp cap)"
                          : " (within ramp cap)"}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
                      Demand floor this week:{" "}
                      {selectedMicrocycle.metadata.tss_ramp.floor_override_applied
                        ? "active"
                        : "not active"}
                      {selectedMicrocycle.metadata.tss_ramp.demand_band_minimum_weekly_tss !==
                        undefined &&
                      selectedMicrocycle.metadata.tss_ramp.demand_band_minimum_weekly_tss !== null
                        ? ` (${formatWeeklyTss(selectedMicrocycle.metadata.tss_ramp.demand_band_minimum_weekly_tss)} TSS min)`
                        : ""}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
                      CTL ramp: requested{" "}
                      {selectedMicrocycle.metadata.ctl_ramp.requested_ctl_ramp.toFixed(2)}, applied{" "}
                      {selectedMicrocycle.metadata.ctl_ramp.applied_ctl_ramp.toFixed(2)}
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
                        accessibilityHint={`Weekly load ${formatWeeklyTss(point.predicted_load_tss)} TSS, fitness ${point.predicted_fitness_ctl.toFixed(1)} CTL, fatigue ${point.predicted_fatigue_atl.toFixed(1)} ATL, readiness ${Math.round(point.readiness_score ?? 0)} out of 100`}
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
                        {formatIsoDate(goal.target_date, "MMM d")}: {goal.name || "Goal"}
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
                        ? isDateWithinRange(selectedPoint.date, phase.start_date, phase.end_date)
                        : false;
                      return (
                        <View
                          key={phase.id}
                          className={`rounded-md border px-3 py-2 ${isActivePhase ? "border-primary bg-primary/10" : "border-border bg-muted/20"}`}
                        >
                          <Text className="text-xs font-medium">{phase.name}</Text>
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
                            {formatWeeklyTss(microcycle.planned_weekly_tss)} TSS / CTL{" "}
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
                  <Text className="text-xs font-medium">Ramp and recovery guardrails</Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Profile:{" "}
                    {
                      projectionChart.constraint_summary.normalized_creation_config
                        .optimization_profile
                    }
                    {" | "}Recovery window:{" "}
                    {
                      projectionChart.constraint_summary.normalized_creation_config
                        .post_goal_recovery_days
                    }{" "}
                    day(s)
                    {" | "}Max weekly load ramp:{" "}
                    {
                      projectionChart.constraint_summary.normalized_creation_config
                        .max_weekly_tss_ramp_pct
                    }
                    %{" | "}Max weekly CTL ramp:{" "}
                    {
                      projectionChart.constraint_summary.normalized_creation_config
                        .max_ctl_ramp_per_week
                    }
                  </Text>
                  <Text className="text-[11px] text-muted-foreground">
                    Clamped weeks - Load: {projectionChart.constraint_summary.tss_ramp_clamp_weeks},
                    Fitness: {projectionChart.constraint_summary.ctl_ramp_clamp_weeks}, Recovery:{" "}
                    {projectionChart.constraint_summary.recovery_weeks}
                  </Text>
                  {showContinuousDiagnostics ? (
                    <>
                      {effectiveOptimizerSummary ? (
                        <Text className="text-[11px] text-muted-foreground">
                          Effective optimizer: {effectiveOptimizerSummary}.
                        </Text>
                      ) : null}
                      {activeConstraintSummary ? (
                        <Text className="text-[11px] text-muted-foreground">
                          Active constraints: {activeConstraintSummary}.
                        </Text>
                      ) : null}
                      {bindingConstraintSummary ||
                      continuousDiagnostics.clampPressure !== undefined ? (
                        <Text className="text-[11px] text-muted-foreground">
                          Binding constraints: {bindingConstraintSummary || "none"}
                          {continuousDiagnostics.clampPressure !== undefined
                            ? ` | Clamp pressure ${Math.round(
                                Math.max(
                                  0,
                                  Math.min(100, continuousDiagnostics.clampPressure * 100),
                                ),
                              )}%`
                            : ""}
                        </Text>
                      ) : null}
                      {objectiveSummary ? (
                        <Text className="text-[11px] text-muted-foreground">
                          Objective mix: {objectiveSummary}
                          {continuousDiagnostics.curvatureContribution !== undefined
                            ? ` | curvature ${formatDiagnosticNumber(
                                continuousDiagnostics.curvatureContribution,
                              )}`
                            : ""}
                          .
                        </Text>
                      ) : continuousDiagnostics.curvatureContribution !== undefined ? (
                        <Text className="text-[11px] text-muted-foreground">
                          Curvature contribution:{" "}
                          {formatDiagnosticNumber(continuousDiagnostics.curvatureContribution)}.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </View>
              ) : null}

              {projectionChart.recovery_segments?.length ? (
                <View
                  className="gap-2"
                  accessibilityRole="text"
                  accessibilityLabel={`Post-goal recovery windows. ${recoverySegmentSummary}`}
                >
                  <Text className="text-xs font-medium">Post-goal recovery windows</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {projectionChart.recovery_segments.map((segment) => (
                      <View
                        key={`${segment.goal_id}-${segment.start_date}`}
                        className="rounded-full border border-emerald-300 bg-emerald-100/50 px-3 py-1"
                      >
                        <Text className="text-xs text-emerald-900">
                          {segment.goal_name}: {formatIsoDate(segment.start_date, "MMM d")} -{" "}
                          {formatIsoDate(segment.end_date, "MMM d")}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
});
