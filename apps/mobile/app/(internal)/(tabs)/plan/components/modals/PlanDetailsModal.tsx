import { ErrorBoundary, ModalErrorFallback } from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { trpc } from "@/lib/trpc";
import { useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Heart,
  Settings,
  TrendingUp,
  X,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

interface PlanDetailsModalProps {
  isVisible: boolean;
  onClose: () => void;
}

const formConfig = {
  fresh: {
    label: "Fresh",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Well rested, ready for hard training",
  },
  optimal: {
    label: "Optimal",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    description: "Good balance of fitness and freshness",
  },
  neutral: {
    label: "Neutral",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Moderate training stress",
  },
  tired: {
    label: "Tired",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Accumulated fatigue, consider recovery",
  },
  overreaching: {
    label: "Overreaching",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    description: "High fatigue, recovery needed",
  },
};

function PlanDetailsModalContent({
  isVisible,
  onClose,
}: PlanDetailsModalProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Get training plan
  const {
    data: plan,
    isLoading: loadingPlan,
    refetch: refetchPlan,
  } = trpc.trainingPlans.get.useQuery(undefined, { enabled: isVisible });

  // Get current status (CTL/ATL/TSB)
  const {
    data: status,
    isLoading: loadingStatus,
    refetch: refetchStatus,
  } = trpc.trainingPlans.getCurrentStatus.useQuery(undefined, {
    enabled: isVisible && !!plan,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchPlan(), refetchStatus()]);
    setRefreshing(false);
  };

  const handleSettings = () => {
    onClose();
    setTimeout(() => {
      router.push(ROUTES.PLAN.TRAINING_PLAN.SETTINGS);
    }, 300);
  };

  const handleViewTrends = () => {
    onClose();
    setTimeout(() => {
      router.push(ROUTES.TRENDS);
    }, 300);
  };

  // Derive plan progress
  const planProgress = useMemo(() => {
    if (!plan || !plan.structure) return { week: "0/0", percentage: 0 };

    const totalWeeks = (plan.structure as any).target_weeks || 16;
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

  const formInfo = status?.form ? formConfig[status.form] : formConfig.neutral;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      transparent={false}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-12 pb-4 border-b border-border bg-card">
          <View className="flex-1 mr-3">
            <Text className="text-xl font-bold" numberOfLines={1}>
              {plan?.name || "Training Plan"}
            </Text>
            {plan?.description && (
              <Text
                className="text-sm text-muted-foreground mt-1"
                numberOfLines={2}
              >
                {plan.description}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            className="w-10 h-10 items-center justify-center"
          >
            <Icon as={X} size={24} className="text-muted-foreground" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loadingPlan ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" />
            <Text className="text-muted-foreground mt-4">
              Loading training plan...
            </Text>
          </View>
        ) : !plan ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-lg font-semibold mb-2">No Training Plan</Text>
            <Text className="text-muted-foreground text-center mb-4">
              You don't have an active training plan
            </Text>
            <Button onPress={onClose}>
              <Text className="text-primary-foreground">Close</Text>
            </Button>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="p-4"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
              />
            }
          >
            {/* Settings Button */}
            <TouchableOpacity
              onPress={handleSettings}
              className="mb-4 flex-row items-center justify-between p-3 bg-muted rounded-lg"
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-2">
                <Icon as={Settings} size={20} className="text-foreground" />
                <Text className="font-medium">Plan Settings</Text>
              </View>
              <Icon
                as={ChevronRight}
                size={20}
                className="text-muted-foreground"
              />
            </TouchableOpacity>

            {/* Current Status Card */}
            {loadingStatus ? (
              <Card className="mb-4">
                <CardContent className="p-6">
                  <View className="items-center justify-center py-8">
                    <ActivityIndicator size="small" />
                    <Text className="text-sm text-muted-foreground mt-2">
                      Calculating fitness metrics...
                    </Text>
                  </View>
                </CardContent>
              </Card>
            ) : status ? (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>Current Training Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="gap-4">
                    {/* Form Status Banner */}
                    <View className={`${formInfo.bgColor} rounded-lg p-4`}>
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className={`text-lg font-bold ${formInfo.color}`}>
                          {formInfo.label}
                        </Text>
                        <Text
                          className={`text-2xl font-bold ${formInfo.color}`}
                        >
                          TSB: {status.tsb > 0 ? "+" : ""}
                          {status.tsb}
                        </Text>
                      </View>
                      <Text className="text-sm text-muted-foreground">
                        {formInfo.description}
                      </Text>
                    </View>

                    {/* Metrics Grid */}
                    <View className="flex-row gap-3">
                      <View className="flex-1 bg-muted/30 rounded-lg p-4">
                        <View className="flex-row items-center gap-2 mb-2">
                          <Icon
                            as={TrendingUp}
                            size={18}
                            className="text-blue-500"
                          />
                          <Text className="text-xs text-muted-foreground font-medium">
                            CTL
                          </Text>
                        </View>
                        <Text className="text-2xl font-bold mb-1">
                          {status.ctl}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Fitness
                        </Text>
                      </View>

                      <View className="flex-1 bg-muted/30 rounded-lg p-4">
                        <View className="flex-row items-center gap-2 mb-2">
                          <Icon as={Heart} size={18} className="text-red-500" />
                          <Text className="text-xs text-muted-foreground font-medium">
                            ATL
                          </Text>
                        </View>
                        <Text className="text-2xl font-bold mb-1">
                          {status.atl}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Fatigue
                        </Text>
                      </View>

                      <View className="flex-1 bg-muted/30 rounded-lg p-4">
                        <View className="flex-row items-center gap-2 mb-2">
                          <Icon
                            as={Activity}
                            size={18}
                            className={formInfo.color}
                          />
                          <Text className="text-xs text-muted-foreground font-medium">
                            TSB
                          </Text>
                        </View>
                        <Text
                          className={`text-2xl font-bold mb-1 ${formInfo.color}`}
                        >
                          {status.tsb > 0 ? "+" : ""}
                          {status.tsb}
                        </Text>
                        <Text className="text-xs text-muted-foreground">
                          Form
                        </Text>
                      </View>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ) : null}

            {/* Weekly Progress */}
            {status?.weekProgress && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>This Week's Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <View className="gap-3">
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted-foreground">
                        TSS Progress
                      </Text>
                      <Text className="font-semibold">
                        {status.weekProgress.completedTSS} /{" "}
                        {status.weekProgress.targetTSS}
                      </Text>
                    </View>
                    <View className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <View
                        className="bg-primary h-full"
                        style={{
                          width: `${Math.min(
                            100,
                            (status.weekProgress.completedTSS /
                              status.weekProgress.targetTSS) *
                              100,
                          )}%`,
                        }}
                      />
                    </View>
                    <View className="flex-row justify-between items-center">
                      <Text className="text-muted-foreground">Activities</Text>
                      <Text className="font-semibold">
                        {status.weekProgress.completedActivities} /{" "}
                        {status.weekProgress.totalPlannedActivities}
                      </Text>
                    </View>
                  </View>
                </CardContent>
              </Card>
            )}

            {/* Plan Progress */}
            <Card className="mb-4">
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

            {/* Plan Details */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Training Plan Details</CardTitle>
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
                          Rest Days per Week
                        </Text>
                        <Text className="font-semibold">
                          {(plan.structure as any).min_rest_days_per_week}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <View className="gap-3 mt-2">
              <Button
                variant="outline"
                size="lg"
                onPress={handleViewTrends}
                className="flex-row items-center justify-center gap-2"
              >
                <Icon as={TrendingUp} size={20} className="text-foreground" />
                <Text className="text-foreground font-semibold">
                  View Trends
                </Text>
              </Button>
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export function PlanDetailsModal(props: PlanDetailsModalProps) {
  return (
    <ErrorBoundary fallback={ModalErrorFallback}>
      <PlanDetailsModalContent {...props} />
    </ErrorBoundary>
  );
}
