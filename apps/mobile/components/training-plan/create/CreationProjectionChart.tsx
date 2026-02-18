import { Text } from "../../ui/text";
import { useFont } from "@shopify/react-native-skia";
import { useColorScheme } from "nativewind";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type LayoutChangeEvent,
  useWindowDimensions,
} from "react-native";
import { CartesianChart, Line } from "victory-native";
import { format } from "date-fns";
import type {
  NoHistoryProjectionMetadata,
  ProjectionChartPayload,
} from "@repo/core";

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
type UnknownRecord = Record<string, unknown>;

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

const formatNoHistoryConfidence = (
  confidence: NoHistoryProjectionMetadata["projection_floor_confidence"],
) => confidence ?? "n/a";

const formatCompactAxisNumber = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
};

const asRecord = (value: unknown): UnknownRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
};

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const toBoundedPercent = (value: number): number => {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
};

const readPercent = (value: unknown): number | undefined => {
  const numeric = asFiniteNumber(value);
  if (numeric !== undefined) {
    return toBoundedPercent(numeric);
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const candidateKeys = [
    "score",
    "value",
    "percent",
    "percentage",
    "confidence",
    "confidence_score",
    "confidence_0_100",
    "uncertainty",
    "uncertainty_score",
    "uncertainty_0_100",
    "prediction_uncertainty",
    "prediction_confidence",
  ];

  for (const key of candidateKeys) {
    const candidate = asFiniteNumber(record[key]);
    if (candidate !== undefined) {
      return toBoundedPercent(candidate);
    }
  }

  return undefined;
};

const resolveProjectionConfidenceHint = (
  projectionChart: ProjectionChartPayload | undefined,
  selectedPoint: ProjectionPoint | undefined,
) => {
  const selectedPointRecord = asRecord(selectedPoint as unknown);
  const uncertaintyPercent =
    readPercent(selectedPointRecord?.prediction_uncertainty) ??
    readPercent(selectedPointRecord?.predictionUncertainty) ??
    readPercent(asRecord(projectionChart as unknown)?.prediction_uncertainty) ??
    readPercent(asRecord(projectionChart as unknown)?.predictionUncertainty);
  if (uncertaintyPercent !== undefined) {
    return `Uncertainty hint: forecast spread ${Math.round(uncertaintyPercent)}%. Readiness remains the primary signal.`;
  }

  const confidencePercent =
    readPercent(selectedPointRecord?.prediction_confidence) ??
    readPercent(selectedPointRecord?.predictionConfidence) ??
    readPercent(projectionChart?.readiness_confidence) ??
    readPercent(projectionChart?.no_history?.evidence_confidence?.score);
  if (confidencePercent !== undefined) {
    return `Confidence hint: model confidence ${Math.round(confidencePercent)}%. Readiness remains the primary signal.`;
  }

  const confidenceState =
    projectionChart?.no_history?.evidence_confidence?.state ??
    projectionChart?.no_history?.projection_floor_confidence;
  if (confidenceState) {
    return `Confidence hint: evidence confidence ${confidenceState}. Readiness remains the primary signal.`;
  }

  return undefined;
};

const toSentenceKey = (key: string) =>
  key.replaceAll("_", " ").replaceAll("-", " ").trim();

const formatDiagnosticNumber = (value: number) => {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const summarizeNumericRecord = (
  record: UnknownRecord | undefined,
  limit: number,
) => {
  if (!record) {
    return "";
  }

  const entries = Object.entries(record)
    .map(([key, value]) => {
      const numeric = asFiniteNumber(value);
      if (numeric === undefined) {
        return null;
      }
      return `${toSentenceKey(key)} ${formatDiagnosticNumber(numeric)}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  return entries.slice(0, limit).join(", ");
};

const readFirstRecord = (
  source: UnknownRecord | undefined,
  keys: string[],
): UnknownRecord | undefined => {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = asRecord(source[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const readFirstNumber = (
  source: UnknownRecord | undefined,
  keys: string[],
): number | undefined => {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = asFiniteNumber(source[key]);
    if (candidate !== undefined) {
      return candidate;
    }
  }

  return undefined;
};

const readFirstStringArray = (
  source: UnknownRecord | undefined,
  keys: string[],
): string[] => {
  if (!source) {
    return [];
  }

  for (const key of keys) {
    const candidate = asStringArray(source[key]);
    if (candidate.length > 0) {
      return candidate;
    }
  }

  return [];
};

const resolveContinuousProjectionDiagnostics = (
  projectionChart: ProjectionChartPayload | undefined,
) => {
  const baseDiagnostics = asRecord(projectionChart?.projection_diagnostics);
  const scopedDiagnostics =
    readFirstRecord(baseDiagnostics, [
      "continuous_projection_diagnostics",
      "continuous_projection",
      "continuous",
    ]) ?? baseDiagnostics;

  const effectiveOptimizer = readFirstRecord(scopedDiagnostics, [
    "effective_optimizer",
    "effectiveOptimizer",
    "effective_optimizer_values",
    "effectiveOptimizerValues",
  ]);
  const effectiveOptimizerConfig = readFirstRecord(scopedDiagnostics, [
    "effective_optimizer_config",
    "effectiveOptimizerConfig",
  ]);
  const objectiveContributions = readFirstRecord(scopedDiagnostics, [
    "objective_contributions",
    "objectiveContributions",
  ]);
  const objectiveComposition = readFirstRecord(scopedDiagnostics, [
    "objective_composition",
    "objectiveComposition",
  ]);
  const clampCounts = readFirstRecord(scopedDiagnostics, [
    "clamp_counts",
    "clampCounts",
  ]);
  const sampledWeeks =
    readFirstNumber(objectiveContributions, [
      "sampled_weeks",
      "sampledWeeks",
    ]) ?? undefined;
  const derivedClampPressure =
    clampCounts && sampledWeeks && sampledWeeks > 0
      ? ((readFirstNumber(clampCounts, ["tss"]) ?? 0) +
          (readFirstNumber(clampCounts, ["ctl"]) ?? 0)) /
        sampledWeeks
      : undefined;
  const effectiveOptimizerSummaryRecord =
    effectiveOptimizer ??
    readFirstRecord(effectiveOptimizerConfig, ["weights"]) ??
    effectiveOptimizerConfig;
  const objectiveSummaryRecord =
    objectiveComposition ??
    readFirstRecord(objectiveContributions, [
      "weighted_terms",
      "weightedTerms",
    ]) ??
    objectiveContributions;
  const curvatureContribution =
    readFirstNumber(scopedDiagnostics, [
      "curvature_contribution",
      "curvatureContribution",
    ]) ??
    readFirstNumber(objectiveSummaryRecord, [
      "curvature_contribution",
      "curvatureContribution",
      "curvature",
      "curve",
    ]);

  return {
    activeConstraints: readFirstStringArray(scopedDiagnostics, [
      "active_constraints",
      "activeConstraints",
    ]),
    bindingConstraints: readFirstStringArray(scopedDiagnostics, [
      "binding_constraints",
      "bindingConstraints",
    ]),
    clampPressure:
      readFirstNumber(scopedDiagnostics, ["clamp_pressure", "clampPressure"]) ??
      (derivedClampPressure !== undefined
        ? Math.max(0, Math.min(1, derivedClampPressure))
        : undefined),
    effectiveOptimizer: effectiveOptimizerSummaryRecord,
    objectiveComposition: objectiveSummaryRecord,
    curvatureContribution,
  };
};

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
    return require("../../../assets/fonts/SpaceMono-Regular.ttf") as Parameters<
      typeof useFont
    >[0];
  } catch {
    return undefined;
  }
};

const getPhaseColor = (phaseName: string, isDark: boolean) => {
  const normalized = phaseName.toLowerCase();

  if (normalized.includes("base")) {
    return isDark ? "rgba(56, 189, 248, 0.78)" : "rgba(3, 105, 161, 0.78)";
  }
  if (normalized.includes("build")) {
    return isDark ? "rgba(52, 211, 153, 0.8)" : "rgba(5, 150, 105, 0.8)";
  }
  if (normalized.includes("peak")) {
    return isDark ? "rgba(250, 204, 21, 0.85)" : "rgba(202, 138, 4, 0.85)";
  }
  if (normalized.includes("taper")) {
    return isDark ? "rgba(148, 163, 184, 0.82)" : "rgba(71, 85, 105, 0.82)";
  }
  if (normalized.includes("recovery")) {
    return isDark ? "rgba(167, 139, 250, 0.82)" : "rgba(124, 58, 237, 0.82)";
  }

  return isDark ? "rgba(148, 163, 184, 0.72)" : "rgba(100, 116, 139, 0.72)";
};

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

type PhaseBandPlacement = {
  key: string;
  label: string;
  left: number;
  width: number;
  color: string;
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

  const visibleStartDate = points[0]?.date;
  const visibleEndDate = points[points.length - 1]?.date;
  const visibleMarkers =
    visibleStartDate && visibleEndDate
      ? mergedMarkers.filter((goal) =>
          isDateWithinRange(goal.target_date, visibleStartDate, visibleEndDate),
        )
      : mergedMarkers;

  if (visibleMarkers.length === 0) {
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

  for (const goal of visibleMarkers) {
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

const resolveNearestPointIndexByDate = (
  points: ProjectionPoint[],
  date: string,
): number | null => {
  if (points.length === 0) return null;

  const directIndex = points.findIndex((point) => point.date === date);
  if (directIndex >= 0) return directIndex;

  const target = toUtcDate(date);
  if (!target) return null;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const pointDate = toUtcDate(points[index]!.date);
    if (!pointDate) continue;
    const distance = Math.abs(pointDate.getTime() - target.getTime());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
};

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
    compact = false,
    chartMaxHeight,
  }: CreationProjectionChartProps) {
    const { colorScheme } = useColorScheme();
    const isDark = colorScheme === "dark";
    const { width } = useWindowDimensions();
    const [measuredChartContainerWidth, setMeasuredChartContainerWidth] =
      useState(0);
    const fallbackChartContainerWidth = width;
    const chartWidth = Math.max(
      1,
      measuredChartContainerWidth || fallbackChartContainerWidth,
    );
    const resolvedChartHeight = Math.max(
      minChartHeight,
      Math.floor(chartMaxHeight ?? defaultChartHeight),
    );
    const [plotBounds, setPlotBounds] = useState<PlotBounds>(() => ({
      left: chartPadding.left + chartDomainPadding.left + markerEdgeInset,
      right:
        chartWidth -
        chartPadding.right -
        chartDomainPadding.right -
        markerEdgeInset,
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
    const goalLineIndices = useMemo(
      () =>
        Array.from(
          new Set(goalPointPlacements.map((p) => p.pointIndex)),
        ).filter((index) => index >= 0 && index < points.length),
      [goalPointPlacements, points.length],
    );
    const phaseBoundaryMarkers = useMemo(() => {
      if (!projectionChart) {
        return [] as Array<{ index: number; label: string }>;
      }

      const deduped = new Map<number, string>();
      for (const phase of projectionChart.periodization_phases.slice(1)) {
        const index = resolveNearestPointIndexByDate(points, phase.start_date);
        if (index === null || index <= 0 || index >= points.length - 1) {
          continue;
        }
        if (!deduped.has(index)) {
          deduped.set(index, phase.name);
        }
      }

      return Array.from(deduped.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([index, label]) => ({ index, label }));
    }, [points, projectionChart]);
    const handlePlotBoundsChange = useCallback((nextBounds: PlotBounds) => {
      setPlotBounds((previous) =>
        areBoundsEqual(previous, nextBounds) ? previous : nextBounds,
      );
    }, []);
    useEffect(() => {
      const fallbackBounds: PlotBounds = {
        left: chartPadding.left + chartDomainPadding.left + markerEdgeInset,
        right:
          chartWidth -
          chartPadding.right -
          chartDomainPadding.right -
          markerEdgeInset,
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
        return (
          plotBounds.left +
          ratio * Math.max(0, plotBounds.right - plotBounds.left)
        );
      },
      [plotBounds.left, plotBounds.right, points.length],
    );
    const phaseBandPlacements = useMemo(() => {
      if (!projectionChart || points.length === 0) {
        return [] as PhaseBandPlacement[];
      }

      const visibleStart = points[0]?.date;
      const visibleEnd = points[points.length - 1]?.date;
      if (!visibleStart || !visibleEnd) {
        return [] as PhaseBandPlacement[];
      }

      const rawBands = projectionChart.periodization_phases
        .map((phase) => {
          const clampedStart =
            phase.start_date < visibleStart ? visibleStart : phase.start_date;
          const clampedEnd =
            phase.end_date > visibleEnd ? visibleEnd : phase.end_date;
          if (clampedStart > clampedEnd) {
            return null;
          }

          const startIndex = resolveNearestPointIndexByDate(
            points,
            clampedStart,
          );
          const endIndex = resolveNearestPointIndexByDate(points, clampedEnd);
          if (startIndex === null || endIndex === null) {
            return null;
          }

          const leftIndex = Math.min(startIndex, endIndex);
          const rightIndex = Math.max(startIndex, endIndex);
          const left = markerXForIndex(leftIndex);
          const right = markerXForIndex(rightIndex);

          return {
            key: phase.id,
            label: phase.name,
            left,
            width: Math.max(1, right - left),
            color: getPhaseColor(phase.name, isDark),
          };
        })
        .filter((phase): phase is PhaseBandPlacement => phase !== null);

      const sortedBands = [...rawBands].sort((a, b) => a.left - b.left);

      return sortedBands.map((band, index) => {
        const nextBand = sortedBands[index + 1];
        const connectedWidth = nextBand
          ? Math.max(1, nextBand.left - band.left)
          : band.width;

        return {
          ...band,
          width: connectedWidth,
        };
      });
    }, [isDark, markerXForIndex, points, projectionChart]);
    const phaseLegendItems = useMemo(() => {
      const deduped = new Map<string, { label: string; color: string }>();
      for (const phase of phaseBandPlacements) {
        const key = phase.label.trim().toLowerCase();
        if (!deduped.has(key)) {
          deduped.set(key, { label: phase.label, color: phase.color });
        }
      }

      return Array.from(deduped.values());
    }, [phaseBandPlacements]);
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
            index === 0 ||
            index % labelStride === 0 ||
            index === points.length - 1;
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

    const visibleChartYKeys = useMemo(
      () =>
        lineConfig
          .filter((line) => lineVisibility[line.key])
          .map((line) => line.key),
      [lineVisibility],
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
          yKeys: ["loadTss"] as ChartYKey[],
          axisSide: "left" as const,
          domain: [0] as [number],
          labelPosition: "outset" as const,
          labelOffset: 8,
          font: axisFont,
          tickCount: 5,
          labelColor: isDark ? "#93c5fd" : "#1d4ed8",
          lineColor: isDark
            ? "rgba(38, 38, 38, 0.55)"
            : "rgba(228, 228, 228, 0.75)",
          lineWidth: 1,
          formatYLabel: (value: unknown) =>
            formatCompactAxisNumber(Number(value)),
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
          formatYLabel: (value: unknown) =>
            formatCompactAxisNumber(Number(value)),
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
      () =>
        lineConfig.reduce(
          (count, line) => count + (lineVisibility[line.key] ? 1 : 0),
          0,
        ),
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
    const projectionConfidenceHint = resolveProjectionConfidenceHint(
      projectionChart,
      selectedPoint,
    );
    const selectedPointSummary = selectedPoint
      ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date}. Weekly load ${Math.round(selectedPoint.predicted_load_tss)} TSS. Fitness ${selectedPoint.predicted_fitness_ctl.toFixed(1)} CTL. Fatigue ${selectedPoint.predicted_fatigue_atl.toFixed(1)} ATL. Readiness ${Math.round(selectedReadiness ?? 0)} out of 100.`
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
    const noHistoryFloorEnabledLabel =
      noHistoryMetadata?.projection_floor_applied ? "Yes" : "No";
    const noHistoryAvailabilityClampLabel =
      noHistoryMetadata?.floor_clamped_by_availability ? "On" : "Off";
    const evidenceConfidenceScore =
      noHistoryMetadata?.evidence_confidence?.score;
    const evidenceConfidenceState =
      noHistoryMetadata?.evidence_confidence?.state;
    const readinessBand =
      noHistoryMetadata?.projection_feasibility?.readiness_band;
    const unmetDemand =
      noHistoryMetadata?.projection_feasibility?.demand_gap.unmet_weekly_tss;
    const dominantLimiters =
      noHistoryMetadata?.projection_feasibility?.dominant_limiters ?? [];
    const noHistoryAccessibilitySummary = noHistoryMetadata
      ? `Adaptive demand confidence ${noHistoryConfidenceLabel}. Demand floor enabled ${noHistoryFloorEnabledLabel}. Availability clamp ${noHistoryAvailabilityClampLabel}. Evidence confidence ${evidenceConfidenceState ?? "n/a"} ${evidenceConfidenceScore !== undefined ? evidenceConfidenceScore.toFixed(2) : "n/a"}. Readiness ${readinessBand ?? "n/a"}.`
      : undefined;
    const continuousDiagnostics = useMemo(
      () => resolveContinuousProjectionDiagnostics(projectionChart),
      [projectionChart],
    );
    const effectiveOptimizerSummary = summarizeNumericRecord(
      continuousDiagnostics.effectiveOptimizer,
      4,
    );
    const objectiveSummary = summarizeNumericRecord(
      continuousDiagnostics.objectiveComposition,
      5,
    );
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
          compact
            ? "gap-1 px-2 pt-1 pb-1"
            : "gap-1 rounded-lg border border-border bg-card px-2 py-1"
        }
      >
        <View className="flex-row items-center justify-between">
          <Text className="font-semibold">Projection</Text>
          {isPreviewPending && (
            <Text className="text-xs text-muted-foreground">Refreshing...</Text>
          )}
        </View>

        {!compact && noHistoryMetadata ? (
          <View
            className="gap-1 rounded-md border border-border bg-muted/20 p-2"
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={noHistoryAccessibilitySummary}
          >
            <Text className="text-[11px] text-muted-foreground">
              Adaptive demand
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Confidence: {noHistoryConfidenceLabel}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Evidence confidence: {evidenceConfidenceState ?? "n/a"}{" "}
              {evidenceConfidenceScore !== undefined
                ? `(${evidenceConfidenceScore.toFixed(2)})`
                : ""}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Readiness: {readinessBand ?? "n/a"}
              {unmetDemand !== undefined
                ? ` | Demand gap: ${Math.round(unmetDemand)} TSS`
                : ""}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Demand floor enabled: {noHistoryFloorEnabledLabel}
            </Text>
            <Text className="text-[11px] text-muted-foreground">
              Availability clamp: {noHistoryAvailabilityClampLabel}
            </Text>
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
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
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
                          height: Math.max(
                            0,
                            plotBounds.bottom - plotBounds.top,
                          ),
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
                          height: Math.max(
                            0,
                            plotBounds.bottom - plotBounds.top,
                          ),
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
                          top: Math.min(
                            resolvedChartHeight - 10,
                            plotBounds.bottom + 2,
                          ),
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

            <View className="gap-1">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: "center", gap: 6 }}
              >
                {lineConfig.map((line) => {
                  const isActive = lineVisibility[line.key];
                  const isOnlyVisibleLine = isActive && activeLineCount === 1;
                  return (
                    <Pressable
                      key={line.key}
                      onPress={() => toggleLineVisibility(line.key)}
                      disabled={isOnlyVisibleLine}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: isActive,
                        disabled: isOnlyVisibleLine,
                      }}
                      accessibilityLabel={`${line.label} line`}
                      accessibilityHint={
                        isOnlyVisibleLine
                          ? "At least one chart line must remain visible"
                          : `${isActive ? "Hide" : "Show"} this series`
                      }
                      hitSlop={8}
                      className={`flex-row items-center gap-1 rounded-full border px-1.5 py-0.5 ${isActive ? "border-border bg-muted/40" : "border-border/70 bg-background/70"}`}
                    >
                      <View
                        className="h-0.5 w-3 rounded-full"
                        style={{
                          backgroundColor: line.color,
                          opacity: isActive ? 1 : 0.35,
                        }}
                      />
                      <Text
                        className={`text-[9px] ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                      >
                        {line.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {phaseLegendItems.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ alignItems: "center", gap: 8 }}
                >
                  <Text className="text-[9px] text-muted-foreground">
                    Phase colors:
                  </Text>
                  {phaseLegendItems.map((phase) => (
                    <View
                      key={`phase-legend-${phase.label}`}
                      className="flex-row items-center gap-1"
                    >
                      <View
                        className="h-1 w-3 rounded-full"
                        style={{ backgroundColor: phase.color }}
                      />
                      <Text className="text-[9px] text-muted-foreground">
                        {phase.label}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {!compact && (
              <>
                <Text className="px-1 text-[11px] text-muted-foreground">
                  Raw projected values are shown directly: weekly load in
                  TSS/week, fitness in CTL, and fatigue in ATL. Readiness is
                  still calculated from core projection output (0-100) and shown
                  in selected-point details below, but not drawn as a chart
                  line.
                </Text>
                <Text className="px-1 text-[11px] text-muted-foreground">
                  CTL and ATL are training-state metrics only and are not
                  suitability or safety determinations.
                </Text>
                <Text className="px-1 text-[11px] text-muted-foreground">
                  Projection window:{" "}
                  {formatIsoDate(projectionChart.start_date, "MMM d, yyyy")} to{" "}
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
                      ? `${longDateLabels[selectedPointIndex] ?? selectedPoint.date} - Weekly load ${Math.round(selectedPoint.predicted_load_tss)} TSS - CTL ${selectedPoint.predicted_fitness_ctl.toFixed(1)} - ATL ${selectedPoint.predicted_fatigue_atl.toFixed(1)} - Readiness ${Math.round(selectedReadiness ?? 0)}/100`
                      : "Tap a point to inspect projected details."}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    CTL/ATL describe training load and fatigue trends only; they
                    do not determine athlete suitability.
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    Active phase: {activePhase?.name ?? "-"}
                  </Text>
                  {projectionConfidenceHint ? (
                    <Text className="text-xs text-muted-foreground">
                      {projectionConfidenceHint}
                    </Text>
                  ) : null}
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
                        {formatIsoDate(
                          selectedMicrocycle.week_start_date,
                          "MMM d",
                        )}{" "}
                        -{" "}
                        {formatIsoDate(
                          selectedMicrocycle.week_end_date,
                          "MMM d",
                        )}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">
                        Weekly load: requested{" "}
                        {Math.round(
                          selectedMicrocycle.metadata.tss_ramp
                            .raw_requested_weekly_tss,
                        )}
                        {selectedMicrocycle.metadata.tss_ramp
                          .floor_override_applied
                          ? `, floored to ${Math.round(
                              selectedMicrocycle.metadata.tss_ramp
                                .requested_weekly_tss,
                            )}`
                          : ""}
                        , applied{" "}
                        {Math.round(
                          selectedMicrocycle.metadata.tss_ramp
                            .applied_weekly_tss,
                        )}
                        {selectedMicrocycle.metadata.tss_ramp
                          .floor_override_applied
                          ? " (floor minimum applied)"
                          : selectedMicrocycle.metadata.tss_ramp.clamped
                            ? " (clamped by ramp cap)"
                            : " (within ramp cap)"}
                      </Text>
                      <Text className="text-[11px] text-muted-foreground">
                        Demand floor this week:{" "}
                        {selectedMicrocycle.metadata.tss_ramp
                          .floor_override_applied
                          ? "active"
                          : "not active"}
                        {selectedMicrocycle.metadata.tss_ramp
                          .demand_band_minimum_weekly_tss !== undefined &&
                        selectedMicrocycle.metadata.tss_ramp
                          .demand_band_minimum_weekly_tss !== null
                          ? ` (${Math.round(selectedMicrocycle.metadata.tss_ramp.demand_band_minimum_weekly_tss)} TSS min)`
                          : ""}
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
                          accessibilityHint={`Weekly load ${Math.round(point.predicted_load_tss)} TSS, fitness ${point.predicted_fitness_ctl.toFixed(1)} CTL, fatigue ${point.predicted_fatigue_atl.toFixed(1)} ATL, readiness ${Math.round(point.readiness_score ?? 0)} out of 100`}
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
                  <Text className="text-xs font-medium">
                    Periodization phases
                  </Text>
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
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      <View className="flex-row gap-2">
                        {projectionChart.microcycles.map((microcycle) => (
                          <View
                            key={`${microcycle.week_start_date}-${microcycle.week_end_date}`}
                            className="rounded-md border border-border bg-muted/20 px-3 py-2"
                          >
                            <Text className="text-xs font-medium">
                              {formatIsoDate(
                                microcycle.week_start_date,
                                "MMM d",
                              )}{" "}
                              -{" "}
                              {formatIsoDate(microcycle.week_end_date, "MMM d")}
                            </Text>
                            <Text className="text-[11px] capitalize text-muted-foreground">
                              {microcycle.phase} - {microcycle.pattern}
                            </Text>
                            <Text className="text-[11px] text-muted-foreground">
                              {Math.round(microcycle.planned_weekly_tss)} TSS /
                              CTL {microcycle.projected_ctl.toFixed(1)}
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
                      Recovery:{" "}
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
                            Binding constraints:{" "}
                            {bindingConstraintSummary || "none"}
                            {continuousDiagnostics.clampPressure !== undefined
                              ? ` | Clamp pressure ${Math.round(
                                  Math.max(
                                    0,
                                    Math.min(
                                      100,
                                      continuousDiagnostics.clampPressure * 100,
                                    ),
                                  ),
                                )}%`
                              : ""}
                          </Text>
                        ) : null}
                        {objectiveSummary ? (
                          <Text className="text-[11px] text-muted-foreground">
                            Objective mix: {objectiveSummary}
                            {continuousDiagnostics.curvatureContribution !==
                            undefined
                              ? ` | curvature ${formatDiagnosticNumber(
                                  continuousDiagnostics.curvatureContribution,
                                )}`
                              : ""}
                            .
                          </Text>
                        ) : continuousDiagnostics.curvatureContribution !==
                          undefined ? (
                          <Text className="text-[11px] text-muted-foreground">
                            Curvature contribution:{" "}
                            {formatDiagnosticNumber(
                              continuousDiagnostics.curvatureContribution,
                            )}
                            .
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
          </>
        )}
      </View>
    );
  },
);
