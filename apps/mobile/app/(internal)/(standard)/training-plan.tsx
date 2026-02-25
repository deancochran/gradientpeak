import { UpcomingActivitiesCard } from "@/components/training-plan/UpcomingActivitiesCard";
import { TrainingPlanKpiRow } from "@/components/training-plan/TrainingPlanKpiRow";
import { TrainingPlanSummaryHeader } from "@/components/training-plan/TrainingPlanSummaryHeader";
import { WeeklyProgressCard } from "@/components/training-plan/WeeklyProgressCard";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { PlanAdherenceMiniChart } from "@/components/plan/PlanAdherenceMiniChart";
import { PlanCapabilityMiniChart } from "@/components/plan/PlanCapabilityMiniChart";
import {
  DetailChartModal,
  type DateRange,
} from "@/components/shared/DetailChartModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import {
  TPV_NEXT_STEP_INTENTS,
  normalizeTrainingPlanNextStep,
} from "@/lib/constants/trainingPlanIntents";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  CircleCheck,
  Gauge,
  Pause,
  Trash2,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

interface InsightSummaryContributor {
  label?: string;
  value?: number | string;
  detail?: string;
}

interface InsightSummary {
  interpretation?: string | null;
  contributors?: InsightSummaryContributor[] | null;
}

export default function TrainingPlanOverview() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { id, nextStep, activityId } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
    activityId?: string;
  }>();

  const normalizedNextStepIntent = normalizeTrainingPlanNextStep(nextStep);

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );
  const ninetyDayInsightWindow = useMemo(() => {
    const endDateValue = new Date();
    const startDateValue = new Date(endDateValue);
    startDateValue.setDate(endDateValue.getDate() - 89);
    return {
      start_date: startDateValue.toISOString().split("T")[0]!,
      end_date: endDateValue.toISOString().split("T")[0]!,
    };
  }, []);

  const snapshot = useTrainingPlanSnapshot({
    planId: id,
    includeWeeklySummaries: false,
    insightWindow: ninetyDayInsightWindow,
    timezone,
    curveWindow: "overview",
  });

  const plan = snapshot.plan;
  const status = snapshot.status;
  const loadingPlan = snapshot.isLoadingSharedDependencies;

  const today = useMemo(() => new Date(), []);
  const actualCurveData = snapshot.actualCurveData;
  const idealCurveData = snapshot.idealCurveData;

  // Extract data from API responses
  const fitnessHistory = useMemo(
    () => actualCurveData?.dataPoints || [],
    [actualCurveData],
  );
  const idealFitnessCurve = useMemo(
    () => idealCurveData?.dataPoints || [],
    [idealCurveData],
  );
  const projectedFitness = useMemo(() => {
    // Extract future dates from ideal curve (after today)
    if (!idealCurveData?.dataPoints) return [];
    const todayStr = today.toISOString().split("T")[0];
    return idealCurveData.dataPoints.filter((d) => d.date > todayStr);
  }, [idealCurveData, today]);

  // Get goal metrics from ideal curve data
  const goalMetrics = useMemo(() => {
    if (!idealCurveData) return undefined;
    return {
      targetCTL: idealCurveData.targetCTL,
      targetDate: idealCurveData.targetDate,
      description: `Target: ${idealCurveData.targetCTL} CTL by ${new Date(idealCurveData.targetDate).toLocaleDateString()}`,
    };
  }, [idealCurveData]);

  const [refreshing, setRefreshing] = React.useState(false);
  const [insightModal, setInsightModal] = React.useState<
    "adherence" | "readiness" | null
  >(null);

  const deletePlanMutation = useReliableMutation(trpc.trainingPlans.delete, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Plan Deleted", "Your training plan has been deleted", [
        {
          text: "OK",
          onPress: () => router.replace(ROUTES.PLAN.INDEX),
        },
      ]);
    },
    onError: (error) => {
      Alert.alert("Delete Failed", error.message || "Failed to delete plan");
    },
  });

  const insightTimelinePoints = useMemo(
    () => snapshot.insightTimeline?.timeline || [],
    [snapshot.insightTimeline],
  );

  const capabilityCurrentEstimate = useMemo(() => {
    const directValue = snapshot.insightTimeline?.capability?.cp_or_cs;
    if (typeof directValue === "number") {
      return directValue;
    }

    if (!insightTimelinePoints.length) {
      return null;
    }

    return insightTimelinePoints[insightTimelinePoints.length - 1]!.actual_tss;
  }, [snapshot.insightTimeline, insightTimelinePoints]);

  const capabilityProjectionEstimate = useMemo(() => {
    const directProjection =
      snapshot.insightTimeline?.projection?.at_goal_date?.projected_goal_metric;
    if (typeof directProjection === "number") {
      return directProjection;
    }

    if (!insightTimelinePoints.length) {
      return null;
    }

    return insightTimelinePoints[insightTimelinePoints.length - 1]!
      .scheduled_tss;
  }, [snapshot.insightTimeline, insightTimelinePoints]);

  const adherenceScore = useMemo(() => {
    if (!insightTimelinePoints.length) {
      return null;
    }

    return Math.round(
      Math.max(
        0,
        Math.min(
          100,
          insightTimelinePoints[insightTimelinePoints.length - 1]!
            .adherence_score,
        ),
      ),
    );
  }, [insightTimelinePoints]);

  const adherenceSummary =
    (snapshot.insightTimeline?.adherence_summary as
      | InsightSummary
      | undefined) || undefined;
  const readinessSummary =
    (snapshot.insightTimeline?.readiness_summary as
      | InsightSummary
      | undefined) || undefined;

  const formatSummaryContributors = (
    summary?: InsightSummary,
  ): string | null => {
    if (!summary?.contributors?.length) {
      return null;
    }

    const contributorDetails = summary.contributors
      .map((contributor) => contributor.detail?.trim())
      .filter((detail): detail is string => Boolean(detail));

    if (contributorDetails.length > 0) {
      return contributorDetails.join(" ");
    }

    const contributorLabels = summary.contributors
      .map((contributor) => contributor.label?.trim())
      .filter((label): label is string => Boolean(label));

    if (contributorLabels.length > 0) {
      return contributorLabels.join(", ");
    }

    return null;
  };

  const parseDaysFromRange = (dateRange: DateRange): number => {
    if (dateRange === "7d") {
      return 7;
    }
    if (dateRange === "90d") {
      return 90;
    }
    if (dateRange === "all") {
      return insightTimelinePoints.length || 30;
    }
    return 30;
  };

  const handleOpenSettings = useCallback(() => {
    router.push({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "plan" },
    });
  }, [plan?.id, router]);

  const handleOpenActivity = useCallback(() => {
    if (typeof activityId !== "string") {
      return;
    }

    router.push(ROUTES.PLAN.ACTIVITY_DETAIL(activityId) as any);
  }, [activityId, router]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await snapshot.refetchAll();
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  };

  const handleEditStructure = useCallback(() => {
    router.push({
      pathname: ROUTES.PLAN.TRAINING_PLAN.EDIT,
      params: { id: plan?.id, initialTab: "goals" },
    });
  }, [plan?.id, router]);

  const handleDeletePlan = useCallback(() => {
    if (!plan) {
      return;
    }

    Alert.alert(
      "Delete Training Plan?",
      "This action cannot be undone. All planned activities associated with this training plan will also be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePlanMutation.mutateAsync({ id: plan.id });
          },
        },
      ],
    );
  }, [deletePlanMutation, plan]);

  const focusContext = useMemo(() => {
    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REFINE) {
      return {
        title: "Refine Plan",
        description:
          "Your plan is ready. Open edit to adjust constraints, targets, and plan details.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }

    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.EDIT) {
      return {
        title: "Edit Plan Structure",
        description:
          "Tune weekly targets and constraints in edit mode before your next scheduling cycle.",
        ctaLabel: "Structure",
        onPress: handleEditStructure,
      };
    }

    if (normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.MANAGE) {
      return {
        title: "Manage Plan",
        description:
          "Review status, activation, and defaults in edit so the execution tab stays focused.",
        ctaLabel: "Manage Plan",
        onPress: handleOpenSettings,
      };
    }

    if (
      normalizedNextStepIntent === TPV_NEXT_STEP_INTENTS.REVIEW_ACTIVITY &&
      typeof activityId === "string"
    ) {
      return {
        title: "Review Planned Activity",
        description:
          "Open the linked activity to inspect details and make focused adjustments.",
        ctaLabel: "Open Activity",
        onPress: handleOpenActivity,
      };
    }

    return null;
  }, [
    activityId,
    handleEditStructure,
    handleOpenActivity,
    handleOpenSettings,
    normalizedNextStepIntent,
  ]);

  React.useEffect(() => {
    if (!loadingPlan && !plan && !id) {
      router.replace(ROUTES.PLAN.TRAINING_PLAN.CREATE as any);
    }
  }, [id, loadingPlan, plan, router]);

  // Derive plan progress
  const planProgress = useMemo(() => {
    if (!plan || !plan.structure) return { week: "0/0", percentage: 0 };

    const structure = plan.structure as { target_weeks?: number };
    const totalWeeks = structure.target_weeks || 16;
    const currentWeek = Math.min(
      Math.ceil(
        (Date.now() - new Date(plan.created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
      totalWeeks,
    );
    return {
      week: `${currentWeek}/${totalWeeks}`,
      percentage: Math.round((currentWeek / totalWeeks) * 100),
    };
  }, [plan]);

  const summaryKpis = useMemo(() => {
    const completedActivities = status?.weekProgress?.completedActivities || 0;
    const totalActivities = status?.weekProgress?.totalPlannedActivities || 0;

    const items = [
      { label: "Week Progress", value: planProgress.week },
      {
        label: "Adherence",
        value: `${completedActivities}/${totalActivities}`,
      },
    ];

    if (status) {
      items.push({ label: "Fitness", value: `${status.ctl} CTL` });
    }

    return items;
  }, [planProgress.week, status]);

  // Loading state
  if (loadingPlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading training plan...
        </Text>
      </View>
    );
  }

  if (snapshot.hasSharedDependencyError) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6 gap-3">
        <Text className="text-muted-foreground text-center">
          Unable to load training plan right now.
        </Text>
        <TouchableOpacity
          onPress={() => void snapshot.refetch()}
          className="px-4 py-2 rounded-full border border-border bg-card"
          activeOpacity={0.8}
        >
          <Text className="text-foreground">Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No training plan - show empty state
  if (!plan) {
    if (!id) {
      return (
        <View className="flex-1 bg-background items-center justify-center">
          <ActivityIndicator size="large" />
          <Text className="text-muted-foreground mt-4">
            Opening plan creation...
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        className="flex-1 bg-background"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="flex-1 p-6 gap-6">
          {/* Empty State Card */}
          <Card className="mt-8">
            <CardContent className="p-8">
              <View className="items-center">
                <View className="bg-primary/10 rounded-full p-6 mb-6">
                  <Icon as={Activity} size={64} className="text-primary" />
                </View>
                <Text className="text-2xl font-bold mb-3 text-center">
                  No Training Plan
                </Text>
                <Text className="text-base text-muted-foreground text-center mb-6">
                  A training plan helps you build fitness systematically, track
                  your progress, and prevent overtraining through structured
                  activities and recovery.
                </Text>

                <View className="w-full gap-3">
                  <Button size="lg" onPress={handleCreatePlan}>
                    <Text className="text-primary-foreground font-semibold">
                      Create Training Plan
                    </Text>
                  </Button>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Benefits Section */}
          <View className="gap-4 mt-4">
            <Text className="text-lg font-semibold">
              Benefits of a Training Plan:
            </Text>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={TrendingUp} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Track Your Fitness</Text>
                <Text className="text-sm text-muted-foreground">
                  Monitor CTL, ATL, and TSB to understand your fitness trends
                  and form.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Calendar} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">
                  Structured Scheduling
                </Text>
                <Text className="text-sm text-muted-foreground">
                  Weekly TSS targets and constraint validation ensure balanced
                  training.
                </Text>
              </View>
            </View>

            <View className="flex-row items-start gap-3">
              <View className="bg-primary/10 rounded-full p-2 mt-1">
                <Icon as={Activity} size={20} className="text-primary" />
              </View>
              <View className="flex-1">
                <Text className="font-semibold mb-1">Prevent Overtraining</Text>
                <Text className="text-sm text-muted-foreground">
                  Recovery rules and intensity distribution keep you healthy and
                  improving.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Has training plan - show dashboard
  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View className="flex-1 p-4 gap-4">
        {/* Header with Plan Name and Actions */}
        <View className="mb-4">
          {focusContext && (
            <Card className="border-primary/40 bg-primary/5 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm text-primary font-semibold">
                  {focusContext.title}
                </Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  {focusContext.description}
                </Text>
                <TouchableOpacity
                  onPress={focusContext.onPress}
                  className="self-start mt-2 px-3 py-1.5 rounded-full bg-primary"
                  activeOpacity={0.8}
                >
                  <Text className="text-xs font-semibold text-primary-foreground">
                    {focusContext.ctaLabel}
                  </Text>
                </TouchableOpacity>
              </CardContent>
            </Card>
          )}

          <TrainingPlanSummaryHeader
            title={plan.name}
            description={plan.description || undefined}
            isActive={plan.is_active}
            inactiveLabel="Inactive"
            createdAt={plan.created_at}
            showStatusDot
            formatStartedDate={(date) =>
              date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            }
            rightAccessory={
              <TouchableOpacity onPress={handleOpenSettings} className="ml-3">
                <View className="bg-primary/10 rounded-full p-2">
                  <Icon as={ChevronRight} size={24} className="text-primary" />
                </View>
              </TouchableOpacity>
            }
          />

          <TrainingPlanKpiRow items={summaryKpis} />
        </View>

        <View>
          <Text className="text-base font-semibold mb-2">Plan Insights</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-3 pr-2"
          >
            <TouchableOpacity
              onPress={() => setInsightModal("adherence")}
              className="w-[248px]"
              activeOpacity={0.8}
            >
              <PlanAdherenceMiniChart timeline={insightTimelinePoints} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setInsightModal("readiness")}
              className="w-[248px]"
              activeOpacity={0.8}
            >
              <PlanCapabilityMiniChart
                currentCapability={capabilityCurrentEstimate}
                projectedCapability={capabilityProjectionEstimate}
                confidence={
                  snapshot.insightTimeline?.projection?.at_goal_date?.confidence
                }
                category={snapshot.insightTimeline?.capability?.category}
              />
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Fitness Progress Chart - Plan vs Actual */}
        {fitnessHistory.length > 0 ? (
          <View>
            <PlanVsActualChart
              actualData={fitnessHistory}
              projectedData={projectedFitness}
              idealData={idealFitnessCurve}
              goalMetrics={goalMetrics}
              height={300}
              showLegend={true}
            />
            {!idealCurveData && plan && (
              <Card className="border-primary/50 bg-primary/5 mt-4">
                <CardContent className="p-4">
                  <View className="gap-3">
                    <View>
                      <Text className="font-semibold text-primary mb-1">
                        Add Fitness Projection
                      </Text>
                      <Text className="text-sm text-muted-foreground">
                        Enable periodization to see your planned fitness
                        progression and track if you&apos;re on pace to reach
                        your goals.
                      </Text>
                    </View>
                    <Button
                      onPress={async () => {
                        try {
                          await utils.client.trainingPlans.autoAddPeriodization.mutate(
                            { id: plan.id },
                          );
                          await utils.trainingPlans.invalidate();
                          Alert.alert(
                            "Success!",
                            "Periodization has been automatically configured based on your plan. You can customize it in Settings.",
                          );
                        } catch (error: any) {
                          Alert.alert(
                            "Error",
                            error.message || "Failed to add periodization",
                          );
                        }
                      }}
                    >
                      <Text className="text-primary-foreground font-semibold">
                        Auto-Configure Periodization
                      </Text>
                    </Button>
                    <TouchableOpacity
                      onPress={handleOpenSettings}
                      className="items-center py-2"
                    >
                      <Text className="text-xs text-primary">
                        Or customize manually in Edit →
                      </Text>
                    </TouchableOpacity>
                  </View>
                </CardContent>
              </Card>
            )}
          </View>
        ) : (
          <Card className="border-border">
            <CardContent className="p-6">
              <View className="items-center">
                <Text className="font-semibold text-muted-foreground mb-2">
                  No Fitness Data Yet
                </Text>
                <Text className="text-sm text-muted-foreground text-center">
                  Complete some activities to see your fitness progression
                </Text>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Weekly Progress Card */}
        {status?.weekProgress && (
          <WeeklyProgressCard
            completedTSS={status.weekProgress.completedTSS}
            plannedTSS={status.weekProgress.plannedTSS}
            targetTSS={status.weekProgress.targetTSS}
            completedActivities={status.weekProgress.completedActivities}
            totalPlannedActivities={status.weekProgress.totalPlannedActivities}
          />
        )}

        {/* Upcoming Activities */}
        {status?.upcomingActivities && status.upcomingActivities.length > 0 && (
          <UpcomingActivitiesCard activities={status.upcomingActivities} />
        )}

        {/* Enhanced Plan Context */}
        <Card>
          <CardHeader>
            <CardTitle>Plan Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-muted-foreground">Current Week</Text>
                <Text className="font-semibold">{planProgress.week}</Text>
              </View>
              <View className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <View
                  className="bg-primary h-full"
                  style={{ width: `${planProgress.percentage}%` }}
                />
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Pause Warning */}
        {!plan.is_active && (
          <Card className="border-orange-500 bg-orange-500/5">
            <CardContent className="p-4">
              <View className="flex-row items-center gap-3">
                <View className="bg-orange-500/10 rounded-full p-2">
                  <Icon as={Pause} size={20} className="text-orange-500" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-orange-600 mb-1">
                    Plan Inactive
                  </Text>
                  <Text className="text-sm text-muted-foreground">
                    This training plan is currently inactive. Go to edit to
                    activate it.
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>
        )}

        {/* Training Plan Structure */}
        <Card>
          <CardHeader>
            <CardTitle>Training Plan Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              {plan.structure && (
                <>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Weekly TSS Target
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_weekly_tss_min} -{" "}
                      {(plan.structure as any).target_weekly_tss_max}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Activities per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).target_activities_per_week}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Max Consecutive Days
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).max_consecutive_days}
                    </Text>
                  </View>
                  <View className="h-px bg-border" />
                  <View className="flex-row justify-between items-center">
                    <Text className="text-muted-foreground">
                      Min Rest Days per Week
                    </Text>
                    <Text className="font-semibold">
                      {(plan.structure as any).min_rest_days_per_week}
                    </Text>
                  </View>
                  {(plan.structure as any).periodization_template && (
                    <>
                      <View className="h-px bg-border" />
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Periodization
                        </Text>
                        <Text className="font-semibold">
                          {
                            (plan.structure as any).periodization_template
                              .starting_ctl
                          }{" "}
                          →{" "}
                          {
                            (plan.structure as any).periodization_template
                              .target_ctl
                          }{" "}
                          CTL
                        </Text>
                      </View>
                      <View className="flex-row justify-between items-center">
                        <Text className="text-muted-foreground">
                          Target Date
                        </Text>
                        <Text className="font-semibold">
                          {new Date(
                            (plan.structure as any).periodization_template
                              .target_date,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </Text>
                      </View>
                    </>
                  )}
                  <View className="h-px bg-border" />
                  <TouchableOpacity
                    onPress={handleEditStructure}
                    className="pt-1"
                  >
                    <Text className="text-sm font-semibold text-primary">
                      Edit structure in composer
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">
                Deleting this training plan will permanently remove its
                structure and all associated planned activities.
              </Text>
              <Button
                variant="destructive"
                onPress={handleDeletePlan}
                disabled={deletePlanMutation.isPending}
              >
                <Icon as={Trash2} size={18} className="text-white mr-2" />
                <Text className="text-white font-semibold">
                  {deletePlanMutation.isPending
                    ? "Deleting..."
                    : "Delete Training Plan"}
                </Text>
              </Button>
            </View>
          </CardContent>
        </Card>
      </View>

      <DetailChartModal
        visible={insightModal !== null}
        onClose={() => setInsightModal(null)}
        title={insightModal === "readiness" ? "Readiness" : "Adherence"}
        defaultDateRange="30d"
      >
        {(dateRange) => {
          const days = parseDaysFromRange(dateRange);
          const filteredTimeline = insightTimelinePoints.slice(-days);
          const latestPoint = filteredTimeline[filteredTimeline.length - 1];

          return (
            <View className="gap-4">
              <View className="bg-card border border-border rounded-lg p-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <Icon
                    as={insightModal === "readiness" ? Gauge : CircleCheck}
                    size={16}
                    className="text-primary"
                  />
                  <Text className="text-sm font-semibold text-foreground">
                    Definition
                  </Text>
                </View>
                <Text className="text-xs text-muted-foreground">
                  {insightModal === "readiness"
                    ? "Readiness estimates your current load tolerance and projected goal-date capacity."
                    : "Adherence compares planned versus completed load to show how consistently your execution matches schedule."}
                </Text>
              </View>

              <View className="bg-card border border-border rounded-lg p-3 gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Interpretation
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {insightModal === "readiness"
                    ? readinessSummary?.interpretation?.trim() ||
                      `Current ${capabilityCurrentEstimate?.toFixed(1) ?? "--"} • Goal ${capabilityProjectionEstimate?.toFixed(1) ?? "--"}. Use higher confidence to trust aggressive progressions.`
                    : adherenceSummary?.interpretation?.trim() ||
                      `Current adherence ${adherenceScore ?? "--"}%. ${latestPoint?.boundary_state === "safe" ? "Load is inside your safety boundary." : latestPoint?.boundary_state === "caution" ? "Watch fatigue and adjust upcoming sessions." : "Reduce upcoming load or add recovery."}`}
                </Text>
              </View>

              <View className="bg-card border border-border rounded-lg p-3 gap-2">
                <Text className="text-sm font-semibold text-foreground">
                  Key Contributors
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {insightModal === "readiness"
                    ? formatSummaryContributors(readinessSummary) ||
                      "Recent completed load, scheduled load ahead, target-date projection, and confidence score."
                    : formatSummaryContributors(adherenceSummary) ||
                      "Actual TSS, scheduled TSS, ideal path divergence, and current boundary state."}
                </Text>
              </View>

              <PlanVsActualChart
                timeline={filteredTimeline}
                actualData={[]}
                projectedData={[]}
                showLegend
                height={260}
              />

              <Button
                onPress={
                  insightModal === "readiness"
                    ? handleEditStructure
                    : () => setInsightModal(null)
                }
              >
                <Text className="text-primary-foreground font-semibold">
                  {insightModal === "readiness"
                    ? "Recommended Action: Tune Targets"
                    : "Recommended Action: Keep Execution Tight"}
                </Text>
              </Button>
            </View>
          );
        }}
      </DetailChartModal>
    </ScrollView>
  );
}
