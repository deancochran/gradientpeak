import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import {
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
  type TrainingPreferencesValues,
} from "@/lib/training-plan-form/projectionPreview";

type LoadDateRange = "30d" | "60d" | "90d" | "all";

const loadDateRanges: { label: string; value: LoadDateRange }[] = [
  { label: "30d", value: "30d" },
  { label: "60d", value: "60d" },
  { label: "90d", value: "90d" },
  { label: "All", value: "all" },
];

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function getDateRangeStartKey(dateRange: LoadDateRange, referenceDateKey?: string | null) {
  if (dateRange === "all" || !referenceDateKey) return null;
  const parsed = new Date(`${referenceDateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setDate(parsed.getDate() - 30);
  return toDateKey(parsed);
}

function getDateRangeEndKey(dateRange: LoadDateRange, referenceDateKey?: string | null) {
  if (dateRange === "all" || !referenceDateKey) return null;
  const parsed = new Date(`${referenceDateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const days = dateRange === "30d" ? 30 : dateRange === "60d" ? 60 : 90;
  parsed.setDate(parsed.getDate() + days);
  return toDateKey(parsed);
}

function filterByDateRange<T>(
  items: T[],
  dateRange: LoadDateRange,
  referenceDateKey: string | null | undefined,
  getItemDate: (item: T) => string | null | undefined,
) {
  const startKey = getDateRangeStartKey(dateRange, referenceDateKey);
  const endKey = getDateRangeEndKey(dateRange, referenceDateKey);
  if (!startKey || !endKey) return items;
  return items.filter((item) => {
    const itemDate = getItemDate(item);
    return !!itemDate && itemDate >= startKey && itemDate <= endKey;
  });
}

interface TrainingPreferencesProjectionPreviewProps {
  draft: TrainingPreferencesValues;
  loadDateRange?: LoadDateRange;
  onLoadDateRangeChange?: (dateRange: LoadDateRange) => void;
  planId?: string;
}

export function TrainingPreferencesProjectionPreview({
  draft,
  loadDateRange = "90d",
  onLoadDateRangeChange,
  planId,
}: TrainingPreferencesProjectionPreviewProps) {
  const snapshot = useTrainingPlanSnapshot({
    includeStatus: false,
    includeWeeklySummaries: false,
    planId,
    curveWindow: "overview",
  });

  const fitnessHistory = useMemo(
    () => snapshot.actualCurveData?.dataPoints ?? [],
    [snapshot.actualCurveData?.dataPoints],
  );

  const idealFitnessCurve = useMemo(
    () => snapshot.idealCurveData?.dataPoints ?? [],
    [snapshot.idealCurveData?.dataPoints],
  );

  const previewResult = useMemo(() => {
    return buildTrainingPreferencesProjectionPreview({ draft, fitnessHistory, snapshot });
  }, [draft, fitnessHistory, snapshot]);

  const previewIdealCurve = previewResult.previewIdealCurve;

  const previewLoadTimeline = useMemo(() => {
    return buildTrainingPreferencesLoadTimeline({
      projectionChart: previewResult.projectionChart,
      snapshot,
    });
  }, [previewResult.projectionChart, snapshot.insightTimeline?.timeline]);

  const loadRangeReferenceKey = toDateKey(new Date());
  const rangedPreviewLoadTimeline = filterByDateRange(
    previewLoadTimeline,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const rangedFitnessHistory = filterByDateRange(
    fitnessHistory,
    loadDateRange,
    loadRangeReferenceKey,
    (point) => point.date,
  );
  const goalMarkers = useMemo(() => {
    const projectionMarkers = previewResult.projectionChart?.goal_markers ?? [];
    if (projectionMarkers.length > 0) {
      return projectionMarkers.map((marker) => ({
        id: marker.id,
        targetDate: marker.target_date,
        label: marker.name,
      }));
    }

    return snapshot.profileGoals
      .filter((goal): goal is typeof goal & { target_date: string } => !!goal.target_date)
      .map((goal) => ({
        id: goal.id,
        targetDate: goal.target_date,
        label: goal.title,
      }));
  }, [previewResult.projectionChart?.goal_markers, snapshot.profileGoals]);

  const goalMetrics = useMemo(() => {
    if (!snapshot.idealCurveData?.targetCTL || !snapshot.idealCurveData?.targetDate) {
      return null;
    }

    return {
      targetCTL: snapshot.idealCurveData.targetCTL,
      targetDate: snapshot.idealCurveData.targetDate,
      description: `Target: ${snapshot.idealCurveData.targetCTL} CTL by ${new Date(snapshot.idealCurveData.targetDate).toLocaleDateString()}`,
    };
  }, [snapshot.idealCurveData]);

  const projectionPreviewState = useMemo(() => {
    if (snapshot.loading.plan || snapshot.loading.actualCurve || snapshot.loading.idealCurve) {
      return {
        tone: "loading" as const,
        title: "Loading load analysis",
        body: "Loading current training context.",
      };
    }

    if (snapshot.errors.idealCurve) {
      return {
        tone: "unavailable" as const,
        title: "Chart unavailable",
        body: "Chart data is unavailable right now.",
      };
    }

    if (snapshot.profileGoals.length === 0) {
      return {
        tone: "empty" as const,
        title: "Goal data required",
        body: "Add a dated target goal to view load analysis.",
      };
    }

    if (idealFitnessCurve.length < 2) {
      return {
        tone: "ready" as const,
        title: "Weekly training load (TSS)",
        body: "",
      };
    }

    if (previewIdealCurve.length < 2) {
      return {
        tone: "unavailable" as const,
        title: "Chart unavailable",
        body: "Chart data is unavailable right now.",
      };
    }

    return {
      tone: "ready" as const,
      title: "Weekly training load (TSS)",
      body: "",
    };
  }, [
    idealFitnessCurve.length,
    previewIdealCurve.length,
    snapshot.loading.actualCurve,
    snapshot.errors.idealCurve,
    snapshot.loading.idealCurve,
    snapshot.loading.plan,
    snapshot.profileGoals.length,
  ]);

  return (
    <View className="gap-3" testID="training-preferences-load-analysis">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-sm font-semibold text-foreground">Weekly training load (TSS)</Text>
        <View
          className="flex-row rounded-full border border-border bg-card p-0.5"
          testID="training-preferences-load-range-selector"
        >
          {loadDateRanges.map((range) => {
            const isSelected = loadDateRange === range.value;
            return (
              <Pressable
                key={range.value}
                accessibilityRole="button"
                className={`rounded-full px-2 py-1 ${isSelected ? "bg-primary" : "bg-transparent"}`}
                onPress={() => onLoadDateRangeChange?.(range.value)}
                testID={`training-preferences-load-range-${range.value}`}
              >
                <Text
                  className={`text-[10px] font-semibold ${
                    isSelected ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {range.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {projectionPreviewState.tone === "ready" ? (
        <PlanVsActualChart
          timeline={rangedPreviewLoadTimeline}
          actualData={rangedFitnessHistory}
          projectedData={[]}
          idealData={[]}
          goalMarkers={goalMarkers}
          goalMetrics={idealFitnessCurve.length >= 2 ? goalMetrics : null}
          height={260}
          showLegend
        />
      ) : (
        <View className="gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-5">
          {projectionPreviewState.tone === "loading" ? <ActivityIndicator size="small" /> : null}
          <Text className="text-sm font-semibold text-foreground">
            {projectionPreviewState.title}
          </Text>
        </View>
      )}
    </View>
  );
}
