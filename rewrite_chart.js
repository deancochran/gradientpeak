const fs = require('fs');

const original = fs.readFileSync('apps/mobile/components/charts/PlanVsActualChart.tsx', 'utf-8');

let modified = original.replace(
  'import { CartesianChart, Line, Area, Scatter } from "victory-native";',
  'import { CartesianChart, Line, Area, Scatter } from "victory-native";'
).replace(
  'import { DashPathEffect, useFont } from "@shopify/react-native-skia";',
  'import { DashPathEffect, useFont, Line as SkiaLine, vec } from "@shopify/react-native-skia";'
);

modified = modified.replace('actual: number;', 'actual: number | null;');
modified = modified.replace('const chartDomainPadding = { left: 0, right: 0, top: 18, bottom: 10 };', 'const chartDomainPadding = { left: 0, right: 0, top: 10, bottom: 0 };');

modified = modified.replace(/const normalizedPoints = useMemo[\s\S]*?\}, \[actualData, idealData, projectedData, timeline, useInsightTimeline\]\);/, `
  const framedPoints = useMemo<NormalizedPoint[]>(() => {
    let base = useInsightTimeline && timeline 
      ? aggregateTimelineByWeek(timeline)
      : buildFallbackPoints({ actualData, projectedData, idealData: idealData ?? [] });

    const todayStr = new Date().toISOString().split("T")[0];
    const todayWeek = getWeekStartDateKey(todayStr);

    let startIndex = 0;
    let endIndex = base.length - 1;

    if (goalMetrics?.targetDate) {
      const goalWeek = getWeekStartDateKey(goalMetrics.targetDate);
      const sIdx = base.findIndex(p => p.date >= todayWeek);
      const eIdx = base.findIndex(p => p.date >= goalWeek);
      
      if (sIdx !== -1) startIndex = sIdx;
      if (eIdx !== -1) endIndex = eIdx;
    } else {
      const sIdx = base.findIndex(p => (p.planned ?? 0) > 0 || (p.actual ?? 0) > 0);
      const revBase = [...base].reverse();
      const revEIdx = revBase.findIndex(p => (p.planned ?? 0) > 0 || (p.actual ?? 0) > 0);
      if (sIdx !== -1) startIndex = sIdx;
      if (revEIdx !== -1) endIndex = base.length - 1 - revEIdx;
    }

    startIndex = Math.max(0, startIndex - 1);
    endIndex = Math.min(base.length - 1, endIndex + 1);

    if (startIndex > endIndex) return base;
    return base.slice(startIndex, endIndex + 1).map((p, i) => ({ ...p, index: i }));
  }, [actualData, idealData, projectedData, timeline, useInsightTimeline, goalMetrics?.targetDate]);
`);

modified = modified.replace(/const \[visibleSeries[\s\S]*?\}\);/, '');

modified = modified.replace(/const hasSeriesData = \{[\s\S]*?\};/, `
  const hasSeriesData = {
    projection: framedPoints.some((point) => typeof point.projection === "number"),
    planned: framedPoints.some((point) => typeof point.planned === "number"),
    actual: framedPoints.some((point) => typeof point.actual === "number"),
  };
`);

modified = modified.replace('const isEmpty = normalizedPoints.length === 0;', 'const isEmpty = framedPoints.length === 0;');
modified = modified.replace(/const hasAnyVisibleSeries = [\s\S]*?\);/, 'const hasAnyVisibleSeries = true;');

modified = modified.replace(/buildSparseLabels\(normalizedPoints\)/, 'buildSparseLabels(framedPoints)');
modified = modified.replace(/buildAxisTickIndexes\(normalizedPoints\.length, 6\)/, 'buildAxisTickIndexes(framedPoints.length, 6)');
modified = modified.replace(/normalizedPoints\.length/g, 'framedPoints.length');

modified = modified.replace(/const chartData = useMemo<ChartDatum\[\]>\(\(\) => \{[\s\S]*?\}, \[goalLineValue, normalizedPoints\]\);/, `
  const chartData = useMemo<ChartDatum[]>(() => {
    const projectionValues = fillSeries(
      framedPoints.map((point) => point.projection),
    );
    const plannedValues = fillSeries(
      framedPoints.map((point) => point.planned),
    );
    const actualValues = framedPoints.map((point) => point.actual);

    return framedPoints.map((point, index) => ({
      index,
      projection: projectionValues[index] ?? 0,
      planned: plannedValues[index] ?? 0,
      actual: actualValues[index] ?? null,
      goal: goalLineValue ?? 0,
    }));
  }, [goalLineValue, framedPoints]);
`);

modified = modified.replace(/const yAxisMax = useMemo\(\(\) => \{[\s\S]*?\}, \[goalLineValue, normalizedPoints\]\);/, `
  const yAxisMax = useMemo(() => {
    const observedValues = framedPoints.flatMap((point) => {
      const values = [point.projection, point.planned, point.actual].filter(
        (value): value is number => typeof value === "number" && value >= 0,
      );
      return values;
    });

    if (typeof goalLineValue === "number" && goalLineValue >= 0) {
      observedValues.push(goalLineValue);
    }

    return computeYAxisMax(observedValues);
  }, [goalLineValue, framedPoints]);
`);

modified = modified.replace(/<View className="mb-1 flex-row items-center justify-between">[\s\S]*?<\/View>\s*<View className="flex-row flex-wrap gap-1\.5 mb-2">[\s\S]*?<\/View>/, '');

modified = modified.replace(/\{visibleSeries\.projection && hasSeriesData\.projection \? \([\s\S]*?\) : null\}/, `
                    {hasSeriesData.projection ? (
                      <Area
                        points={points.projection}
                        y0={chartBounds.bottom}
                        color={SERIES_META.projection.color.replace(
                          "0.95)",
                          "0.15)",
                        )}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
`);

modified = modified.replace(/\{visibleSeries\.planned && hasSeriesData\.planned \? \([\s\S]*?\) : null\}/, `
                    {hasSeriesData.planned ? (
                      <Line
                        points={points.planned}
                        color={SERIES_META.planned.color}
                        strokeWidth={SERIES_META.planned.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
`);

modified = modified.replace(/\{visibleSeries\.actual && hasSeriesData\.actual \? \([\s\S]*?\) : null\}/, `
                    {hasSeriesData.actual ? (
                      <Scatter
                        points={points.actual.filter(p => p.yValue !== null && p.yValue > 0)}
                        color={SERIES_META.actual.color}
                        radius={4}
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
`);

modified = modified.replace(/\{goalLineValue !== null \? \([\s\S]*?\) : null\}/, `
                    {(() => {
                      if (!goalMetrics?.targetDate) return null;
                      const goalWeek = getWeekStartDateKey(goalMetrics.targetDate);
                      const goalIndex = framedPoints.findIndex(p => p.date >= goalWeek);
                      if (goalIndex === -1) return null;
                      const targetPoint = points.projection[goalIndex] || points.planned[goalIndex];
                      if (!targetPoint) return null;
                      
                      return (
                        <SkiaLine
                          p1={vec(targetPoint.x, chartBounds.bottom)}
                          p2={vec(targetPoint.x, chartBounds.top)}
                          color="rgba(34, 197, 94, 0.6)"
                          strokeWidth={2}
                        >
                          <DashPathEffect intervals={[4, 4]} />
                        </SkiaLine>
                      );
                    })()}
`);

fs.writeFileSync('apps/mobile/components/charts/PlanVsActualChart.tsx', modified);

