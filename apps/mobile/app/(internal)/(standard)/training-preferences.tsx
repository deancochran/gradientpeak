import type { AthleteTrainingSettings } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Input } from "@repo/ui/components/input";
import { IntegerStepper } from "@repo/ui/components/integer-stepper";
import { Switch } from "@repo/ui/components/switch";
import { Text } from "@repo/ui/components/text";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { PercentSliderInput } from "@/components/training-plan/create/inputs/PercentSliderInput";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";

type PreferencesTabKey =
  | "schedule"
  | "training-style"
  | "recovery"
  | "goal-strategy"
  | "baseline-fitness";

const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "schedule", label: "Schedule" },
  { key: "training-style", label: "Training style" },
  { key: "recovery", label: "Recovery" },
  { key: "goal-strategy", label: "Goal strategy" },
  { key: "baseline-fitness", label: "Baseline fitness" },
];

function toFractionFromPercent(value: number, decimals = 2) {
  return Number((value / 100).toFixed(decimals));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatMinutes(minutes?: number) {
  if (!minutes || minutes <= 0) {
    return null;
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${remainder} min`;
}

function deriveProjectionPreview(
  baseCurve: Array<{ date: string; ctl: number }>,
  draft: AthleteTrainingSettings,
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

export default function TrainingPreferencesScreen() {
  const utils = trpc.useUtils();
  const activePlanQuery = trpc.trainingPlans.getActivePlan.useQuery();
  const activePlan = activePlanQuery.data;
  const settingsQuery = useProfileSettings();
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("schedule");
  const [draft, setDraft] = useState<AthleteTrainingSettings>(settingsQuery.settings);
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

  const scheduleValidation = useMemo(() => {
    const minSessions = draft.dose_limits.min_sessions_per_week ?? 0;
    const maxSessions = draft.dose_limits.max_sessions_per_week ?? 0;
    const maxSingleSessionDuration = draft.dose_limits.max_single_session_duration_minutes;
    const maxWeeklyDuration = draft.dose_limits.max_weekly_duration_minutes;

    const issues: string[] = [];

    if (minSessions > maxSessions) {
      issues.push("Fewest sessions per week cannot be higher than most sessions per week.");
    }

    if (
      typeof maxSingleSessionDuration === "number" &&
      typeof maxWeeklyDuration === "number" &&
      maxSingleSessionDuration > maxWeeklyDuration
    ) {
      issues.push("Weekly time budget must be at least as long as your longest workout.");
    }

    return {
      issues,
      minSessionsError:
        minSessions > maxSessions
          ? "Choose a floor that stays at or below your weekly maximum."
          : undefined,
      maxSessionsError:
        minSessions > maxSessions
          ? "Raise this above the weekly minimum or lower the minimum."
          : undefined,
      maxSingleSessionError:
        typeof maxSingleSessionDuration === "number" &&
        typeof maxWeeklyDuration === "number" &&
        maxSingleSessionDuration > maxWeeklyDuration
          ? "A single workout cannot be longer than the full weekly time budget."
          : undefined,
      maxWeeklyDurationError:
        typeof maxSingleSessionDuration === "number" &&
        typeof maxWeeklyDuration === "number" &&
        maxSingleSessionDuration > maxWeeklyDuration
          ? "Increase this budget or shorten the longest workout."
          : undefined,
    };
  }, [draft]);

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

  const scheduleSnapshot = useMemo(() => {
    const minSessions = draft.dose_limits.min_sessions_per_week ?? 0;
    const maxSessions = draft.dose_limits.max_sessions_per_week ?? 0;
    const weeklyBudget = formatMinutes(draft.dose_limits.max_weekly_duration_minutes);
    const longestWorkout = formatMinutes(draft.dose_limits.max_single_session_duration_minutes);

    return `${minSessions}-${maxSessions} sessions per week, ${weeklyBudget ?? "no weekly cap"}, longest workout ${longestWorkout ?? "not set"}.`;
  }, [draft.dose_limits]);

  const savePreferences = () => {
    if (!settingsQuery.profileId || scheduleValidation.issues.length > 0) {
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
        <Text className="mt-3 text-sm text-muted-foreground">Loading preferences...</Text>
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
                {projectionPreviewState.tone === "loading" ? (
                  <ActivityIndicator size="small" />
                ) : null}
                <Text className="text-sm font-semibold text-foreground">
                  {projectionPreviewState.title}
                </Text>
                <Text className="text-sm text-muted-foreground">{projectionPreviewState.body}</Text>
              </View>
            )}
            <Text className="text-sm font-medium text-foreground">
              {projectionPreviewState.title}
            </Text>
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
                  Set the weekly training floor, ceiling, and time budget the planner should
                  respect. Planner-only tuning stays out of this profile view.
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Current draft: {scheduleSnapshot}
                </Text>
                {scheduleValidation.issues.length > 0 ? (
                  <View className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <Text className="text-sm font-medium text-destructive">
                      Fix these schedule conflicts before saving.
                    </Text>
                    <Text className="mt-1 text-xs text-destructive">
                      {scheduleValidation.issues.join(" ")}
                    </Text>
                  </View>
                ) : null}
                <IntegerStepper
                  id="preferences-min-sessions"
                  label="Fewest sessions per week"
                  value={draft.dose_limits.min_sessions_per_week ?? 0}
                  min={0}
                  max={14}
                  helperText="Set the lowest weekly frequency that still feels sustainable."
                  error={scheduleValidation.minSessionsError}
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
                  helperText="Set the upper limit the planner should never exceed."
                  error={scheduleValidation.maxSessionsError}
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
                  value={draft.dose_limits.max_single_session_duration_minutes ?? 180}
                  min={20}
                  max={600}
                  helperText="Use the longest workout you can realistically absorb in one day."
                  error={scheduleValidation.maxSingleSessionError}
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
                  helperText="This should cover the whole week, including your longest workout."
                  error={scheduleValidation.maxWeeklyDurationError}
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
                  Training style is about progression and week feel, not bounded upside beyond the
                  goal target.
                </Text>
                <PercentSliderInput
                  id="preferences-progression-pace"
                  label="Progression pace"
                  value={draft.training_style.progression_pace * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher builds load faster from week to week."
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
                  value={(draft.training_style.key_session_density_preference ?? 0.5) * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher packs more demanding sessions into the same week."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      training_style: {
                        ...current.training_style,
                        key_session_density_preference: toFractionFromPercent(value),
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
                  value={(draft.recovery_preferences.double_day_tolerance ?? 0.25) * 100}
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
                  value={(draft.recovery_preferences.long_session_fatigue_tolerance ?? 0.5) * 100}
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
                        long_session_fatigue_tolerance: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </>
            ) : null}

            {activeTab === "goal-strategy" ? (
              <>
                <Text className="text-xs text-muted-foreground">
                  Goal strategy changes how closely the planner hugs the stated target versus aiming
                  for bounded upside when confidence supports it. This stays separate from
                  progression pace and schedule limits.
                </Text>
                <PercentSliderInput
                  id="preferences-target-surplus"
                  label="Target surplus preference"
                  value={draft.goal_strategy_preferences.target_surplus_preference * 100}
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
                    (draft.goal_strategy_preferences.priority_tradeoff_preference ?? 0.5) * 100
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
                        priority_tradeoff_preference: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </>
            ) : null}

            {activeTab === "baseline-fitness" ? (
              <>
                <Text className="text-xs text-muted-foreground">
                  Override your baseline fitness to unlock higher volume training plans without
                  historical data. This tells the system your current CTL (fitness) and ATL
                  (fatigue) so it doesn't cap your plan due to low historical load.
                </Text>
                <View className="flex-row items-center justify-between py-2">
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-foreground">
                      Enable Manual Baseline
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      Use override values instead of calculated from history
                    </Text>
                  </View>
                  <Switch
                    checked={draft.baseline_fitness?.is_enabled ?? false}
                    onCheckedChange={(checked: boolean) =>
                      setDraft((current) => ({
                        ...current,
                        baseline_fitness: {
                          is_enabled: checked,
                          override_ctl: current.baseline_fitness?.override_ctl ?? 0,
                          override_atl: current.baseline_fitness?.override_atl ?? 0,
                          override_date: current.baseline_fitness?.override_date,
                          max_weekly_tss_ramp_pct:
                            current.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10,
                          max_ctl_ramp_per_week:
                            current.baseline_fitness?.max_ctl_ramp_per_week ?? 5,
                        },
                      }))
                    }
                  />
                </View>
                {(draft.baseline_fitness?.is_enabled ?? false) && (
                  <>
                    <IntegerStepper
                      id="preferences-baseline-ctl"
                      label="CTL (Chronic Training Load)"
                      value={draft.baseline_fitness?.override_ctl ?? 0}
                      min={0}
                      max={250}
                      helperText="Your current fitness level (42-day average TSS)"
                      onChange={(value: number) =>
                        setDraft((current) => ({
                          ...current,
                          baseline_fitness: {
                            is_enabled: current.baseline_fitness?.is_enabled ?? false,
                            override_ctl: value,
                            override_atl: current.baseline_fitness?.override_atl ?? 0,
                            override_date: current.baseline_fitness?.override_date,
                            max_weekly_tss_ramp_pct:
                              current.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10,
                            max_ctl_ramp_per_week:
                              current.baseline_fitness?.max_ctl_ramp_per_week ?? 5,
                          },
                        }))
                      }
                    />
                    <IntegerStepper
                      id="preferences-baseline-atl"
                      label="ATL (Acute Training Load)"
                      value={draft.baseline_fitness?.override_atl ?? 0}
                      min={0}
                      max={250}
                      helperText="Your current fatigue level (7-day average TSS)"
                      onChange={(value: number) =>
                        setDraft((current) => ({
                          ...current,
                          baseline_fitness: {
                            is_enabled: current.baseline_fitness?.is_enabled ?? false,
                            override_ctl: current.baseline_fitness?.override_ctl ?? 0,
                            override_atl: value,
                            override_date: current.baseline_fitness?.override_date,
                            max_weekly_tss_ramp_pct:
                              current.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10,
                            max_ctl_ramp_per_week:
                              current.baseline_fitness?.max_ctl_ramp_per_week ?? 5,
                          },
                        }))
                      }
                    />
                    <View className="mt-2">
                      <Text className="text-sm font-medium text-foreground mb-2">
                        Baseline Date
                      </Text>
                      <Text className="text-xs text-muted-foreground mb-2">
                        When these values were valid (defaults to today)
                      </Text>
                      <Input
                        value={
                          draft.baseline_fitness?.override_date ??
                          new Date().toISOString().split("T")[0]!
                        }
                        onChangeText={(value: string) =>
                          setDraft((current) => ({
                            ...current,
                            baseline_fitness: {
                              is_enabled: current.baseline_fitness?.is_enabled ?? false,
                              override_ctl: current.baseline_fitness?.override_ctl ?? 0,
                              override_atl: current.baseline_fitness?.override_atl ?? 0,
                              override_date: value,
                              max_weekly_tss_ramp_pct:
                                current.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10,
                              max_ctl_ramp_per_week:
                                current.baseline_fitness?.max_ctl_ramp_per_week ?? 5,
                            },
                          }))
                        }
                        placeholder="YYYY-MM-DD"
                        className="border-input"
                      />
                    </View>
                    <View className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                      <Text className="text-sm font-medium text-warning">
                        Advanced: Ramp Rate Settings
                      </Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        Override the default weekly ramp caps. Higher values allow faster training
                        load progression but increase injury risk.
                      </Text>
                    </View>
                    <IntegerStepper
                      id="preferences-ramp-tss-pct"
                      label="Max Weekly TSS Ramp %"
                      value={draft.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10}
                      min={1}
                      max={40}
                      helperText="Maximum weekly TSS increase (default: 10%)"
                      onChange={(value: number) =>
                        setDraft((current) => ({
                          ...current,
                          baseline_fitness: {
                            is_enabled: current.baseline_fitness?.is_enabled ?? false,
                            override_ctl: current.baseline_fitness?.override_ctl ?? 0,
                            override_atl: current.baseline_fitness?.override_atl ?? 0,
                            override_date: current.baseline_fitness?.override_date,
                            max_weekly_tss_ramp_pct: value,
                            max_ctl_ramp_per_week:
                              current.baseline_fitness?.max_ctl_ramp_per_week ?? 5,
                          },
                        }))
                      }
                    />
                    <IntegerStepper
                      id="preferences-ramp-ctl"
                      label="Max CTL Ramp Per Week"
                      value={draft.baseline_fitness?.max_ctl_ramp_per_week ?? 5}
                      min={1}
                      max={12}
                      helperText="Maximum CTL increase per week (default: 5)"
                      onChange={(value: number) =>
                        setDraft((current) => ({
                          ...current,
                          baseline_fitness: {
                            is_enabled: current.baseline_fitness?.is_enabled ?? false,
                            override_ctl: current.baseline_fitness?.override_ctl ?? 0,
                            override_atl: current.baseline_fitness?.override_atl ?? 0,
                            override_date: current.baseline_fitness?.override_date,
                            max_weekly_tss_ramp_pct:
                              current.baseline_fitness?.max_weekly_tss_ramp_pct ?? 10,
                            max_ctl_ramp_per_week: value,
                          },
                        }))
                      }
                    />
                    <View className="mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2">
                      <Text className="text-sm font-medium text-info">Why Adjust Ramp Rates?</Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        If your plan's readiness score feels too low, it may be because the goal
                        requires more training load than the default ramp caps allow. Try increasing
                        the Max Weekly TSS Ramp % or Max CTL Ramp Per Week above to see if that
                        unlocks a higher readiness. Higher values allow faster progression but
                        increase injury risk.
                      </Text>
                    </View>
                    <View className="mt-4 rounded-md border border-info/30 bg-info/10 px-3 py-2">
                      <Text className="text-sm font-medium text-info">Example CTL Values</Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        Recreatonal: 30-50 | Intermediate: 50-80 | Advanced: 80-120 | Elite: 120+
                      </Text>
                    </View>
                  </>
                )}
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
              scheduleValidation.issues.length > 0 ||
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
