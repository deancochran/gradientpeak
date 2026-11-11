import { getResolvedThemeScale } from "@/lib/theme";
import { getPlanChartTheme } from "./planChartTheme";

describe("getPlanChartTheme", () => {
  it.each(["light", "dark"] as const)("uses only the %s semantic scale", (resolvedTheme) => {
    const scale = getResolvedThemeScale(resolvedTheme);
    expect(getPlanChartTheme(resolvedTheme)).toMatchObject({
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
      completedLoad: scale.mutedForeground,
      plannedLoad: scale.border,
      targetLoad: scale.muted,
      selectedMarker: scale.foreground,
    });
  });
});
