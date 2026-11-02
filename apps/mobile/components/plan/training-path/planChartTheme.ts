import { getResolvedThemeScale, type ResolvedThemeMode } from "@/lib/theme";

/** Semantic colors shared by every Plan chart surface. Opacity remains a renderer concern. */
export function getPlanChartTheme(resolvedTheme: ResolvedThemeMode) {
  const scale = getResolvedThemeScale(resolvedTheme);
  const palette = {
    axisLabel: scale.mutedForeground,
    border: scale.border,
    chart1: scale.chart1,
    chart2: scale.chart2,
    chart3: scale.chart3,
    chart4: scale.chart4,
    chart5: scale.chart5,
    foreground: scale.foreground,
    frame: scale.border,
    grid: scale.border,
    muted: scale.muted,
    mutedForeground: scale.mutedForeground,
    selected: scale.muted,
  };
  return {
    ...palette,
    completed: palette.chart1,
    completedDimmed: palette.chart1,
    completedLoad: palette.mutedForeground,
    fatigue: palette.chart3,
    fitness: palette.chart1,
    form: palette.chart5,
    intensity: {
      recovery: palette.mutedForeground,
      endurance: palette.chart1,
      tempo: palette.chart2,
      threshold: palette.chart3,
      vo2max: palette.chart4,
      anaerobic: palette.chart5,
      neuromuscular: palette.foreground,
    },
    marker: palette.foreground,
    planned: palette.chart2,
    plannedDimmed: palette.chart2,
    plannedLoad: palette.border,
    projectedFatigue: palette.chart4,
    projectedFitness: palette.chart2,
    scheduledFitness: palette.chart2,
    selectedMarker: palette.foreground,
    target: palette.chart4,
    targetDimmed: palette.chart4,
    targetLoad: palette.muted,
    targetFitness: palette.foreground,
  };
}
