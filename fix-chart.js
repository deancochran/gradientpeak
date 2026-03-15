const fs = require('fs');

let code = fs.readFileSync('apps/mobile/components/charts/PlanVsActualChart.tsx', 'utf-8');

code = code.replace(
  'import { CartesianChart, Line, Area } from "victory-native";',
  'import { CartesianChart, Line, Area, Scatter } from "victory-native";'
);
code = code.replace(
  'import { DashPathEffect, useFont } from "@shopify/react-native-skia";',
  'import { DashPathEffect, useFont, Line as SkiaLine, vec } from "@shopify/react-native-skia";'
);

code = code.replace(
  'actual: number;',
  'actual: number | null;'
);

code = code.replace(
  'const chartDomainPadding = { left: 0, right: 0, top: 18, bottom: 10 };',
  'const chartDomainPadding = { left: 0, right: 0, top: 10, bottom: 0 };'
);

code = code.replace(
  'const normalizedPoints = useMemo<NormalizedPoint[]>(() => {',
  `const framedPoints = useMemo<NormalizedPoint[]>(() => {`
);

code = code.replace(
  /return buildFallbackPoints\(\{[\s\S]*?\}\);\n  \}, \[actualData, idealData, projectedData, timeline, useInsightTimeline\]\);/,
  `    let base = useInsightTimeline && timeline 
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
  }, [actualData, idealData, projectedData, timeline, useInsightTimeline, goalMetrics?.targetDate]);`
);

// We need to replace usages of normalizedPoints with framedPoints
code = code.replace(/normalizedPoints/g, 'framedPoints');

// Now remove the UI for toggle
code = code.replace(
  /const \[visibleSeries, setVisibleSeries\] = useState<\s*Record<SeriesKey, boolean>\s*>\(\{[\s\S]*?\}\);/,
  ''
);

code = code.replace(
  /const hasAnyVisibleSeries = \(Object\.keys\(visibleSeries\) as SeriesKey\[\]\)\.some\(\s*\(series\) => visibleSeries\[series\] && hasSeriesData\[series\],\s*\);/,
  'const hasAnyVisibleSeries = true;'
);

code = code.replace(
  /const actualValues = fillSeries\(\s*framedPoints\.map\(\(point\) => point\.actual\),\s*\);/,
  'const actualValues = framedPoints.map((point) => point.actual);'
);

code = code.replace(
  /<View className="mb-1 flex-row items-center justify-between">[\s\S]*?<\/View>\s*<View className="flex-row flex-wrap gap-1\.5 mb-2">[\s\S]*?<\/View>/,
  ''
);

// Replace lines with correct area/line/scatter

let newChartContent = `
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
                    {hasSeriesData.planned ? (
                      <Line
                        points={points.planned}
                        color={SERIES_META.planned.color}
                        strokeWidth={SERIES_META.planned.strokeWidth}
                        curveType="natural"
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
                    {hasSeriesData.actual ? (
                      <Scatter
                        points={points.actual.filter(p => p.yValue !== null && p.yValue > 0)}
                        color={SERIES_META.actual.color}
                        radius={4}
                        animate={{ type: "timing", duration: 180 }}
                      />
                    ) : null}
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
`;

code = code.replace(
  /\{visibleSeries\.projection && hasSeriesData\.projection \? \([\s\S]*?\)\s*:\s*null\}/,
  newChartContent + '/*REPLACED_CHART_CONTENT*/'
);
// It replaces the first occurrence, which is projection. Then we need to delete the rest of the old rendering.
code = code.replace(/\{visibleSeries\.planned && hasSeriesData\.planned \? \([\s\S]*?\)\s*:\s*null\}/, '');
code = code.replace(/\{visibleSeries\.actual && hasSeriesData\.actual \? \([\s\S]*?\)\s*:\s*null\}/, '');
code = code.replace(/\{goalLineValue !== null \? \([\s\S]*?\)\s*:\s*null\}/, '');
code = code.replace(/\/\*REPLACED_CHART_CONTENT\*\//, '');

fs.writeFileSync('apps/mobile/components/charts/PlanVsActualChart.tsx', code);
