import { IntegerStepper } from "@/components/training-plan/create/inputs/IntegerStepper";
import { PercentSliderInput } from "@/components/training-plan/create/inputs/PercentSliderInput";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { useProfileSettings } from "@/lib/hooks/useProfileSettings";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import {
  normalizeCreationConfig,
  type AthleteTrainingSettings,
} from "@repo/core";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

type PreferencesTabKey = "profile" | "behavior" | "availability" | "limits";

const preferenceTabs: Array<{ key: PreferencesTabKey; label: string }> = [
  { key: "profile", label: "Recovery" },
  { key: "behavior", label: "Style" },
  { key: "availability", label: "Schedule" },
  { key: "limits", label: "Session Size" },
];

function toFractionFromPercent(value: number, decimals = 2) {
  return Number((value / 100).toFixed(decimals));
}

function toLockState(locked: boolean) {
  return locked
    ? { locked: true as const, locked_by: "user" as const }
    : { locked: false as const };
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

  const aggressivenessFactor =
    (draft.behavior_controls_v1.aggressiveness - 0.5) * 0.8;
  const recoveryFactor =
    (draft.behavior_controls_v1.recovery_priority - 0.5) * 0.6;
  const sessionRange =
    (draft.constraints.max_sessions_per_week ?? 7) -
    (draft.constraints.min_sessions_per_week ?? 0);
  const sessionFactor = (sessionRange - 4) / 20;
  const durationFactor =
    ((draft.constraints.max_single_session_duration_minutes ?? 180) - 180) /
    420;

  const growthFactor = clamp(
    1 +
      aggressivenessFactor -
      recoveryFactor +
      sessionFactor * 0.2 +
      durationFactor * 0.2,
    0.6,
    1.5,
  );
  const variabilityAmplitude =
    (draft.behavior_controls_v1.variability - 0.5) * 0.35;

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
  const [activeTab, setActiveTab] = useState<PreferencesTabKey>("profile");
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      return "Adjust preferences to preview how your projection can shift.";
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
      settings: normalizeCreationConfig({
        user_values: draft,
        defaults: draft,
      }),
    });
  };

  if (settingsQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-3">
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
              This preview follows your draft choices and only updates your
              saved setup after you tap Save.
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
          <CardContent className="gap-4">
            <View className="flex-row items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-medium text-foreground">
                  Keep this simple
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Everyday coaching controls stay up front. Advanced locks stay
                  hidden unless you need them.
                </Text>
              </View>
              <Button
                variant="outline"
                size="sm"
                onPress={() => setShowAdvanced((current) => !current)}
              >
                <Text>{showAdvanced ? "Hide advanced" : "Show advanced"}</Text>
              </Button>
            </View>

            {activeTab === "profile" ? (
              <View className="gap-5">
                <IntegerStepper
                  id="preferences-recovery-days"
                  label="Recovery days after a goal"
                  value={draft.post_goal_recovery_days}
                  min={0}
                  max={21}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      post_goal_recovery_days: value,
                    }))
                  }
                />
              </View>
            ) : null}

            {activeTab === "behavior" ? (
              <View className="gap-5">
                <PercentSliderInput
                  id="preferences-aggressiveness"
                  label="Build speed"
                  value={draft.behavior_controls_v1.aggressiveness * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher moves training forward faster."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      behavior_controls_v1: {
                        ...current.behavior_controls_v1,
                        aggressiveness: toFractionFromPercent(value),
                      },
                    }))
                  }
                />

                <PercentSliderInput
                  id="preferences-recovery-priority"
                  label="Recovery focus"
                  value={draft.behavior_controls_v1.recovery_priority * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher gives easier days more room."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      behavior_controls_v1: {
                        ...current.behavior_controls_v1,
                        recovery_priority: toFractionFromPercent(value),
                      },
                    }))
                  }
                />

                <PercentSliderInput
                  id="preferences-variability"
                  label="Week-to-week variety"
                  value={draft.behavior_controls_v1.variability * 100}
                  min={0}
                  max={100}
                  step={1}
                  decimals={0}
                  helperText="Higher adds more variation across weeks."
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      behavior_controls_v1: {
                        ...current.behavior_controls_v1,
                        variability: toFractionFromPercent(value),
                      },
                    }))
                  }
                />
              </View>
            ) : null}

            {activeTab === "availability" ? (
              <View className="gap-5">
                <IntegerStepper
                  id="preferences-min-sessions"
                  label="Fewest sessions per week"
                  value={draft.constraints.min_sessions_per_week ?? 0}
                  min={0}
                  max={14}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        min_sessions_per_week: value,
                      },
                    }))
                  }
                />

                <IntegerStepper
                  id="preferences-max-sessions"
                  label="Most sessions per week"
                  value={draft.constraints.max_sessions_per_week ?? 7}
                  min={0}
                  max={21}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        max_sessions_per_week: value,
                      },
                    }))
                  }
                />
              </View>
            ) : null}

            {activeTab === "limits" ? (
              <View className="gap-5">
                <IntegerStepper
                  id="preferences-max-duration"
                  label="Longest workout (minutes)"
                  value={
                    draft.constraints.max_single_session_duration_minutes ?? 180
                  }
                  min={20}
                  max={600}
                  onChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      constraints: {
                        ...current.constraints,
                        max_single_session_duration_minutes: value,
                      },
                    }))
                  }
                />

                {showAdvanced ? (
                  <View className="gap-4 rounded-md border border-border/60 bg-muted/10 p-3">
                    <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Advanced locks
                    </Text>

                    <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-3">
                      <View className="pr-4 flex-1">
                        <Text className="text-sm font-medium text-foreground">
                          Lock style settings
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Keep build speed, recovery focus, and variety fixed.
                        </Text>
                      </View>
                      <Switch
                        checked={draft.locks.behavior_controls_v1.locked}
                        onCheckedChange={(checked) =>
                          setDraft((current) => ({
                            ...current,
                            locks: {
                              ...current.locks,
                              behavior_controls_v1: toLockState(checked),
                            },
                          }))
                        }
                      />
                    </View>

                    <View className="flex-row items-center justify-between rounded-md border border-border bg-card px-3 py-3">
                      <View className="pr-4 flex-1">
                        <Text className="text-sm font-medium text-foreground">
                          Lock recovery days
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Keep your recovery-days setting fixed.
                        </Text>
                      </View>
                      <Switch
                        checked={draft.locks.post_goal_recovery_days.locked}
                        onCheckedChange={(checked) =>
                          setDraft((current) => ({
                            ...current,
                            locks: {
                              ...current.locks,
                              post_goal_recovery_days: toLockState(checked),
                            },
                          }))
                        }
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
          </CardContent>
        </Card>
      </ScrollView>

      <View className="px-4 py-4 border-t border-border bg-background">
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
