import { PlanCard } from "@/components/plan";
import { ListSkeleton } from "@/components/shared";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ACTIVITY_FILTER_OPTIONS } from "@/lib/constants/activities";
import { trpc } from "@/lib/trpc";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronDown, Library, Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
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

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const scheduleIntent = params.scheduleIntent === "true";

  const [activeTab, setActiveTab] = useState<"my" | "samples">("my");
  const [selectedType, setSelectedType] = useState<ActivityType>("all");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showFilterPicker, setShowFilterPicker] = useState(false);

  const queryOptions = useMemo(
    () => ({
      includeOwnOnly: activeTab === "my",
      includeSamples: activeTab === "samples",
      activityType: selectedType === "all" ? undefined : selectedType,
      limit: 10,
    }),
    [activeTab, selectedType],
  );

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
    router.push("/plan/create_activity_plan" as any);
  }, [router]);

  const handleCloseModal = useCallback(() => {
    setSelectedPlanId(null);
  }, []);

  const selectedFilterLabel = useMemo(
    () =>
      ACTIVITY_FILTER_OPTIONS.find((f) => f.value === selectedType)?.label ||
      "All",
    [selectedType],
  );

  const renderPlanCard = useCallback(
    (plan: any) => (
      <PlanCard
        key={plan.id}
        plan={{
          id: plan.id,
          name: plan.name,
          description: plan.description,
          activityType: plan.activity_category,
          estimatedDuration: plan.estimated_duration,
          estimatedTss: plan.estimated_tss,
          stepCount: plan.structure?.steps?.length || 0,
          isOwned: !!plan.profile_id,
        }}
        onPress={handlePlanTap}
      />
    ),
    [handlePlanTap],
  );

  const renderEmptyState = useCallback(() => {
    const isMyPlans = activeTab === "my";
    const message = isMyPlans
      ? selectedType === "all"
        ? "Create your first plan to get started"
        : `No ${selectedFilterLabel.toLowerCase()} plans yet`
      : "No sample plans available";

    return (
      <View className="flex-1 items-center justify-center px-6">
        <Icon
          as={Library}
          size={48}
          className="text-muted-foreground/40 mb-3"
        />
        <Text className="text-muted-foreground text-center">{message}</Text>
      </View>
    );
  }, [activeTab, selectedType, selectedFilterLabel]);

  const renderErrorState = useCallback(
    () => (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-destructive mb-2">Failed to load plans</Text>
        <TouchableOpacity onPress={handleRefresh} activeOpacity={0.7}>
          <Text className="text-primary">Tap to retry</Text>
        </TouchableOpacity>
      </View>
    ),
    [handleRefresh],
  );

  return (
    <View className="flex-1 bg-background">
      {/* Filter Bar */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm text-muted-foreground">
            {plans.length} {plans.length === 1 ? "plan" : "plans"}
          </Text>

          {/* Filter Dropdown */}
          <TouchableOpacity
            onPress={() => setShowFilterPicker(!showFilterPicker)}
            activeOpacity={0.7}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-lg bg-muted"
          >
            <Text className="text-sm font-medium">{selectedFilterLabel}</Text>
            <Icon
              as={ChevronDown}
              size={16}
              className="text-muted-foreground"
            />
          </TouchableOpacity>
        </View>

        {/* Segmented Tab Control */}
        <View className="flex-row bg-muted rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setActiveTab("my")}
            activeOpacity={0.7}
            className={`flex-1 py-2 rounded-md ${
              activeTab === "my" ? "bg-background" : ""
            }`}
          >
            <Text
              className={`text-center text-sm font-medium ${
                activeTab === "my" ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              My Plans
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab("samples")}
            activeOpacity={0.7}
            className={`flex-1 py-2 rounded-md ${
              activeTab === "samples" ? "bg-background" : ""
            }`}
          >
            <Text
              className={`text-center text-sm font-medium ${
                activeTab === "samples"
                  ? "text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              Samples
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter Picker Modal */}
      {showFilterPicker && (
        <View className="absolute top-20 right-4 bg-card border border-border rounded-lg shadow-lg z-50 min-w-[160px]">
          {ACTIVITY_FILTER_OPTIONS.map((filter) => (
            <TouchableOpacity
              key={filter.value}
              onPress={() => {
                setSelectedType(filter.value);
                setShowFilterPicker(false);
              }}
              activeOpacity={0.7}
              className="flex-row items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
            >
              <Icon
                as={filter.icon}
                size={18}
                className={
                  selectedType === filter.value
                    ? "text-primary"
                    : "text-muted-foreground"
                }
              />
              <Text
                className={`flex-1 ${
                  selectedType === filter.value
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Content */}
      <View className="flex-1">
        {error ? (
          renderErrorState()
        ) : isLoading && plans.length === 0 ? (
          <View className="flex-1 p-4">
            <ListSkeleton count={5} />
          </View>
        ) : plans.length === 0 ? (
          renderEmptyState()
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
            refreshControl={
              <RefreshControl
                refreshing={isLoading}
                onRefresh={handleRefresh}
              />
            }
          >
            {plans.map(renderPlanCard)}

            {/* Load More */}
            {hasNextPage && (
              <View className="py-4 items-center">
                {isFetchingNextPage ? (
                  <ActivityIndicator size="small" />
                ) : (
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    activeOpacity={0.7}
                    className="px-6 py-2"
                  >
                    <Text className="text-primary text-sm font-medium">
                      Load more
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* FAB - Simple Circle Button */}
      <TouchableOpacity
        onPress={handleCreatePlan}
        activeOpacity={0.8}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-primary items-center justify-center shadow-lg"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Icon as={Plus} size={28} className="text-primary-foreground" />
      </TouchableOpacity>

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
