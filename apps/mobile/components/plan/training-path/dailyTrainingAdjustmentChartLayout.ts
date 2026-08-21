export type DailyTrainingAdjustmentChartLayout = {
  bucketCenters: number[];
  chartContentWidth: number;
  firstCenter: number;
  lastCenter: number;
  labelWidth: number;
  labelBandHeight: number;
  labelFontSize: number;
  labelLineHeight: number;
  labelEvery: number;
  markerLabelWidth: number;
  sideInset: number;
  slotWidth: number;
  visualBarWidth: number;
  barGap: number;
  completedBarOffset: number;
  plannedBarOffset: number;
  touchTargetWidth: number;
  selectionHighlightWidth: number;
};

const MIN_TOUCH_TARGET = 44;
const DEFAULT_FONT_SCALE = 1;
const BAR_GAP_RATIO = 0.06;
const BAR_GROUP_WIDTH_RATIO = 0.62;
const MAX_BAR_GROUP_WIDTH = 36;
const MAX_SELECTION_WIDTH_RATIO = 0.74;

const rangeMinimumSlot = {
  daily: 44,
  weekly: 56,
  monthly: 64,
} as const;

const rangeMaximumLabelCharacters = {
  daily: 5,
  weekly: 6,
  monthly: 7,
} as const;

export function buildDailyTrainingAdjustmentChartLayout({
  bucketCount,
  density,
  fontScale = DEFAULT_FONT_SCALE,
  range,
  viewportWidth,
}: {
  bucketCount: number;
  density: "compact" | "standard" | "detail";
  fontScale?: number;
  range: "daily" | "weekly" | "monthly";
  viewportWidth: number;
}): DailyTrainingAdjustmentChartLayout {
  const safeBucketCount = Math.max(1, Math.floor(bucketCount));
  const safeViewportWidth = Math.max(MIN_TOUCH_TARGET, viewportWidth);
  const scaledLabelWidth = Math.ceil(
    rangeMaximumLabelCharacters[range] * 5.2 * Math.max(1, fontScale),
  );
  const densityMinimum = density === "detail" ? 56 : MIN_TOUCH_TARGET;
  const densityFontScale = density === "compact" ? 0.875 : 1;
  const labelFontSize = 8 * densityFontScale * Math.max(1, fontScale);
  const labelLineHeight = Math.ceil(labelFontSize * 1.35);
  const labelBandHeight = labelLineHeight + 8;
  const minimumSlotWidth = Math.max(rangeMinimumSlot[range], densityMinimum, scaledLabelWidth + 8);
  // Spread a short time window across the chart instead of reserving large
  // centering gutters at both ends. Once the window needs to scroll, retain
  // the minimum readable/tappable bucket width.
  const slotWidth = Math.max(minimumSlotWidth, safeViewportWidth / safeBucketCount);
  const sideInset = 0;
  const barGap = Math.max(2, Math.round(slotWidth * BAR_GAP_RATIO));
  const barGroupWidth = Math.min(MAX_BAR_GROUP_WIDTH, slotWidth * BAR_GROUP_WIDTH_RATIO);
  const visualBarWidth = Math.max(4, (barGroupWidth - barGap) / 2);
  const pairWidth = visualBarWidth * 2 + barGap;
  const firstCenter = sideInset + slotWidth / 2;
  const bucketCenters = Array.from(
    { length: safeBucketCount },
    (_, index) => firstCenter + index * slotWidth,
  );

  return {
    bucketCenters,
    chartContentWidth: safeBucketCount * slotWidth,
    firstCenter,
    lastCenter: bucketCenters[bucketCenters.length - 1] ?? firstCenter,
    labelWidth: Math.min(slotWidth - 4, scaledLabelWidth),
    labelBandHeight,
    labelFontSize,
    labelLineHeight,
    labelEvery: Math.max(1, Math.ceil(safeBucketCount / 7)),
    markerLabelWidth: Math.ceil(30 * Math.max(1, fontScale)),
    sideInset,
    slotWidth,
    visualBarWidth,
    barGap,
    completedBarOffset: -pairWidth / 2,
    plannedBarOffset: barGap / 2,
    touchTargetWidth: Math.max(MIN_TOUCH_TARGET, slotWidth),
    selectionHighlightWidth: Math.min(
      slotWidth * MAX_SELECTION_WIDTH_RATIO,
      pairWidth + barGap * 2,
    ),
  };
}

export function getDailyTrainingAdjustmentScrollOffset(
  layout: DailyTrainingAdjustmentChartLayout,
  index: number,
  viewportWidth: number,
) {
  const center =
    layout.bucketCenters[Math.max(0, Math.min(index, layout.bucketCenters.length - 1))];
  const maximumOffset = Math.max(0, layout.chartContentWidth - viewportWidth);
  return Math.max(0, Math.min(maximumOffset, (center ?? layout.firstCenter) - viewportWidth / 2));
}

export function getDailyTrainingAdjustmentNearestIndex(
  layout: DailyTrainingAdjustmentChartLayout,
  offsetX: number,
  viewportWidth: number,
) {
  const viewportCenter = offsetX + viewportWidth / 2;
  const rawIndex = Math.round((viewportCenter - layout.firstCenter) / layout.slotWidth);
  return Math.max(0, Math.min(layout.bucketCenters.length - 1, rawIndex));
}

export function clampChartMarkerLabelX({
  center,
  chartLeft,
  chartRight,
  labelWidth,
}: {
  center: number;
  chartLeft: number;
  chartRight: number;
  labelWidth: number;
}) {
  return Math.max(chartLeft, Math.min(chartRight - labelWidth, center - labelWidth / 2));
}

export function buildDailyTrainingAdjustmentRendererGeometry(
  layout: DailyTrainingAdjustmentChartLayout,
) {
  return layout.bucketCenters.map((center, index) => ({
    index,
    datumX: center,
    labelCenter: center,
    selectionCenter: center,
    todayMarkerCenter: center,
    touchTarget: {
      left: center - layout.touchTargetWidth / 2,
      width: layout.touchTargetWidth,
    },
    selectionHighlight: {
      left: center - layout.selectionHighlightWidth / 2,
      width: layout.selectionHighlightWidth,
    },
    completedBar: {
      left: center + layout.completedBarOffset,
      width: layout.visualBarWidth,
    },
    plannedBar: {
      left: center + layout.plannedBarOffset,
      width: layout.visualBarWidth,
    },
  }));
}

export function getDailyTrainingAdjustmentRendererPointLimit({
  maxPhysicalWidth,
  pixelRatio,
  sideInset,
  slotWidth,
}: {
  maxPhysicalWidth: number;
  pixelRatio: number;
  sideInset: number;
  slotWidth: number;
}) {
  const logicalWidthBudget = Math.max(1, maxPhysicalWidth) / Math.max(1, pixelRatio);
  return Math.max(1, Math.floor((logicalWidthBudget - sideInset * 2) / slotWidth));
}
