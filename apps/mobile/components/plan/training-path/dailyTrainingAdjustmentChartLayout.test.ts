import { describe, expect, it } from "vitest";

import {
  buildDailyTrainingAdjustmentChartLayout,
  buildDailyTrainingAdjustmentRendererGeometry,
  clampChartMarkerLabelX,
  getDailyTrainingAdjustmentNearestIndex,
  getDailyTrainingAdjustmentScrollOffset,
} from "./dailyTrainingAdjustmentChartLayout";

describe("daily training adjustment chart layout", () => {
  for (const range of ["daily", "weekly", "monthly"] as const) {
    for (const bucketCount of [1, 2, 3, 48]) {
      it(`aligns ${bucketCount} ${range} buckets from one chronological LTR model`, () => {
        const layout = buildDailyTrainingAdjustmentChartLayout({
          bucketCount,
          density: "standard",
          fontScale: 1.6,
          range,
          viewportWidth: 320,
        });

        expect(layout.bucketCenters).toHaveLength(bucketCount);
        for (const [index, center] of layout.bucketCenters.entries()) {
          const completedCenter = center + layout.completedBarOffset + layout.visualBarWidth / 2;
          const plannedCenter = center + layout.plannedBarOffset + layout.visualBarWidth / 2;
          const pairCenter = (completedCenter + plannedCenter) / 2;
          expect(pairCenter).toBeCloseTo(center, 10);
          expect(completedCenter + layout.visualBarWidth / 2).toBeLessThanOrEqual(
            plannedCenter - layout.visualBarWidth / 2,
          );
          expect(
            getDailyTrainingAdjustmentNearestIndex(
              layout,
              getDailyTrainingAdjustmentScrollOffset(layout, index, 320),
              320,
            ),
          ).toBe(index);
          if (index > 0) expect(center).toBeGreaterThan(layout.bucketCenters[index - 1] as number);
        }
        expect(layout.touchTargetWidth).toBeGreaterThanOrEqual(44);
        expect(layout.labelWidth).toBeLessThanOrEqual(layout.slotWidth);
        expect(layout.labelBandHeight).toBeGreaterThanOrEqual(layout.labelLineHeight + 8);
        expect(layout.labelLineHeight).toBeGreaterThanOrEqual(layout.labelFontSize);
        expect(layout.markerLabelWidth).toBeGreaterThanOrEqual(48);
        expect(layout.visualBarWidth * 2 + layout.barGap).toBeGreaterThanOrEqual(layout.labelWidth);
      });
    }
  }

  it("centers both edge buckets and clamps a right-edge marker label", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 8,
      density: "standard",
      range: "daily",
      viewportWidth: 240,
    });
    expect(getDailyTrainingAdjustmentScrollOffset(layout, 0, 240)).toBe(0);
    expect(getDailyTrainingAdjustmentScrollOffset(layout, 7, 240)).toBe(
      layout.chartContentWidth - 240,
    );
    expect(
      clampChartMarkerLabelX({ center: 238, chartLeft: 8, chartRight: 240, labelWidth: 30 }),
    ).toBe(210);
  });

  it("maps renderer data, bars, labels, touch, selection, and Today to one center", () => {
    const layout = buildDailyTrainingAdjustmentChartLayout({
      bucketCount: 3,
      density: "standard",
      range: "weekly",
      viewportWidth: 240,
    });
    const geometry = buildDailyTrainingAdjustmentRendererGeometry(layout);

    for (const bucket of geometry) {
      expect(bucket.datumX).toBe(bucket.labelCenter);
      expect(bucket.datumX).toBe(bucket.selectionCenter);
      expect(bucket.datumX).toBe(bucket.todayMarkerCenter);
      expect(bucket.touchTarget.left + bucket.touchTarget.width / 2).toBe(bucket.datumX);
      const pairRight = bucket.plannedBar.left + bucket.plannedBar.width;
      expect((bucket.completedBar.left + pairRight) / 2).toBe(bucket.datumX);
      expect(bucket.completedBar.left + bucket.completedBar.width).toBeLessThanOrEqual(
        bucket.plannedBar.left,
      );
    }
  });
});
