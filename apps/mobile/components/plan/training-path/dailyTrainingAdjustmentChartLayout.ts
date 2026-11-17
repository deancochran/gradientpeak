import type { PlanTrainingChartRange } from "./trainingPathTypes";

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
  barsOverlap: boolean;
};

export type DailyTrainingAdjustmentChartDensity = "compact" | "standard" | "detail";

const MIN_TOUCH_TARGET = 44;
const DEFAULT_FONT_SCALE = 1;
const BAR_GAP_RATIO = 0.06;
const BAR_GROUP_WIDTH_RATIO = 0.62;
const MAX_BAR_GROUP_WIDTH = 36;

const rangeMinimumSlot = {
  daily: 44,
  weekly: 56,
  monthly: 64,
} as const;

export function getDailyTrainingAdjustmentMinimumSlotWidth({
  density,
  fontScale = DEFAULT_FONT_SCALE,
  range,
}: {
  density: DailyTrainingAdjustmentChartDensity;
  fontScale?: number;
  range: PlanTrainingChartRange;
}) {
  const scaledLabelWidth = Math.ceil(
    rangeMaximumLabelCharacters[range] * 5.2 * Math.max(1, fontScale),
  );
  const densityMinimum = density === "detail" ? 56 : MIN_TOUCH_TARGET;
  return Math.max(rangeMinimumSlot[range], densityMinimum, scaledLabelWidth + 8);
}

const rangeMaximumLabelCharacters = {
  daily: 5,
  weekly: 6,
  monthly: 7,
} as const;

export function buildDailyTrainingAdjustmentChartLayout({
  bucketCount,
  density,
  fitRange = false,
  fontScale = DEFAULT_FONT_SCALE,
  pixelRatio = 1,
  range,
  viewportWidth,
}: {
  bucketCount: number;
  density: DailyTrainingAdjustmentChartDensity;
  fitRange?: boolean;
  fontScale?: number;
  pixelRatio?: number;
  range: PlanTrainingChartRange;
  viewportWidth: number;
}): DailyTrainingAdjustmentChartLayout {
  const safeBucketCount = Math.max(1, Math.floor(bucketCount));
  const safeViewportWidth = Math.max(MIN_TOUCH_TARGET, viewportWidth);
  const scaledLabelWidth = Math.ceil(
    rangeMaximumLabelCharacters[range] * 5.2 * Math.max(1, fontScale),
  );
  const densityFontScale = density === "compact" ? 0.875 : 1;
  const labelFontSize = 8 * densityFontScale * Math.max(1, fontScale);
  const labelLineHeight = Math.ceil(labelFontSize * 1.35);
  const labelBandHeight = labelLineHeight + 8;
  const minimumSlotWidth = getDailyTrainingAdjustmentMinimumSlotWidth({
    density,
    fontScale,
    range,
  });
  // Spread a short time window across the chart instead of reserving large
  // centering gutters at both ends. Once the window needs to scroll, retain
  // the minimum readable/tappable bucket width.
  const slotWidth = fitRange
    ? safeViewportWidth / safeBucketCount
    : Math.max(minimumSlotWidth, safeViewportWidth / safeBucketCount);
  const sideInset = 0;
  const minimumPhysicalWidth = 1 / Math.max(1, pixelRatio);
  const fittedGroupWidth = Math.max(
    minimumPhysicalWidth,
    Math.min(MAX_BAR_GROUP_WIDTH, slotWidth * 0.82),
  );
  const barsOverlap = fitRange && fittedGroupWidth < minimumPhysicalWidth * 3;
  const barGap = fitRange
    ? barsOverlap
      ? 0
      : Math.max(minimumPhysicalWidth, slotWidth * BAR_GAP_RATIO)
    : Math.max(2, Math.round(slotWidth * BAR_GAP_RATIO));
  const barGroupWidth = fitRange
    ? fittedGroupWidth
    : Math.min(MAX_BAR_GROUP_WIDTH, slotWidth * BAR_GROUP_WIDTH_RATIO);
  const visualBarWidth = fitRange
    ? barsOverlap
      ? minimumPhysicalWidth
      : Math.max(minimumPhysicalWidth, (barGroupWidth - barGap) / 2)
    : Math.max(4, (barGroupWidth - barGap) / 2);
  const pairWidth = visualBarWidth * 2 + barGap;
  const firstCenter = sideInset + slotWidth / 2;
  const bucketCenters = Array.from(
    { length: safeBucketCount },
    (_, index) => firstCenter + index * slotWidth,
  );

  return {
    bucketCenters,
    chartContentWidth: fitRange ? safeViewportWidth : safeBucketCount * slotWidth,
    firstCenter,
    lastCenter: bucketCenters[bucketCenters.length - 1] ?? firstCenter,
    labelWidth: fitRange ? scaledLabelWidth : Math.min(slotWidth - 4, scaledLabelWidth),
    labelBandHeight,
    labelFontSize,
    labelLineHeight,
    labelEvery: Math.max(1, Math.ceil(safeBucketCount / 7)),
    markerLabelWidth: Math.ceil(30 * Math.max(1, fontScale)),
    sideInset,
    slotWidth,
    visualBarWidth,
    barGap,
    completedBarOffset: barsOverlap ? -visualBarWidth / 2 : -pairWidth / 2,
    plannedBarOffset: barsOverlap ? -visualBarWidth / 2 : barGap / 2,
    touchTargetWidth: fitRange ? slotWidth : Math.max(MIN_TOUCH_TARGET, slotWidth),
    selectionHighlightWidth: visualBarWidth,
    barsOverlap,
  };
}

export function getDailyTrainingAdjustmentNearestIndexForLocation(
  layout: DailyTrainingAdjustmentChartLayout,
  locationX: number,
) {
  const rawIndex = Math.floor(Math.max(0, locationX) / Math.max(Number.EPSILON, layout.slotWidth));
  return Math.max(0, Math.min(layout.bucketCenters.length - 1, rawIndex));
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
  minimumSlotWidth,
  pixelRatio,
  sideInset,
}: {
  maxPhysicalWidth: number;
  minimumSlotWidth: number;
  pixelRatio: number;
  sideInset: number;
}) {
  const logicalWidthBudget = Math.max(1, maxPhysicalWidth) / Math.max(1, pixelRatio);
  return Math.max(1, Math.floor((logicalWidthBudget - sideInset * 2) / minimumSlotWidth));
}

function axisTicks(domain: [number, number], count: number) {
  const [min, max] = domain;
  if (count <= 1) return [max];
  return Array.from({ length: count }, (_, index) => max - ((max - min) * index) / (count - 1));
}

export function buildDailyTrainingAdjustmentAxisTickLabels(domain: [number, number], count = 5) {
  const ticks = axisTicks(domain, count);
  const step = count > 1 ? Math.abs(domain[1] - domain[0]) / (count - 1) : 1;
  let fractionDigits = step >= 1 ? 0 : Math.min(4, Math.max(1, Math.ceil(-Math.log10(step))));
  let labels = ticks.map((value) => value.toFixed(fractionDigits));
  while (new Set(labels).size !== labels.length && fractionDigits < 4) {
    fractionDigits += 1;
    labels = ticks.map((value) => value.toFixed(fractionDigits));
  }
  const seen = new Set<string>();
  return ticks.flatMap((value, index) => {
    const label = labels[index] ?? String(value);
    if (seen.has(label)) return [];
    seen.add(label);
    return [{ label, value }];
  });
}

export function formatDailyTrainingAdjustmentAxisTick(
  value: number,
  domain: [number, number],
  count = 5,
) {
  const labels = buildDailyTrainingAdjustmentAxisTickLabels(domain, count);
  const sample = labels[0]?.label ?? "0";
  const fractionDigits = sample.includes(".") ? (sample.split(".")[1]?.length ?? 0) : 0;
  return value.toFixed(fractionDigits);
}
