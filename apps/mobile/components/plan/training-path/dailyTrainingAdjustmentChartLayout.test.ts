import { describe, expect, it } from "vitest";
import {
  buildDailyTrainingAdjustmentAxisTickLabels,
  buildDailyTrainingAdjustmentChartLayout,
  getDailyTrainingAdjustmentMinimumSlotWidth,
  getDailyTrainingAdjustmentNearestIndexForLocation,
  getDailyTrainingAdjustmentRendererPointLimit,
} from "./dailyTrainingAdjustmentChartLayout";

describe("daily training adjustment chart renderer limit", () => {
  it("uses the available chart width for a short window without adding side gutters", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 2,
      density: "standard",
      range: "daily",
      viewportWidth: 240,
    });

    expect(layout.sideInset).toBe(0);
    expect(layout.chartContentWidth).toBe(240);
    expect(layout.bucketCenters).toEqual([60, 180]);
  });

  it("matches the selected highlight to a visual bar while retaining a larger day target", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 2,
      density: "standard",
      range: "daily",
      viewportWidth: 240,
    });

    expect(layout.visualBarWidth * 2 + layout.barGap).toBeLessThan(layout.touchTargetWidth);
    expect(layout.selectionHighlightWidth).toBeLessThan(layout.touchTargetWidth);
    expect(layout.selectionHighlightWidth).toBe(layout.visualBarWidth);
  });

  it("samples date labels as the rendered window grows", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 28,
      density: "compact",
      range: "daily",
      viewportWidth: 320,
    });

    expect(layout.labelEvery).toBe(4);
  });

  it("grows label space and period spacing for large text", () => {
    const standard = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 8,
      density: "standard",
      fontScale: 1,
      range: "monthly",
      viewportWidth: 360,
    });
    const largeText = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 8,
      density: "standard",
      fontScale: 1.8,
      range: "monthly",
      viewportWidth: 360,
    });

    expect(largeText.labelBandHeight).toBeGreaterThan(standard.labelBandHeight);
    expect(largeText.labelWidth).toBeGreaterThan(standard.labelWidth);
    expect(largeText.slotWidth).toBeGreaterThan(standard.slotWidth);
  });

  it("caps the Skia canvas by physical pixels on high-density screens", () => {
    const minimumSlotWidth = getDailyTrainingAdjustmentMinimumSlotWidth({
      density: "standard",
      range: "daily",
    });
    const limit = getDailyTrainingAdjustmentRendererPointLimit({
      maxPhysicalWidth: 3840,
      minimumSlotWidth,
      pixelRatio: 3,
      sideInset: 0,
    });
    const logicalWidth = limit * minimumSlotWidth;

    expect(logicalWidth * 3).toBeLessThanOrEqual(3840);
    expect((limit + 1) * minimumSlotWidth * 3).toBeGreaterThan(3840);
    expect(limit).toBeGreaterThan(5);
  });

  it("uses range minimum slot width instead of a one-bucket expanded width", () => {
    const expanded = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 1,
      density: "standard",
      range: "daily",
      viewportWidth: 360,
    });
    const minimumSlotWidth = getDailyTrainingAdjustmentMinimumSlotWidth({
      density: "standard",
      range: "daily",
    });

    expect(expanded.slotWidth).toBe(360);
    expect(minimumSlotWidth).toBe(44);
    expect(
      getDailyTrainingAdjustmentRendererPointLimit({
        maxPhysicalWidth: 3840,
        minimumSlotWidth,
        pixelRatio: 3,
        sideInset: 0,
      }),
    ).toBe(29);
  });

  it("formats narrow domains with non-duplicated axis labels", () => {
    const labels = buildDailyTrainingAdjustmentAxisTickLabels([40, 40.8]).map(({ label }) => label);

    expect(labels).toEqual(["40.8", "40.6", "40.4", "40.2", "40.0"]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(buildDailyTrainingAdjustmentAxisTickLabels([40, 40])).toHaveLength(1);
  });

  it("fits every daily position into the viewport and narrows bars as the range grows", () => {
    const layouts = [42, 91, 183, 366].map((bucketCount) =>
      buildDailyTrainingAdjustmentChartLayout({
        bucketCount,
        density: "compact",
        fitRange: true,
        pixelRatio: 3,
        range: "daily",
        viewportWidth: 330,
      }),
    );

    expect(layouts.map((layout) => layout.bucketCenters.length)).toEqual([42, 91, 183, 366]);
    expect(layouts.map((layout) => layout.chartContentWidth)).toEqual([330, 330, 330, 330]);
    expect(layouts.map((layout) => layout.visualBarWidth)).toEqual(
      [...layouts.map((layout) => layout.visualBarWidth)].sort((left, right) => right - left),
    );
    expect(layouts.at(-1)?.visualBarWidth).toBeGreaterThanOrEqual(1 / 3);
  });

  it("resolves first, middle, and last fitted positions without per-day touch targets", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 366,
      density: "compact",
      fitRange: true,
      pixelRatio: 3,
      range: "daily",
      viewportWidth: 330,
    });

    expect(getDailyTrainingAdjustmentNearestIndexForLocation(layout, 0)).toBe(0);
    expect(getDailyTrainingAdjustmentNearestIndexForLocation(layout, 165)).toBe(183);
    expect(getDailyTrainingAdjustmentNearestIndexForLocation(layout, 329.99)).toBe(365);
  });
});
