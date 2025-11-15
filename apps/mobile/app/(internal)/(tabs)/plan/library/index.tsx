import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  AlertCircle,
  Bike,
  Clock,
  Dumbbell,
  Footprints,
  Plus,
  Waves,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { PlanDetailModal } from "../components/modals/PlanDetailModal";

type ActivityType =
  | "all"
  | "outdoor_run"
  | "outdoor_bike"
  | "indoor_treadmill"
  | "indoor_bike_trainer"
  | "indoor_strength"
  | "indoor_swim";

const ACTIVITY_CONFIGS = {
  outdoor_run: {
    name: "Outdoor Run",
    icon: Footprints,
    color: "text-blue-600",
  },
  outdoor_bike: { name: "Outdoor Bike", icon: Bike, color: "text-green-600" },
  indoor_treadmill: {
    name: "Treadmill",
    icon: Footprints,
    color: "text-purple-600",
  },
  indoor_bike_trainer: {
    name: "Bike Trainer",
    icon: Bike,
    color: "text-orange-600",
  },
  indoor_strength: {
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
  },
  indoor_swim: { name: "Swimming", icon: Waves, color: "text-cyan-600" },
  other: { name: "Other", icon: Activity, color: "text-gray-600" },
};

const FILTER_OPTIONS = [
  { value: "all" as const, label: "All", icon: Activity },
  { value: "outdoor_run" as const, label: "Run", icon: Footprints },
  { value: "outdoor_bike" as const, label: "Bike", icon: Bike },
  { value: "indoor_strength" as const, label: "Strength", icon: Dumbbell },
];

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scheduleIntent = params.scheduleIntent === "true";

  const [activeTab, setActiveTab] = useState<"my" | "samples">("my");
  const [selectedType, setSelectedType] = useState<ActivityType>("all");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Query options memoized for performance
  const queryOptions = useMemo(
    () => ({
      includeOwnOnly: activeTab === "my",
      includeSamples: activeTab === "samples",
      activityType: selectedType === "all" ? undefined : selectedType,
      limit: 10,
    }),
    [activeTab, selectedType],
  );

  // tRPC queries - unified approach
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = trpc.activityPlans.list.useInfiniteQuery(queryOptions, {
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const plans = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  // Memoized callbacks
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handlePlanTap = useCallback((planId: string) => {
    setSelectedPlanId(planId);
  }, []);

  const handleCreatePlan = useCallback(() => {
    router.push("/(internal)/(tabs)/plan/create_activity_plan");
  }, [router]);

  const handleSchedulePlan = useCallback(
    (planId: string) => {
      router.push({
        pathname: "/(internal)/(tabs)/plan/create_planned_activity",
        params: { activityPlanId: planId },
      });
    },
    [router],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  // Render functions
  const renderPlanCard = useCallback(
    (plan: any) => {
      const config =
        ACTIVITY_CONFIGS[plan.activity_type as keyof typeof ACTIVITY_CONFIGS] ||
        ACTIVITY_CONFIGS.other;
      const isUserPlan = !!plan.profile_id;

      return (
        <TouchableOpacity
          key={plan.id}
          onPress={() => handlePlanTap(plan.id)}
          activeOpacity={0.7}
        >
          <Card>
            <CardContent className="p-4">
              <View className="flex flex-row items-start gap-3">
                {/* Icon */}
                <View className="w-11 h-11 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon as={config.icon} size={20} className={config.color} />
                </View>

                {/* Content */}
                <View className="flex-1 min-w-0">
                  {/* Title Row */}
                  <View className="flex flex-row items-start justify-between gap-2 mb-1">
                    <Text
                      className="text-base font-semibold flex-1"
                      numberOfLines={2}
                    >
                      {plan.name}
                    </Text>
                    {isUserPlan && (
                      <View className="bg-primary/10 px-2 py-0.5 rounded-full">
                        <Text className="text-xs text-primary font-medium">
                          Yours
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Type */}
                  <Text className="text-sm text-muted-foreground mb-2">
                    {config.name}
                  </Text>

                  {/* Description */}
                  {plan.description && (
                    <Text
                      className="text-sm text-muted-foreground mb-3"
                      numberOfLines={2}
                    >
                      {plan.description}
                    </Text>
                  )}

                  {/* Metadata Row */}
                  <View className="flex flex-row items-center gap-3 flex-wrap">
                    {plan.estimated_duration && (
                      <View className="flex flex-row items-center">
                        <Icon
                          as={Clock}
                          size={14}
                          className="text-muted-foreground mr-1"
                        />
                        <Text className="text-xs text-muted-foreground">
                          {plan.estimated_duration}m
                        </Text>
                      </View>
                    )}

                    {plan.estimated_tss && (
                      <Text className="text-xs text-muted-foreground">
                        TSS {plan.estimated_tss}
                      </Text>
                    )}

                    {plan.structure?.steps && (
                      <Text className="text-xs text-muted-foreground">
                        {plan.structure.steps.length} steps
                      </Text>
                    )}
                  </View>

                  {/* Schedule Button */}
                  {scheduleIntent && (
                    <Button
                      size="sm"
                      onPress={() => handleSchedulePlan(plan.id)}
                      className="mt-3 self-start"
                    >
                      <Text className="text-primary-foreground">Schedule</Text>
                    </Button>
                  )}
                </View>
              </View>
            </CardContent>
          </Card>
        </TouchableOpacity>
      );
    },
    [scheduleIntent, handlePlanTap, handleSchedulePlan],
  );

  const renderEmptyState = useCallback(() => {
    const isMyPlans = activeTab === "my";
    const filterLabel = FILTER_OPTIONS.find(
      (f) => f.value === selectedType,
    )?.label.toLowerCase();

    return (
      <View className="flex-1 flex items-center justify-center px-6 py-12">
        <Icon
          as={isMyPlans ? Plus : Activity}
          size={56}
          className="text-muted-foreground/50 mb-4"
        />
        <Text className="text-xl font-semibold mb-2 text-center">
          {isMyPlans ? "No Plans Yet" : "No Samples Available"}
        </Text>
        <Text className="text-muted-foreground text-center mb-6 max-w-sm">
          {isMyPlans
            ? selectedType === "all"
              ? "Create your first activity plan to get started."
              : `No ${filterLabel} plans found. Create one or view all types.`
            : selectedType === "all"
              ? "Sample plans will appear here when available."
              : `No sample ${filterLabel} plans available yet.`}
        </Text>
        {isMyPlans && (
          <Button onPress={handleCreatePlan} size="lg">
            <Icon
              as={Plus}
              size={18}
              className="text-primary-foreground mr-2"
            />
            <Text className="text-primary-foreground font-medium">
              Create Plan
            </Text>
          </Button>
        )}
      </View>
    );
  }, [activeTab, selectedType, handleCreatePlan]);

  const renderErrorState = useCallback(
    () => (
      <View className="flex-1 flex items-center justify-center px-6 py-12">
        <Icon as={AlertCircle} size={56} className="text-destructive/70 mb-4" />
        <Text className="text-xl font-semibold mb-2 text-center">
          Failed to Load
        </Text>
        <Text className="text-muted-foreground text-center mb-6 max-w-sm">
          {error?.message || "Something went wrong. Please try again."}
        </Text>
        <Button onPress={handleRefresh} variant="outline" size="lg">
          <Text>Try Again</Text>
        </Button>
      </View>
    ),
    [error, handleRefresh],
  );

  const renderLoadingFooter = useCallback(() => {
    if (!hasNextPage) return null;

    return (
      <View className="py-4 flex items-center">
        {isFetchingNextPage ? (
          <View className="flex items-center">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-muted-foreground mt-2">
              Loading...
            </Text>
          </View>
        ) : (
          <Button variant="outline" onPress={handleLoadMore}>
            <Text>Load More</Text>
          </Button>
        )}
      </View>
    );
  }, [hasNextPage, isFetchingNextPage, handleLoadMore]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold mb-1">Activity Library</Text>
        <Text className="text-sm text-muted-foreground">
          {scheduleIntent
            ? "Select a plan to schedule"
            : "Browse and manage your plans"}
        </Text>
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 mb-3"
        contentContainerStyle={{ gap: 8 }}
      >
        {FILTER_OPTIONS.map((filter) => {
          const isSelected = selectedType === filter.value;
          return (
            <Button
              key={filter.value}
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onPress={() => setSelectedType(filter.value)}
              className="flex flex-row items-center gap-2"
            >
              <Icon
                as={filter.icon}
                size={16}
                className={
                  isSelected ? "text-primary-foreground" : "text-foreground"
                }
              />
              <Text
                className={
                  isSelected ? "text-primary-foreground" : "text-foreground"
                }
              >
                {filter.label}
              </Text>
            </Button>
          );
        })}
      </ScrollView>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "my" | "samples")}
        className="flex-1"
      >
        <TabsList className="mx-4 mb-3">
          <TabsTrigger value="my" className="flex-1">
            <Text>My Plans</Text>
          </TabsTrigger>
          <TabsTrigger value="samples" className="flex-1">
            <Text>Samples</Text>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="flex-1">
          {error ? (
            renderErrorState()
          ) : isLoading && plans.length === 0 ? (
            <View className="flex-1 flex items-center justify-center">
              <ActivityIndicator size="large" />
              <Text className="mt-3 text-sm text-muted-foreground">
                Loading plans...
              </Text>
            </View>
          ) : plans.length === 0 ? (
            renderEmptyState()
          ) : (
            <ScrollView
              className="flex-1 px-4"
              contentContainerStyle={{ gap: 12, paddingBottom: 80 }}
              refreshControl={
                <RefreshControl
                  refreshing={isLoading}
                  onRefresh={handleRefresh}
                />
              }
            >
              <Text className="text-xs text-muted-foreground uppercase tracking-wide">
                {plans.length} {plans.length === 1 ? "Plan" : "Plans"}
              </Text>
              {plans.map(renderPlanCard)}
              {renderLoadingFooter()}
            </ScrollView>
          )}
        </TabsContent>
      </Tabs>

      {/* FAB */}
      <View className="absolute bottom-6 right-6">
        <TouchableOpacity
          onPress={handleCreatePlan}
          activeOpacity={0.8}
          className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg"
        >
          <Icon as={Plus} size={28} className="text-primary-foreground" />
        </TouchableOpacity>
      </View>

      {/* Modal */}
      {selectedPlanId && (
        <PlanDetailModal
          planId={selectedPlanId}
          isVisible={!!selectedPlanId}
          onClose={handleCloseModal}
          scheduleIntent={scheduleIntent}
        />
      )}
    </View>
  );
}
