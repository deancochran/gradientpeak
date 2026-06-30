import { Text } from "@repo/ui/components/text";
import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { TrainingPathLoadChartSection } from "@/components/plan/training-path/TrainingPathLoadChartSection";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { buildDailyTrainingAdjustmentPointsFromTrainingPathData } from "@/lib/training-path/dailyTrainingPathModel";
import {
  buildTrainingPreferencesLoadTimeline,
  buildTrainingPreferencesProjectionPreview,
  type TrainingPreferencesValues,
} from "@/lib/training-plan-form/projectionPreview";

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

interface TrainingPreferencesProjectionPreviewProps {
  draft: TrainingPreferencesValues;
  planId?: string;
}

export const TrainingPreferencesProjectionPreview = React.memo(
  function TrainingPreferencesProjectionPreview({
    draft,
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

    const previewSnapshot = useMemo(
      () => ({ ...snapshot, plan: snapshot.plan, profileGoals: snapshot.profileGoals }),
      [snapshot.plan, snapshot.profileGoals, snapshot],
    );

    const previewResult = useMemo(() => {
      return buildTrainingPreferencesProjectionPreview({
        draft,
        fitnessHistory,
        snapshot: previewSnapshot,
      });
    }, [draft, fitnessHistory, previewSnapshot]);

    const previewIdealCurve = previewResult.previewIdealCurve;

    const previewLoadTimeline = useMemo(() => {
      return buildTrainingPreferencesLoadTimeline({
        projectionChart: previewResult.projectionChart,
        snapshot,
      });
    }, [previewResult.projectionChart, snapshot.insightTimeline?.timeline, snapshot]);

    const todayKey = toDateKey(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(todayKey);
    const dailyAdjustmentPoints = useMemo(
      () =>
        buildDailyTrainingAdjustmentPointsFromTrainingPathData({
          timeline: previewLoadTimeline,
          fitnessHistory,
          idealFitnessCurve: previewIdealCurve.length > 0 ? previewIdealCurve : idealFitnessCurve,
          startDate: previewLoadTimeline[0]?.date ?? todayKey,
          endDate: previewLoadTimeline[previewLoadTimeline.length - 1]?.date ?? todayKey,
        }),
      [fitnessHistory, idealFitnessCurve, previewIdealCurve, previewLoadTimeline, todayKey],
    );

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
          title: "Daily Training Path",
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
        title: "Daily Training Path",
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

    const chartEmptyState =
      projectionPreviewState.tone === "ready"
        ? undefined
        : {
            body: projectionPreviewState.body,
            title: projectionPreviewState.title,
            tone: projectionPreviewState.tone,
          };

    return (
      <View className="gap-3" testID="training-preferences-load-analysis">
        <Text className="text-sm font-semibold text-foreground">Training Load Preview</Text>
        <TrainingPathLoadChartSection
          chartHeight={96}
          dailyDensity="compact"
          dailyPoints={projectionPreviewState.tone === "ready" ? dailyAdjustmentPoints : undefined}
          dailyTestID="training-preferences-daily-adjustment-chart"
          emptyState={chartEmptyState}
          onSelectedDateChange={setSelectedDate}
          selectedDate={selectedDate}
          selectionMode="day"
          showHeader={false}
          testID="training-preferences-daily-adjustment-chart"
        />
      </View>
    );
  },
);
