import { describe, expect, it } from "vitest";
import {
  buildDailyTrainingAdjustmentChartLayout,
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

  it("keeps visual bars and selection narrower than their accessible day target", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 2,
      density: "standard",
      range: "daily",
      viewportWidth: 240,
    });

    expect(layout.visualBarWidth * 2 + layout.barGap).toBeLessThan(layout.touchTargetWidth);
    expect(layout.selectionHighlightWidth).toBeLessThan(layout.touchTargetWidth);
    expect(layout.selectionHighlightWidth).toBeGreaterThan(layout.visualBarWidth * 2);
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
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 1,
      density: "standard",
      range: "daily",
      viewportWidth: 360,
    });
    const limit = getDailyTrainingAdjustmentRendererPointLimit({
      maxPhysicalWidth: 3840,
      pixelRatio: 3,
      sideInset: layout.sideInset,
      slotWidth: layout.slotWidth,
    });
    const logicalWidth = layout.sideInset * 2 + limit * layout.slotWidth;

    expect(logicalWidth * 3).toBeLessThanOrEqual(3840);
    expect((layout.sideInset * 2 + (limit + 1) * layout.slotWidth) * 3).toBeGreaterThan(3840);
  });
});
