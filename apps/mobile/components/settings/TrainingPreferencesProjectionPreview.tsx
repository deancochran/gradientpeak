import { canonicalizeMinimalTrainingPlanCreate } from "@repo/core/plan/canonicalization";
import type { PreviewReadinessSnapshot } from "@repo/core/plan/trainingPlanPreview";
import { athleteTrainingSettingsFormSchema } from "@repo/core/schemas/settings/profile_settings";
import type { GoalTargetV2 } from "@repo/core/schemas/training_plan_structure";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { ActivityIndicator, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { api } from "@/lib/api";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { computeLocalCreationPreview } from "@/lib/training-plan-form/localPreview";

type TrainingPreferencesValues =
  | import("@repo/core/schemas/settings/profile_settings").AthleteTrainingSettings
  | import("@repo/core/schemas/settings/profile_settings").AthleteTrainingSettingsFormInput;

function toDateKey(value: Date) {
  return value.toISOString().split("T")[0] ?? "";
}

function toPreviewMinimalPlan(snapshot: ReturnType<typeof useTrainingPlanSnapshot>) {
  const datedGoals = snapshot.profileGoals
    .filter(
      (goal): goal is typeof goal & { target_date: string } =>
        typeof goal.target_date === "string" && goal.target_date.length > 0,
    )
    .flatMap((goal) => {
      const targets = toGoalTargets(goal);
      if (targets.length === 0) {
        return [];
      }

      return [
        {
          name: goal.title,
          target_date: goal.target_date,
          priority: goal.priority,
          targets,
        },
      ];
    });

  if (datedGoals.length === 0) {
    return null;
  }

  const planStartDate =
    snapshot.actualCurveData?.dataPoints?.[0]?.date ??
    snapshot.plan?.created_at?.slice(0, 10) ??
    toDateKey(new Date());

  return canonicalizeMinimalTrainingPlanCreate({
    goals: datedGoals,
    plan_start_date: planStartDate,
  });
}

function toGoalTargets(
  goal: ReturnType<typeof useTrainingPlanSnapshot>["profileGoals"][number],
): GoalTargetV2[] {
  const objective = goal.objective;
  switch (objective.type) {
    case "event_performance": {
      if (typeof objective.distance_m !== "number") {
        return [];
      }

      const targetTime =
        typeof objective.target_time_s === "number"
          ? objective.target_time_s
          : typeof objective.target_speed_mps === "number" && objective.target_speed_mps > 0
            ? Math.round(objective.distance_m / objective.target_speed_mps)
            : null;

      if (targetTime === null) {
        return [];
      }

      return [
        {
          target_type: "race_performance",
          distance_m: objective.distance_m,
          target_time_s: targetTime,
          activity_category: objective.activity_category,
        },
      ];
    }
    case "threshold": {
      switch (objective.metric) {
        case "pace":
          return objective.activity_category
            ? [
                {
                  target_type: "pace_threshold",
                  target_speed_mps: objective.value,
                  test_duration_s: objective.test_duration_s ?? 1200,
                  activity_category: objective.activity_category,
                },
              ]
            : [];
        case "power":
          return objective.activity_category
            ? [
                {
                  target_type: "power_threshold",
                  target_watts: objective.value,
                  test_duration_s: objective.test_duration_s ?? 1200,
                  activity_category: objective.activity_category,
                },
              ]
            : [];
        case "hr":
          return [{ target_type: "hr_threshold", target_lthr_bpm: objective.value }];
      }
    }
    default:
      return [];
  }
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

  const previewResult = useMemo(() => {
    const minimalPlan = toPreviewMinimalPlan(snapshot);
    if (!minimalPlan) {
      return { previewIdealCurve: [], previewSnapshot: null as PreviewReadinessSnapshot | null };
    }

    const lastActualPoint = fitnessHistory[fitnessHistory.length - 1] ?? null;
    const parsedDraft = athleteTrainingSettingsFormSchema.safeParse(draft);
    if (!parsedDraft.success) {
      return { previewIdealCurve: [], previewSnapshot: null as PreviewReadinessSnapshot | null };
    }

    const resolvedDraft = parsedDraft.data;
    const startingCtl =
      resolvedDraft.baseline_fitness?.is_enabled &&
      typeof resolvedDraft.baseline_fitness.override_ctl === "number"
        ? resolvedDraft.baseline_fitness.override_ctl
        : lastActualPoint?.ctl;
    const startingAtl =
      resolvedDraft.baseline_fitness?.is_enabled &&
      typeof resolvedDraft.baseline_fitness.override_atl === "number"
        ? resolvedDraft.baseline_fitness.override_atl
        : undefined;

    try {
      const preview = computeLocalCreationPreview({
        minimalPlan,
        creationInput: {},
        profileSettings: resolvedDraft,
        profileGoals: snapshot.profileGoals,
        startingCtlOverride: startingCtl,
        startingAtlOverride: startingAtl,
      });

      return {
        previewIdealCurve:
          preview.projectionChart.display_points?.map((point) => ({
            date: point.date,
            ctl: point.predicted_fitness_ctl,
          })) ?? [],
        previewSnapshot: preview.previewSnapshotBaseline,
      };
    } catch {
      return { previewIdealCurve: [], previewSnapshot: null as PreviewReadinessSnapshot | null };
    }
  }, [draft, fitnessHistory, snapshot]);

  const previewIdealCurve = previewResult.previewIdealCurve;

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
        body: "Pulling your active plan and deterministic draft preview so this screen can compare today's settings with the current baseline.",
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

    if (snapshot.profileGoals.length === 0) {
      return {
        tone: "empty" as const,
        title: "Goal data required",
        body: "Add a dated goal with a target to preview how these preferences change the planner output.",
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

    if (previewIdealCurve.length < 2) {
      return {
        tone: "unavailable" as const,
        title: "Preview unavailable",
        body: "The deterministic draft preview could not be computed for the current plan context.",
      };
    }

    return {
      tone: "ready" as const,
      title: "Baseline vs draft preview",
      body:
        fitnessHistory.length > 0
          ? "Recommended shows the current baseline, Planned shows the deterministic draft preview, and Completed shows your recent training when available."
          : "Recommended shows the current baseline and Planned shows the deterministic draft preview. Completed training will appear here after local history syncs in.",
    };
  }, [
    activePlan?.id,
    activePlanQuery.isLoading,
    fitnessHistory.length,
    idealFitnessCurve.length,
    previewIdealCurve.length,
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
          This draft line is recomputed locally with the shared projection engine for your current
          goal context instead of being estimated from a chart-only heuristic.
        </Text>
        {previewResult.previewSnapshot ? (
          <Text className="text-xs text-muted-foreground">
            Draft readiness: {Math.round(previewResult.previewSnapshot.readiness_score)}. Load:{" "}
            {Math.round(previewResult.previewSnapshot.predicted_load_tss)} TSS.
          </Text>
        ) : null}
      </CardContent>
    </Card>
  );
}
