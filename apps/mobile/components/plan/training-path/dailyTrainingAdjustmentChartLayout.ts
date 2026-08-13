export type DailyTrainingAdjustmentChartLayout = {
  bucketCenters: number[];
  chartContentWidth: number;
  firstCenter: number;
  lastCenter: number;
  labelWidth: number;
  labelBandHeight: number;
  labelFontSize: number;
  labelLineHeight: number;
  markerLabelWidth: number;
  sideInset: number;
  slotWidth: number;
  visualBarWidth: number;
  barGap: number;
  completedBarOffset: number;
  plannedBarOffset: number;
  touchTargetWidth: number;
};

const MIN_TOUCH_TARGET = 44;
const DEFAULT_FONT_SCALE = 1;
const BAR_GAP = 2;

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
  const densityMinimum = density === "compact" ? 44 : density === "detail" ? 56 : 48;
  const labelFontSize = 8 * Math.max(1, fontScale);
  const labelLineHeight = Math.ceil(labelFontSize * 1.35);
  const labelBandHeight = labelLineHeight + 8;
  const slotWidth = Math.max(rangeMinimumSlot[range], densityMinimum, scaledLabelWidth + 8);
  const sideInset = Math.max(0, safeViewportWidth / 2 - slotWidth / 2);
  const visualBarWidth = Math.max(6, Math.min(30, (slotWidth - BAR_GAP - 8) / 2));
  const pairWidth = visualBarWidth * 2 + BAR_GAP;
  const firstCenter = sideInset + slotWidth / 2;
  const bucketCenters = Array.from(
    { length: safeBucketCount },
    (_, index) => firstCenter + index * slotWidth,
  );

  return {
    bucketCenters,
    chartContentWidth: sideInset * 2 + safeBucketCount * slotWidth,
    firstCenter,
    lastCenter: bucketCenters[bucketCenters.length - 1] ?? firstCenter,
    labelWidth: Math.min(slotWidth - 4, scaledLabelWidth),
    labelBandHeight,
    labelFontSize,
    labelLineHeight,
    markerLabelWidth: Math.ceil(30 * Math.max(1, fontScale)),
    sideInset,
    slotWidth,
    visualBarWidth,
    barGap: BAR_GAP,
    completedBarOffset: -pairWidth / 2,
    plannedBarOffset: BAR_GAP / 2,
    touchTargetWidth: Math.max(MIN_TOUCH_TARGET, slotWidth),
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
