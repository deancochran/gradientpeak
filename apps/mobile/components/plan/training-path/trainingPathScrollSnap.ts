export function clampWeekIndex(index: number, weekCount: number) {
  if (weekCount <= 0) return 0;
  return Math.max(0, Math.min(weekCount - 1, index));
}

export function getCenteredWeekIndex(offsetX: number, weekWidth: number, weekCount: number) {
  if (weekWidth <= 0) return 0;
  return clampWeekIndex(Math.round(offsetX / weekWidth), weekCount);
}

export function getWeekScrollOffset(index: number, weekWidth: number) {
  return Math.max(0, index * weekWidth);
}

export function getChartSideInset(viewportWidth: number, chartLeftPadding: number) {
  return Math.max(0, viewportWidth / 2 - chartLeftPadding);
}
