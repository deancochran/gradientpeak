import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { TrainingPathChart } from "@/components/plan/training-path/TrainingPathChart";
import { buildTrainingPathViewModel } from "@/components/plan/training-path/trainingPathUtils";
import { useScrollableTrainingPathWindow } from "@/components/plan/training-path/useScrollableTrainingPathWindow";
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
    const trainingPathWindow = useScrollableTrainingPathWindow({ goalMarkers, todayKey });

    const trainingPathModel = useMemo(
      () =>
        buildTrainingPathViewModel({
          timeline: previewLoadTimeline,
          fitnessHistory,
          projectedFitness: [],
          idealFitnessCurve: previewIdealCurve.length > 0 ? previewIdealCurve : idealFitnessCurve,
          goalMarkers,
          selectedWeekStart: null,
          range: "season",
          weekWindow: trainingPathWindow.resolvedWeekWindow,
          todayKey,
        }),
      [
        fitnessHistory,
        goalMarkers,
        idealFitnessCurve,
        previewIdealCurve,
        previewLoadTimeline,
        trainingPathWindow.resolvedWeekWindow,
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
          weekWindow: trainingPathWindow.initialWeekWindow,
          todayKey,
        }),
      [
        fitnessHistory,
        goalMarkers,
        idealFitnessCurve,
        previewIdealCurve,
        previewLoadTimeline,
        trainingPathWindow.initialWeekWindow,
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
        <Text className="text-sm font-semibold text-foreground">Training Load Preview</Text>
        {projectionPreviewState.tone === "ready" ? (
          <TrainingPathChart
            height={300}
            domains={fixedDomainModel.domains}
            model={trainingPathModel}
            onScrollNearEnd={trainingPathWindow.extendWindowEnd}
            onScrollNearStart={trainingPathWindow.extendWindowStart}
            range="season"
            reviewWeeks={false}
            scrollX
            showCompletedLoad={false}
            showPlannedLoad={false}
            showScheduledFitness={false}
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
