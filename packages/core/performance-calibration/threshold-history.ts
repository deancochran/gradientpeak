export type ThresholdHistoryPageItem = {
  thresholdId: string;
  effectiveAt: string;
};

/** Merges overlapping newest-first history pages while retaining the first page's facts. */
export function mergeThresholdHistoryPages<T extends ThresholdHistoryPageItem>(
  ...pages: readonly (readonly T[])[]
): readonly T[] {
  const unique = new Map<string, T>();
  for (const page of pages) {
    // The newest page is authoritative when pagination overlaps at its boundary.
    for (const point of page) {
      if (!unique.has(point.thresholdId)) unique.set(point.thresholdId, point);
    }
  }
  return [...unique.values()].sort(
    (left, right) =>
      Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) ||
      right.thresholdId.localeCompare(left.thresholdId),
  );
}
