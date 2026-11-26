import { mergeThresholdHistoryPages } from "@repo/core/performance-calibration";
import { useEffect, useRef, useState } from "react";
import type { AppRouter, inferRouterOutputs } from "./client";
import { api } from "./react";

type ThresholdOverview =
  inferRouterOutputs<AppRouter>["athleteIntelligence"]["getThresholdOverview"];
type HistoryCursor = NonNullable<ThresholdOverview["history"]["nextCursor"]>;
type ThresholdHistoryItem = ThresholdOverview["history"]["items"][number];

export function useThresholdHistory() {
  const overviewQuery = api.athleteIntelligence.getThresholdOverview.useQuery({
    historyLimit: 100,
  });
  const overview = overviewQuery.data;
  const sourceKey = `${overview?.publication?.publishedRevision ?? "none"}:${overview?.publication?.computedAt ?? "none"}`;
  const previousSourceKey = useRef(sourceKey);
  const [olderItems, setOlderItems] = useState<readonly ThresholdHistoryItem[]>([]);
  const [hasAcceptedOlderPage, setHasAcceptedOlderPage] = useState(false);
  const [olderNextCursor, setOlderNextCursor] = useState<HistoryCursor | null>(null);
  const [requestedCursor, setRequestedCursor] = useState<HistoryCursor | null>(null);
  const [requestSourceKey, setRequestSourceKey] = useState<string | null>(null);
  const olderQuery = api.athleteIntelligence.getThresholdOverview.useQuery(
    { historyLimit: 100, ...(requestedCursor ? { historyCursor: requestedCursor } : {}) },
    { enabled: requestedCursor !== null },
  );
  useEffect(() => {
    if (previousSourceKey.current === sourceKey) return;
    previousSourceKey.current = sourceKey;
    setOlderItems([]);
    setHasAcceptedOlderPage(false);
    setOlderNextCursor(null);
    setRequestedCursor(null);
    setRequestSourceKey(null);
  }, [sourceKey]);
  useEffect(() => {
    if (!requestedCursor || !olderQuery.data || requestSourceKey !== sourceKey) return;
    const responseSourceKey = `${olderQuery.data.publication?.publishedRevision ?? "none"}:${olderQuery.data.publication?.computedAt ?? "none"}`;
    if (responseSourceKey !== requestSourceKey) {
      setOlderItems([]);
      setHasAcceptedOlderPage(false);
      setOlderNextCursor(null);
      setRequestedCursor(null);
      setRequestSourceKey(null);
      void overviewQuery.refetch();
      return;
    }
    setOlderItems((items) => mergeThresholdHistoryPages(items, olderQuery.data.history.items));
    setHasAcceptedOlderPage(true);
    setOlderNextCursor(olderQuery.data.history.nextCursor);
    setRequestedCursor(null);
  }, [olderQuery.data, overviewQuery.refetch, requestSourceKey, requestedCursor, sourceKey]);
  const historyItems = overview
    ? mergeThresholdHistoryPages(overview.history.items, olderItems)
    : [];
  const nextHistoryCursor = hasAcceptedOlderPage
    ? olderNextCursor
    : (overview?.history.nextCursor ?? null);
  const loadEarlier = () => {
    if (!nextHistoryCursor) return;
    setRequestSourceKey(sourceKey);
    setRequestedCursor(nextHistoryCursor);
  };

  return {
    historyItems,
    loadEarlier,
    nextHistoryCursor,
    olderQuery,
    overview,
    overviewQuery,
    requestedCursor,
  };
}
