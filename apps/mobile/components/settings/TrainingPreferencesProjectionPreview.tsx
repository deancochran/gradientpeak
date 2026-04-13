import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { api } from "@/lib/api";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";

type TrainingPreferencesValues =
  | import("@repo/core/schemas/settings/profile_settings").AthleteTrainingSettings
  | import("@repo/core/schemas/settings/profile_settings").AthleteTrainingSettingsFormInput;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deriveProjectionPreview(
  baseCurve: Array<{ date: string; ctl: number }>,
  draft: TrainingPreferencesValues,
) {
  if (baseCurve.length < 2) {
    return baseCurve;
  }

  const progressionFactor = (draft.training_style.progression_pace - 0.5) * 0.8;
  const recoveryFactor = (draft.recovery_preferences.recovery_priority - 0.5) * 0.6;
  const sessionRange =
    (draft.dose_limits.max_sessions_per_week ?? 7) - (draft.dose_limits.min_sessions_per_week ?? 0);
  const sessionFactor = (sessionRange - 4) / 20;
  const durationFactor =
    ((draft.dose_limits.max_single_session_duration_minutes ?? 180) - 180) / 420;

  const growthFactor = clamp(
    1 + progressionFactor - recoveryFactor + sessionFactor * 0.2 + durationFactor * 0.2,
    0.6,
    1.5,
  );
  const variabilityAmplitude = (draft.training_style.week_pattern_preference - 0.5) * 0.35;

  const preview = [baseCurve[0]!];

  for (let index = 1; index < baseCurve.length; index += 1) {
    const previousBase = baseCurve[index - 1]!;
    const currentBase = baseCurve[index]!;
    const previousPreview = preview[index - 1]!;
    const baseDelta = currentBase.ctl - previousBase.ctl;
    const wave = 1 + variabilityAmplitude * Math.sin(index * 0.75);
    const adjustedDelta = baseDelta * growthFactor * wave;

    preview.push({
      date: currentBase.date,
      ctl: Math.round((previousPreview.ctl + adjustedDelta) * 10) / 10,
    });
  }

  return preview;
}

interface TrainingPreferencesProjectionPreviewProps {
  draft: TrainingPreferencesValues;
}

export function TrainingPreferencesProjectionPreview({
  draft,
}: TrainingPreferencesProjectionPreviewProps) {
  const activePlanQuery = api.trainingPlans.getActivePlan.useQuery();
  const activePlan = activePlanQuery.data;
  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeStatus: false,
    includeWeeklySummaries: false,
  });

  const fitnessHistory = useMemo(
    () => snapshot.actualCurveData?.dataPoints ?? [],
    [snapshot.actualCurveData?.dataPoints],
  );

  const idealFitnessCurve = useMemo(
    () => snapshot.idealCurveData?.dataPoints ?? [],
    [snapshot.idealCurveData?.dataPoints],
  );

  const previewIdealCurve = useMemo(
    () => deriveProjectionPreview(idealFitnessCurve, draft),
    [idealFitnessCurve, draft],
  );

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

  const projectionPreviewSummary = useMemo(() => {
    if (idealFitnessCurve.length < 2 || previewIdealCurve.length < 2) {
      return "Make changes here to compare the current baseline against this draft once the plan has enough projection data.";
    }

    const baselinePoint = idealFitnessCurve[idealFitnessCurve.length - 1];
    const draftPoint = previewIdealCurve[previewIdealCurve.length - 1];
    if (!baselinePoint || !draftPoint) {
      return "Projection preview unavailable.";
    }

    const delta = Math.round((draftPoint.ctl - baselinePoint.ctl) * 10) / 10;
    const sign = delta > 0 ? "+" : "";
    return `Draft vs baseline at the latest checkpoint: ${sign}${delta} CTL.`;
  }, [idealFitnessCurve, previewIdealCurve]);

  const projectionPreviewState = useMemo(() => {
    if (activePlanQuery.isLoading || snapshot.loading.plan || snapshot.loading.idealCurve) {
      return {
        tone: "loading" as const,
        title: "Loading projection preview",
        body: "Pulling your active plan and baseline curve so this screen can compare today's settings with a draft.",
      };
    }

    if (!activePlan?.id) {
      return {
        tone: "empty" as const,
        title: "Preview unavailable",
        body: "Start or activate a training plan to generate a baseline curve for this preview.",
      };
    }

    if (snapshot.errors.idealCurve) {
      return {
        tone: "unavailable" as const,
        title: "Preview unavailable",
        body: "The baseline projection could not be loaded right now. Try again after refreshing the active plan.",
      };
    }

    if (idealFitnessCurve.length < 2) {
      return {
        tone: "empty" as const,
        title: "Baseline curve not ready",
        body:
          snapshot.profileGoals.length > 0
            ? "This active plan does not have enough ideal-curve checkpoints yet to show a baseline-vs-draft comparison."
            : "Add a goal with a target date to give the active plan enough information for a projection preview.",
      };
    }

    return {
      tone: "ready" as const,
      title: "Baseline vs draft preview",
      body:
        fitnessHistory.length > 0
          ? "Recommended shows the current baseline, Planned shows this draft, and Completed shows your recent training when available."
          : "Recommended shows the current baseline and Planned shows this draft. Completed training will appear here after local history syncs in.",
    };
  }, [
    activePlan?.id,
    activePlanQuery.isLoading,
    fitnessHistory.length,
    idealFitnessCurve.length,
    snapshot.errors.idealCurve,
    snapshot.loading.idealCurve,
    snapshot.loading.plan,
    snapshot.profileGoals.length,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projection Preview</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {projectionPreviewState.tone === "ready" ? (
          <PlanVsActualChart
            actualData={fitnessHistory}
            projectedData={previewIdealCurve}
            idealData={idealFitnessCurve}
            goalMetrics={goalMetrics}
            height={220}
            showLegend
          />
        ) : (
          <View className="gap-2 rounded-md border border-dashed border-border bg-muted/20 px-4 py-5">
            {projectionPreviewState.tone === "loading" ? <ActivityIndicator size="small" /> : null}
            <Text className="text-sm font-semibold text-foreground">
              {projectionPreviewState.title}
            </Text>
            <Text className="text-sm text-muted-foreground">{projectionPreviewState.body}</Text>
          </View>
        )}
        <Text className="text-sm font-medium text-foreground">{projectionPreviewState.title}</Text>
        <Text className="text-sm text-muted-foreground">
          {projectionPreviewState.tone === "ready"
            ? projectionPreviewSummary
            : projectionPreviewState.body}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Progression pace changes how fast training builds. Target surplus is separate and only
          nudges scoring past your stated goal when the model has enough support.
        </Text>
      </CardContent>
    </Card>
  );
}
