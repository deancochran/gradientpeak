import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { IntegerStepper } from "@/components/training-plan/create/inputs/IntegerStepper";
import { PercentSliderInput } from "@/components/training-plan/create/inputs/PercentSliderInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import type { AthleteTrainingSettings } from "@repo/core";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

type PreferencesTabKey =
  | "schedule"
  | "training-style"
  | "recovery"
  | "goal-strategy";

const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "schedule", label: "Schedule" },
  { key: "training-style", label: "Training style" },
  { key: "recovery", label: "Recovery" },
  { key: "goal-strategy", label: "Goal strategy" },
];

function toFractionFromPercent(value: number, decimals = 2) {
  return Number((value / 100).toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deriveProjectionPreview(
  baseCurve: Array<{ date: string; ctl: number }>,
  draft: AthleteTrainingSettings,
) {
  if (baseCurve.length < 2) {
    return baseCurve;
  }

  const progressionFactor = (draft.training_style.progression_pace - 0.5) * 0.8;
  const recoveryFactor =
    (draft.recovery_preferences.recovery_priority - 0.5) * 0.6;
  const sessionRange =
    (draft.dose_limits.max_sessions_per_week ?? 7) -
    (draft.dose_limits.min_sessions_per_week ?? 0);
  const sessionFactor = (sessionRange - 4) / 20;
  const durationFactor =
    ((draft.dose_limits.max_single_session_duration_minutes ?? 180) - 180) /
    420;

  const growthFactor = clamp(
    1 +
      progressionFactor -
      recoveryFactor +
      sessionFactor * 0.2 +
      durationFactor * 0.2,
    0.6,
    1.5,
  );
  const variabilityAmplitude =
    (draft.training_style.week_pattern_preference - 0.5) * 0.35;

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

export default function TrainingPreferencesScreen() {
  const utils = trpc.useUtils();
  const { data: activePlan } = trpc.trainingPlans.getActivePlan.useQuery();
  const settingsQuery = useProfileSettings();
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("schedule");
  const [draft, setDraft] = useState<AthleteTrainingSettings>(
    settingsQuery.settings,
  );
  const snapshot = useTrainingPlanSnapshot({
    planId: activePlan?.id,
    includeWeeklySummaries: false,
  });

  useEffect(() => {
    setDraft(settingsQuery.settings);
  }, [settingsQuery.settings]);

  const upsertMutation = trpc.profileSettings.upsert.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.profileSettings.getForProfile.invalidate(),
        settingsQuery.refetch(),
      ]);
    },
  });

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settingsQuery.settings),
    [draft, settingsQuery.settings],
  );

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

  const previewProjectedFitness = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return previewIdealCurve.filter(
      (point) => typeof point.date === "string" && point.date > today,
    );
  }, [previewIdealCurve]);

  const goalMetrics = useMemo(() => {
    if (
      !snapshot.idealCurveData?.targetCTL ||
      !snapshot.idealCurveData?.targetDate
    ) {
      return null;
    }

    return {
      targetCTL: snapshot.idealCurveData.targetCTL,
      targetDate: snapshot.idealCurveData.targetDate,
      description: `Target: ${snapshot.idealCurveData.targetCTL} CTL by ${new Date(snapshot.idealCurveData.targetDate).toLocaleDateString()}`,
    };
  }, [snapshot.idealCurveData]);

  const projectionPreviewSummary = useMemo(() => {
    if (previewIdealCurve.length < 2) {
      return "Adjust your schedule, style, recovery, or goal strategy to preview how projection support can shift.";
    }

    const firstPoint = previewIdealCurve[0];
    const lastPoint = previewIdealCurve[previewIdealCurve.length - 1];
    if (!firstPoint || !lastPoint) {
      return "Projection preview unavailable.";
    }

    const delta = Math.round((lastPoint.ctl - firstPoint.ctl) * 10) / 10;
    const sign = delta > 0 ? "+" : "";
    return `Draft projection shift: ${sign}${delta} CTL across ${previewIdealCurve.length} checkpoints.`;
  }, [previewIdealCurve]);

  const savePreferences = () => {
    if (!settingsQuery.profileId) {
      return;
    }

    upsertMutation.mutate({
      profile_id: settingsQuery.profileId,
      settings: draft,
    });
  };

  if (settingsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-sm text-muted-foreground">
          Loading preferences...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1" contentContainerClassName="p-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Projection Preview</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <PlanVsActualChart
              actualData={fitnessHistory}
              projectedData={previewProjectedFitness}
              idealData={previewIdealCurve}
              goalMetrics={goalMetrics}
              height={220}
              showLegend
            />
            <Text className="text-sm text-muted-foreground">
              {projectionPreviewSummary}
            </Text>
            <Text className="text-xs text-muted-foreground">
              Progression pace changes how fast training builds. Target surplus
              is separate and only nudges scoring beyond your stated goal when
              the model has enough support.
            </Text>
          </CardContent>
        </Card>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-2"
          accessibilityRole="tablist"
          accessibilityLabel="Training preference groups"
        >
          {preferenceTabs.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                className={`border-b-2 px-1.5 py-2 ${isActive ? "border-primary" : "border-transparent"}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  className={`text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Card>
          <CardContent className="gap-5">
            {activeTab === "schedule" ? (
              <>
                <Text className="text-xs text-muted-foreground">
                  Shape when and how much training can fit. Planner-only locks
                  and tuning stay out of this profile view.
                </Text>
                <IntegerStepper
                  id="preferences-min-sessions"
                  label="Fewest sessions per week"
                  value={draft.dose_limits.min_sessions_per_week ?? 0}
                  min={0}
                  max={14}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      dose_limits: {
                        ...current.dose_limits,
                        min_sessions_per_week: value,
                      },
                    }))
                  }
                />
                <IntegerStepper
                  id="preferences-max-sessions"
                  label="Most sessions per week"
                  value={draft.dose_limits.max_sessions_per_week ?? 7}
                  min={0}
                  max={21}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      dose_limits: {
                        ...current.dose_limits,
                        max_sessions_per_week: value,
                      },
                    }))
                  }
                />
                <IntegerStepper
                  id="preferences-max-duration"
                  label="Longest workout (minutes)"
                  value={
                    draft.dose_limits.max_single_session_duration_minutes ?? 180
                  }
                  min={20}
                  max={600}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      dose_limits: {
                        ...current.dose_limits,
                        max_single_session_duration_minutes: value,
                      },
                    }))
                  }
                />
                <IntegerStepper
                  id="preferences-max-weekly-duration"
                  label="Weekly time budget (minutes)"
                  value={draft.dose_limits.max_weekly_duration_minutes ?? 360}
                  min={30}
                  max={10080}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      dose_limits: {
                        ...current.dose_limits,
                        max_weekly_duration_minutes: value,
                      },
                    }))
                  }
                />
              </>
            ) : null}

            {activeTab === "training-style" ? (
              <>
                <Text className="text-xs text-muted-foreground">
                  Training style is about progression and week feel, not bounded
                  upside beyond the goal target.
                </Text>
                <PercentSliderInput
                  id="preferences-progression-pace"
                  label="Progression pace"
                  value={draft.training_style.progression_pace * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher builds faster week to week."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      training_style: {
                        ...current.training_style,
                        progression_pace: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
                <PercentSliderInput
                  id="preferences-week-pattern"
                  label="Week pattern"
                  value={draft.training_style.week_pattern_preference * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Lower stays steadier. Higher varies week shape more."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      training_style: {
                        ...current.training_style,
                        week_pattern_preference: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
                <PercentSliderInput
                  id="preferences-key-session-density"
                  label="Key session density"
                  value={
                    (draft.training_style.key_session_density_preference ??
                      0.5) * 100
                  }
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher packs more demanding sessions into a week."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      training_style: {
                        ...current.training_style,
                        key_session_density_preference:
                          toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </>
            ) : null}

            {activeTab === "recovery" ? (
              <>
                <PercentSliderInput
                  id="preferences-recovery-priority"
                  label="Recovery priority"
                  value={draft.recovery_preferences.recovery_priority * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher protects easy days and recovery space more strongly."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      recovery_preferences: {
                        ...current.recovery_preferences,
                        recovery_priority: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
                <IntegerStepper
                  id="preferences-recovery-days"
                  label="Recovery days after a goal"
                  value={draft.recovery_preferences.post_goal_recovery_days}
                  min={0}
                  max={21}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      recovery_preferences: {
                        ...current.recovery_preferences,
                        post_goal_recovery_days: value,
                      },
                    }))
                  }
                />
                <PercentSliderInput
                  id="preferences-double-day-tolerance"
                  label="Double day tolerance"
                  value={
                    (draft.recovery_preferences.double_day_tolerance ?? 0.25) *
                    100
                  }
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher allows stacked sessions more often."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      recovery_preferences: {
                        ...current.recovery_preferences,
                        double_day_tolerance: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
                <PercentSliderInput
                  id="preferences-long-session-fatigue"
                  label="Long session fatigue tolerance"
                  value={
                    (draft.recovery_preferences
                      .long_session_fatigue_tolerance ?? 0.5) * 100
                  }
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Lower keeps long-session fatigue more tightly bounded."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      recovery_preferences: {
                        ...current.recovery_preferences,
                        long_session_fatigue_tolerance:
                          toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </>
            ) : null}

            {activeTab === "goal-strategy" ? (
              <>
                <Text className="text-xs text-muted-foreground">
                  Goal strategy changes how closely the planner hugs the stated
                  target versus aiming for bounded upside when confidence
                  supports it. This is separate from progression pace.
                </Text>
                <PercentSliderInput
                  id="preferences-target-surplus"
                  label="Target surplus preference"
                  value={
                    draft.goal_strategy_preferences.target_surplus_preference *
                    100
                  }
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher asks the system to plan for a little more than the stated target when it is safe and well supported."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      goal_strategy_preferences: {
                        ...current.goal_strategy_preferences,
                        target_surplus_preference: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
                <PercentSliderInput
                  id="preferences-priority-tradeoff"
                  label="Priority tradeoff"
                  value={
                    (draft.goal_strategy_preferences
                      .priority_tradeoff_preference ?? 0.5) * 100
                  }
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher lets priority goals pull more strongly on shared training capacity."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      goal_strategy_preferences: {
                        ...current.goal_strategy_preferences,
                        priority_tradeoff_preference:
                          toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      </ScrollView>

      <View className="border-t border-border bg-background px-4 py-4">
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => setDraft(settingsQuery.settings)}
            disabled={!hasUnsavedChanges || upsertMutation.isPending}
          >
            <Text>Reset</Text>
          </Button>
          <Button
            className="flex-1"
            onPress={savePreferences}
            disabled={
              !settingsQuery.profileId ||
              !hasUnsavedChanges ||
              upsertMutation.isPending
            }
          >
            <Text className="text-primary-foreground">
              {upsertMutation.isPending ? "Saving..." : "Save Preferences"}
            </Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
