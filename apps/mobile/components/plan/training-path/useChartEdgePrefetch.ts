import { useCallback, useRef } from "react";

type EdgePoint = {
  date: string;
};

type ChartEdgePrefetchInput<Point extends EdgePoint> = {
  onScrollNearEnd?: () => void;
  onScrollNearStart?: () => void;
  points: Point[];
  preloadDistance: number;
  scrollableWidth: number;
  viewportWidth: number;
};

export function useChartEdgePrefetch<Point extends EdgePoint>({
  onScrollNearEnd,
  onScrollNearStart,
  points,
  preloadDistance,
  scrollableWidth,
  viewportWidth,
}: ChartEdgePrefetchInput<Point>) {
  const lastEndPrefetchKeyRef = useRef<string | null>(null);
  const lastStartPrefetchKeyRef = useRef<string | null>(null);

  return useCallback(
    (offsetX: number) => {
      const maxOffsetX = Math.max(0, scrollableWidth - viewportWidth);
      if (offsetX <= preloadDistance) {
        const startKey = points[0]?.date ?? null;
        if (startKey && lastStartPrefetchKeyRef.current !== startKey) {
          lastStartPrefetchKeyRef.current = startKey;
          onScrollNearStart?.();
        }
      }
      if (maxOffsetX - offsetX <= preloadDistance) {
        const endKey = points[points.length - 1]?.date ?? null;
        if (endKey && lastEndPrefetchKeyRef.current !== endKey) {
          lastEndPrefetchKeyRef.current = endKey;
          onScrollNearEnd?.();
        }
      }
    },
    [onScrollNearEnd, onScrollNearStart, points, preloadDistance, scrollableWidth, viewportWidth],
  );
}
