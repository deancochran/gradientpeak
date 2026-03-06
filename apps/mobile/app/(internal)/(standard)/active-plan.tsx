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
import { useTrainingPlanSnapshot } from "@/lib/hooks/useTrainingPlanSnapshot";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  CircleCheck,
  Gauge,
  Pause,
  Settings,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
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

export default function ActivePlanScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: activePlan, isLoading: isLoadingPlan } =
    trpc.trainingPlans.getActivePlan.useQuery();

  const updateStatusMutation =
    trpc.trainingPlans.updateActivePlanStatus.useMutation({
      onSuccess: () => {
        utils.trainingPlans.getActivePlan.invalidate();
        utils.trainingPlans.list.invalidate();
      },
      onError: (error) => {
        Alert.alert(
          "Update Failed",
          error.message || "Failed to update plan status",
        );
      },
    });

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

  const typedPlan = activePlan as any;

  const snapshot = useTrainingPlanSnapshot({
    planId: typedPlan?.id,
    includeWeeklySummaries: false,
    insightWindow: ninetyDayInsightWindow,
    timezone,
    curveWindow: "overview",
  });

  const status = snapshot.status;
  const actualCurveData = snapshot.actualCurveData;
  const idealCurveData = snapshot.idealCurveData;
  const today = useMemo(() => new Date(), []);

  const fitnessHistory = useMemo(
    () => actualCurveData?.dataPoints || [],
    [actualCurveData],
  );
  const idealFitnessCurve = useMemo(
    () => idealCurveData?.dataPoints || [],
    [idealCurveData],
  );
  const projectedFitness = useMemo(() => {
    if (!idealCurveData?.dataPoints) return [];
    const todayStr = today.toISOString().split("T")[0];
    return idealCurveData.dataPoints.filter((d) => d.date > todayStr);
  }, [idealCurveData, today]);

  const goalMetrics = useMemo(() => {
    if (!idealCurveData) return undefined;
    return {
      targetCTL: idealCurveData.targetCTL,
      targetDate: idealCurveData.targetDate,
      description: `Target: ${idealCurveData.targetCTL} CTL by ${new Date(idealCurveData.targetDate).toLocaleDateString()}`,
    };
  }, [idealCurveData]);

  const [refreshing, setRefreshing] = useState(false);
  const [insightModal, setInsightModal] = useState<
    "adherence" | "readiness" | null
  >(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      utils.trainingPlans.getActivePlan.invalidate(),
      snapshot.refetchAll(),
    ]);
    setRefreshing(false);
  };

  const handlePausePlan = () => {
    if (!activePlan) return;
    Alert.alert(
      "Pause Plan",
      "Are you sure you want to pause this plan? You can resume it later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pause",
          onPress: () => {
            updateStatusMutation.mutate({
              id: typedPlan.id,
              status: "paused",
            });
            // Go back to plan tab since there's no active plan now
            router.replace(ROUTES.PLAN.INDEX);
          },
        },
      ],
    );
  };

  const handleEndPlan = () => {
    if (!activePlan) return;
    Alert.alert(
      "End Plan",
      "Are you sure you want to end this plan? This will mark it as inactive and you will need to apply a new plan to continue training.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End Plan",
          style: "destructive",
          onPress: () => {
            updateStatusMutation.mutate({
              id: typedPlan.id,
              status: "completed",
            });
            router.replace(ROUTES.PLAN.INDEX);
          },
        },
      ],
    );
  };

  const insightTimelinePoints = useMemo(
    () => snapshot.insightTimeline?.timeline || [],
    [snapshot.insightTimeline],
  );

  const capabilityCurrentEstimate = useMemo(() => {
    const directValue = snapshot.insightTimeline?.capability?.cp_or_cs;
    if (typeof directValue === "number") return directValue;
    if (!insightTimelinePoints.length) return null;
    return insightTimelinePoints[insightTimelinePoints.length - 1]!.actual_tss;
  }, [snapshot.insightTimeline, insightTimelinePoints]);

  const capabilityProjectionEstimate = useMemo(() => {
    const directProjection =
      snapshot.insightTimeline?.projection?.at_goal_date?.projected_goal_metric;
    if (typeof directProjection === "number") return directProjection;
    if (!insightTimelinePoints.length) return null;
    return insightTimelinePoints[insightTimelinePoints.length - 1]!
      .scheduled_tss;
  }, [snapshot.insightTimeline, insightTimelinePoints]);

  const adherenceScore = useMemo(() => {
    if (!insightTimelinePoints.length) return null;
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
    if (!summary?.contributors?.length) return null;
    const contributorDetails = summary.contributors
      .map((contributor) => contributor.detail?.trim())
      .filter((detail): detail is string => Boolean(detail));
    if (contributorDetails.length > 0) return contributorDetails.join(" ");
    const contributorLabels = summary.contributors
      .map((contributor) => contributor.label?.trim())
      .filter((label): label is string => Boolean(label));
    if (contributorLabels.length > 0) return contributorLabels.join(", ");
    return null;
  };

  const parseDaysFromRange = (dateRange: DateRange): number => {
    if (dateRange === "7d") return 7;
    if (dateRange === "90d") return 90;
    if (dateRange === "all") return insightTimelinePoints.length || 30;
    return 30;
  };

  const planProgress = useMemo(() => {
    if (!typedPlan || !typedPlan.structure)
      return { week: "0/0", percentage: 0 };
    const structure = typedPlan.structure as { target_weeks?: number };
    const totalWeeks = structure.target_weeks || 16;
    const currentWeek = Math.min(
      Math.ceil(
        (Date.now() - new Date(typedPlan.created_at).getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      ),
      totalWeeks,
    );
    return {
      week: `${currentWeek}/${totalWeeks}`,
      percentage: Math.round((currentWeek / totalWeeks) * 100),
    };
  }, [activePlan]);

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

  if (isLoadingPlan || snapshot.isLoadingSharedDependencies) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-muted-foreground mt-4">
          Loading active plan...
        </Text>
      </View>
    );
  }

  if (!activePlan) {
    return (
      <View className="flex-1 bg-background items-center justify-center p-6">
        <Icon as={Activity} size={64} className="text-muted-foreground mb-4" />
        <Text className="text-xl font-bold mb-2">No Active Plan</Text>
        <Text className="text-muted-foreground text-center mb-6">
          You don't have an active training plan. Go to the library to find and
          apply one.
        </Text>
        <Button onPress={() => router.replace(ROUTES.PLAN.LIBRARY)}>
          <Text className="text-primary-foreground font-semibold">
            Browse Plans
          </Text>
        </Button>
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
      <View className="flex-1 p-4 gap-4">
        <TrainingPlanSummaryHeader
          title={typedPlan.name}
          description={typedPlan.description || undefined}
          isActive={true}
          inactiveLabel="Inactive"
          createdAt={typedPlan.created_at}
          showStatusDot
          formatStartedDate={(date) =>
            date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          }
          rightAccessory={
            <TouchableOpacity
              onPress={() =>
                router.push(
                  ROUTES.PLAN.TRAINING_PLAN.DETAIL(typedPlan.id) as any,
                )
              }
              className="bg-primary/10 rounded-full p-2"
            >
              <Icon as={Settings} size={20} className="text-primary" />
            </TouchableOpacity>
          }
        />

        <TrainingPlanKpiRow items={summaryKpis} />

        <View>
          <Text className="text-base font-semibold mb-2">
            Execution Insights
          </Text>
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

        {status?.weekProgress && (
          <WeeklyProgressCard
            completedTSS={status.weekProgress.completedTSS}
            plannedTSS={status.weekProgress.plannedTSS}
            targetTSS={status.weekProgress.targetTSS}
            completedActivities={status.weekProgress.completedActivities}
            totalPlannedActivities={status.weekProgress.totalPlannedActivities}
          />
        )}

        {status?.upcomingActivities && status.upcomingActivities.length > 0 && (
          <UpcomingActivitiesCard activities={status.upcomingActivities} />
        )}

        <Card>
          <CardHeader>
            <CardTitle>Plan Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <View className="gap-3">
              <Button
                variant="outline"
                onPress={handlePausePlan}
                disabled={updateStatusMutation.isPending}
                className="flex-row justify-center items-center gap-2"
              >
                <Icon as={Pause} size={18} className="text-foreground" />
                <Text className="font-medium text-foreground">Pause Plan</Text>
              </Button>
              <Button
                variant="destructive"
                onPress={handleEndPlan}
                disabled={updateStatusMutation.isPending}
              >
                <Text className="font-semibold text-white">End Plan</Text>
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
                      `Current ${capabilityCurrentEstimate?.toFixed(1) ?? "--"} • Goal ${capabilityProjectionEstimate?.toFixed(1) ?? "--"}`
                    : adherenceSummary?.interpretation?.trim() ||
                      `Current adherence ${adherenceScore ?? "--"}%.`}
                </Text>
              </View>

              <PlanVsActualChart
                timeline={filteredTimeline}
                actualData={[]}
                projectedData={[]}
                showLegend
                height={260}
              />
            </View>
          );
        }}
      </DetailChartModal>
    </ScrollView>
  );
}
