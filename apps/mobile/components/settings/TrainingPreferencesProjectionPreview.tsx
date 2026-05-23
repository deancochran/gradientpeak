import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { RotateCcw } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { TrainingPathChart } from "@/components/plan/training-path/TrainingPathChart";
import type { TrainingPathWeekWindow } from "@/components/plan/training-path/trainingPathTypes";
import {
  addDays,
  buildScrollableTrainingPathWindow,
  buildTrainingPathViewModel,
} from "@/components/plan/training-path/trainingPathUtils";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
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
    const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);
    const [weekWindow, setWeekWindow] = useState<TrainingPathWeekWindow | null>(null);
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
      [snapshot.plan, snapshot.profileGoals],
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
    }, [previewResult.projectionChart, snapshot.insightTimeline?.timeline]);

    const todayKey = toDateKey(new Date());
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
    const initialWeekWindow = useMemo(
      () => buildScrollableTrainingPathWindow({ goalMarkers, todayKey }),
      [goalMarkers, todayKey],
    );

    useEffect(() => {
      setWeekWindow(initialWeekWindow);
    }, [initialWeekWindow]);

    const resolvedWeekWindow = weekWindow ?? initialWeekWindow;
    const extendWindowStart = useCallback(() => {
      setWeekWindow((current) => {
        const window = current ?? initialWeekWindow;
        return { ...window, start: addDays(window.start, -56) };
      });
    }, [initialWeekWindow]);

    const extendWindowEnd = useCallback(() => {
      setWeekWindow((current) => {
        const window = current ?? initialWeekWindow;
        return { ...window, end: addDays(window.end, 56) };
      });
    }, [initialWeekWindow]);

    const resetChart = useCallback(() => {
      setWeekWindow(initialWeekWindow);
      setSelectedWeekStart(null);
    }, [initialWeekWindow]);

    const trainingPathModel = useMemo(
      () =>
        buildTrainingPathViewModel({
          timeline: previewLoadTimeline,
          fitnessHistory,
          projectedFitness: [],
          idealFitnessCurve: previewIdealCurve.length > 0 ? previewIdealCurve : idealFitnessCurve,
          goalMarkers,
          selectedWeekStart,
          range: "season",
          weekWindow: resolvedWeekWindow,
          todayKey,
        }),
      [
        fitnessHistory,
        goalMarkers,
        idealFitnessCurve,
        previewIdealCurve,
        previewLoadTimeline,
        resolvedWeekWindow,
        selectedWeekStart,
        todayKey,
      ],
    );

    const fixedDomainModel = useMemo(
      () =>
        buildTrainingPathViewModel({
          timeline: previewLoadTimeline,
          fitnessHistory,
          projectedFitness: [],
          idealFitnessCurve: previewIdealCurve.length > 0 ? previewIdealCurve : idealFitnessCurve,
          goalMarkers,
          selectedWeekStart: null,
          range: "all",
          weekWindow: initialWeekWindow,
          todayKey,
        }),
      [
        fitnessHistory,
        goalMarkers,
        idealFitnessCurve,
        previewIdealCurve,
        previewLoadTimeline,
        initialWeekWindow,
        todayKey,
      ],
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
          title: "Weekly Training Path",
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
        title: "Weekly Training Path",
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
          <Text className="text-sm font-semibold text-foreground">Weekly Training Path</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Reset training path chart"
            activeOpacity={0.85}
            className="h-9 w-9 items-center justify-center rounded-full border border-border bg-background"
            onPress={resetChart}
            testID="training-preferences-chart-reset-button"
          >
            <Icon as={RotateCcw} size={14} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>
        {projectionPreviewState.tone === "ready" ? (
          <TrainingPathChart
            height={300}
            domains={fixedDomainModel.domains}
            model={trainingPathModel}
            onSelectedWeekChange={setSelectedWeekStart}
            onScrollNearEnd={extendWindowEnd}
            onScrollNearStart={extendWindowStart}
            range="season"
            scrollX
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
  },
);
