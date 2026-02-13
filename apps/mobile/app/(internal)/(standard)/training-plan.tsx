import { UpcomingActivitiesCard } from "@/components/training-plan/UpcomingActivitiesCard";
import { WeeklyProgressCard } from "@/components/training-plan/WeeklyProgressCard";
import { PlanVsActualChart } from "@/components/charts/PlanVsActualChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Pause,
  TrendingUp,
} from "lucide-react-native";
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

export default function TrainingPlanOverview() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { id, nextStep } = useLocalSearchParams<{
    id?: string;
    nextStep?: string;
  }>();

  // Get training plan - if ID is provided, get specific plan, otherwise get active plan
  const { data: plan, isLoading: loadingPlan } =
    trpc.trainingPlans.get.useQuery(id ? { id } : undefined);

  // Get current status (CTL/ATL/TSB)
  const { data: status, isLoading: loadingStatus } =
    trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
      enabled: !!plan,
    });

  // Calculate date ranges for fitness data
  const today = useMemo(() => new Date(), []);

  // For the actual curve, get data from plan start (or 90 days ago, whichever is earlier)
  const actualStartDate = useMemo(() => {
    if (!plan) {
      const date = new Date(today);
      date.setDate(today.getDate() - 90);
      return date;
    }
    const planStart = new Date(plan.created_at);
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    return planStart < ninetyDaysAgo ? planStart : ninetyDaysAgo;
  }, [plan, today]);

  // For the ideal curve, get the target date from periodization or default to 90 days ahead
  const idealEndDate = useMemo(() => {
    if (!plan) {
      const date = new Date(today);
      date.setDate(today.getDate() + 90);
      return date;
    }
    const structure = plan.structure as any;
    const targetDate = structure?.periodization_template?.target_date;
    if (targetDate) {
      return new Date(targetDate);
    }
    const date = new Date(today);
    date.setDate(today.getDate() + 90);
    return date;
  }, [plan, today]);

  // Get actual fitness curve (from plan start to today)
  const { data: actualCurveData } = trpc.trainingPlans.getActualCurve.useQuery(
    {
      start_date: actualStartDate.toISOString().split("T")[0]!,
      end_date: today.toISOString().split("T")[0]!,
    },
    { enabled: !!plan },
  );

  // Get ideal fitness curve from training plan (from plan start to target date)
  const { data: idealCurveData } = trpc.trainingPlans.getIdealCurve.useQuery(
    {
      id: plan?.id || "",
      start_date: actualStartDate.toISOString().split("T")[0]!,
      end_date: idealEndDate.toISOString().split("T")[0]!,
    },
    {
      enabled: !!plan?.id,
    },
  );

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

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      utils.trainingPlans.get.invalidate(),
      utils.trainingPlans.getCurrentStatus.invalidate(),
    ]);
    setRefreshing(false);
  };

  const handleCreatePlan = () => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  };

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
          {nextStep === "refine" && (
            <Card className="border-primary/40 bg-primary/5 mb-4">
              <CardContent className="p-3">
                <Text className="text-sm text-primary font-semibold">
                  Refine Plan
                </Text>
                <Text className="text-xs text-muted-foreground mt-1">
                  Your plan is ready. Open plan settings any time to adjust
                  constraints, targets, and details.
                </Text>
              </CardContent>
            </Card>
          )}

          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <Text className="text-2xl font-bold mb-2">{plan.name}</Text>
              {plan.description && (
                <Text className="text-base text-muted-foreground mb-3">
                  {plan.description}
                </Text>
              )}

              {/* High-level Plan Info */}
              <View className="flex-row items-center gap-4 mb-2">
                <View className="flex-row items-center gap-1.5">
                  <View
                    className={`w-2 h-2 rounded-full ${plan.is_active ? "bg-green-500" : "bg-orange-500"}`}
                  />
                  <Text className="text-sm text-muted-foreground">
                    {plan.is_active ? "Active" : "Inactive"}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  Started{" "}
                  {new Date(plan.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)}
              className="ml-3"
            >
              <View className="bg-primary/10 rounded-full p-2">
                <Icon as={ChevronRight} size={24} className="text-primary" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Quick Stats Row */}
          <View className="flex-row gap-3">
            <View className="flex-1 bg-card border border-border rounded-lg p-3">
              <Text className="text-xs text-muted-foreground mb-1">
                Week Progress
              </Text>
              <Text className="text-lg font-bold">{planProgress.week}</Text>
            </View>
            <View className="flex-1 bg-card border border-border rounded-lg p-3">
              <Text className="text-xs text-muted-foreground mb-1">
                Adherence
              </Text>
              <Text className="text-lg font-bold">
                {status?.weekProgress?.completedActivities || 0}/
                {status?.weekProgress?.totalPlannedActivities || 0}
              </Text>
            </View>
            {status && (
              <View className="flex-1 bg-card border border-border rounded-lg p-3">
                <Text className="text-xs text-muted-foreground mb-1">
                  Fitness
                </Text>
                <Text className="text-lg font-bold">{status.ctl} CTL</Text>
              </View>
            )}
          </View>
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
                      onPress={() =>
                        router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS)
                      }
                      className="items-center py-2"
                    >
                      <Text className="text-xs text-primary">
                        Or customize manually in Settings →
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
                    This training plan is currently inactive. Go to settings to
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
                </>
              )}
            </View>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
