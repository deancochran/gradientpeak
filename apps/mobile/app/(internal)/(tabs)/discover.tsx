import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import {
  Activity,
  Bike,
  ChevronRight,
  Dumbbell,
  Footprints,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
  Waves,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

const TABS = [
  { id: "activityPlans", label: "Activity Plans", icon: Activity },
  { id: "trainingPlans", label: "Training Plans", icon: Dumbbell },
  { id: "routes", label: "Routes", icon: MapPin },
  { id: "users", label: "Profiles", icon: Users },
] as const;

export type TabType = (typeof TABS)[number]["id"];

const TAB_COPY: Record<
  TabType,
  {
    placeholder: string;
    resultsLabel: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  activityPlans: {
    placeholder: "Search activity plans",
    resultsLabel: "activity plans",
    emptyTitle: "No matching plans",
    emptyDescription: "Try another search or adjust filters.",
  },
  trainingPlans: {
    placeholder: "Search training plans",
    resultsLabel: "training plans",
    emptyTitle: "No matching training plans",
    emptyDescription: "Try another search or adjust filters.",
  },
  routes: {
    placeholder: "Search your routes",
    resultsLabel: "routes",
    emptyTitle: "No matching routes",
    emptyDescription: "Try another search or adjust filters.",
  },
  users: {
    placeholder: "Search profiles",
    resultsLabel: "profiles",
    emptyTitle: "No profiles found",
    emptyDescription: "Try a username or a shorter search term.",
  },
};

const CATEGORIES = [
  {
    id: "run",
    name: "Running",
    icon: Footprints,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    description: "Easy runs, workouts, and long efforts.",
  },
  {
    id: "bike",
    name: "Cycling",
    icon: Bike,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    description: "Endurance rides, intervals, and trainer sessions.",
  },
  {
    id: "swim",
    name: "Swimming",
    icon: Waves,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    description: "Pool sets and swim-focused sessions.",
  },
  {
    id: "strength",
    name: "Strength",
    icon: Dumbbell,
    color: "text-red-600",
    bgColor: "bg-red-50",
    description: "Strength and supporting gym work.",
  },
  {
    id: "other",
    name: "Other",
    icon: Activity,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    description: "Mixed or non-standard activity types.",
  },
] as const;

const TRAINING_PLAN_SPORT_OPTIONS = [
  { id: "run", label: "Running" },
  { id: "bike", label: "Cycling" },
  { id: "swim", label: "Swimming" },
  { id: "strength", label: "Strength" },
  { id: "other", label: "Other" },
] as const;

const TRAINING_PLAN_EXPERIENCE_OPTIONS = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
] as const;

const TRAINING_PLAN_DURATION_PRESETS = [
  { id: "4-8", label: "4-8 weeks", minWeeks: 4, maxWeeks: 8 },
  { id: "8-12", label: "8-12 weeks", minWeeks: 8, maxWeeks: 12 },
  { id: "12+", label: "12+ weeks", minWeeks: 12, maxWeeks: undefined },
] as const;

const ROUTE_CATEGORY_LABELS: Record<string, string> = {
  run: "Run",
  bike: "Ride",
  swim: "Swim",
  strength: "Strength",
  other: "Other",
  outdoor_run: "Run",
  outdoor_bike: "Ride",
  indoor_treadmill: "Treadmill",
  indoor_bike_trainer: "Trainer",
};

type DiscoverCategoryId = (typeof CATEGORIES)[number]["id"];

type ActivityPlanFilters = {
  categoryId: DiscoverCategoryId | null;
};

type TrainingPlanFilters = {
  sport: DiscoverCategoryId | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | null;
  durationPreset: "4-8" | "8-12" | "12+" | null;
};

type RouteFilters = {
  categoryId: DiscoverCategoryId | null;
};

const DEFAULT_ACTIVITY_PLAN_FILTERS: ActivityPlanFilters = { categoryId: null };
const DEFAULT_TRAINING_PLAN_FILTERS: TrainingPlanFilters = {
  sport: null,
  experienceLevel: null,
  durationPreset: null,
};
const DEFAULT_ROUTE_FILTERS: RouteFilters = { categoryId: null };

function useDebounce(value: string, delay: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function getDiscoverResultsListId(tab: TabType) {
  switch (tab) {
    case "activityPlans":
      return "discover-activity-plans-list";
    case "trainingPlans":
      return "discover-training-plans-list";
    case "routes":
      return "discover-routes-list";
    case "users":
      return "discover-users-list";
    default:
      return "discover-results-list";
  }
}

function hasActivityPlanFilters(filters: ActivityPlanFilters) {
  return Boolean(filters.categoryId);
}

function hasTrainingPlanFilters(filters: TrainingPlanFilters) {
  return Boolean(filters.sport || filters.experienceLevel || filters.durationPreset);
}

function hasRouteFilters(filters: RouteFilters) {
  return Boolean(filters.categoryId);
}

function getDurationRange(
  preset: TrainingPlanFilters["durationPreset"],
): { minWeeks?: number; maxWeeks?: number } {
  const match = TRAINING_PLAN_DURATION_PRESETS.find((option) => option.id === preset);
  if (!match) {
    return {};
  }

  return {
    minWeeks: match.minWeeks,
    maxWeeks: match.maxWeeks,
  };
}

export default function DiscoverPage() {
  const navigateTo = useAppNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("activityPlans");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [activityPlanFilters, setActivityPlanFilters] =
    useState<ActivityPlanFilters>(DEFAULT_ACTIVITY_PLAN_FILTERS);
  const [trainingPlanFilters, setTrainingPlanFilters] =
    useState<TrainingPlanFilters>(DEFAULT_TRAINING_PLAN_FILTERS);
  const [routeFilters, setRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [draftActivityPlanFilters, setDraftActivityPlanFilters] =
    useState<ActivityPlanFilters>(DEFAULT_ACTIVITY_PLAN_FILTERS);
  const [draftTrainingPlanFilters, setDraftTrainingPlanFilters] =
    useState<TrainingPlanFilters>(DEFAULT_TRAINING_PLAN_FILTERS);
  const [draftRouteFilters, setDraftRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const isSearchMode = debouncedSearch.trim() !== "";
  const showFilterButton = activeTab !== "users";
  const selectedActivityCategory =
    CATEGORIES.find((category) => category.id === activityPlanFilters.categoryId) ?? null;
  const selectedRouteCategory =
    CATEGORIES.find((category) => category.id === routeFilters.categoryId) ?? null;
  const trainingPlanDurationRange = getDurationRange(trainingPlanFilters.durationPreset);

  const activityPlansInfiniteQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
      includeEstimation: false,
      ownerScope: "all",
      search: debouncedSearch || undefined,
      activityCategory: activityPlanFilters.categoryId || undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const trainingPlansQuery = api.trainingPlans.listTemplates.useQuery({
    search: debouncedSearch || undefined,
    sport: trainingPlanFilters.sport || undefined,
    experience_level: trainingPlanFilters.experienceLevel || undefined,
    min_weeks: trainingPlanDurationRange.minWeeks,
    max_weeks: trainingPlanDurationRange.maxWeeks,
  });

  const routesInfiniteQuery = api.routes.list.useInfiniteQuery(
    {
      search: debouncedSearch || undefined,
      activityCategory: routeFilters.categoryId || undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const usersQuery = api.social.searchUsers.useQuery({
    query: debouncedSearch || undefined,
    limit: 20,
    offset: 0,
  });

  const activityPlans = useMemo(() => {
    return activityPlansInfiniteQuery.data?.pages.flatMap((page) => page.items) || [];
  }, [activityPlansInfiniteQuery.data]);

  const routes = useMemo(() => {
    return routesInfiniteQuery.data?.pages.flatMap((page) => page.items) || [];
  }, [routesInfiniteQuery.data]);

  const trainingPlans = trainingPlansQuery.data || [];
  const users = usersQuery.data?.users || [];

  const tabCounts = useMemo(
    () => ({
      activityPlans: activityPlans.length,
      trainingPlans: trainingPlans.length,
      routes: routes.length,
      users: users.length,
    }),
    [activityPlans.length, trainingPlans.length, routes.length, users.length],
  );

  const activeTabHasFilters = useMemo(() => {
    switch (activeTab) {
      case "activityPlans":
        return hasActivityPlanFilters(activityPlanFilters);
      case "trainingPlans":
        return hasTrainingPlanFilters(trainingPlanFilters);
      case "routes":
        return hasRouteFilters(routeFilters);
      case "users":
        return false;
      default:
        return false;
    }
  }, [activeTab, activityPlanFilters, trainingPlanFilters, routeFilters]);

  const handleTemplatePress = (template: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    } as any);
  };

  const handleTrainingPlanPress = (template: any) => {
    navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(template.id) as any);
  };

  const handleRoutePress = (route: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/route-detail",
      params: {
        id: route.id,
      },
    } as any);
  };

  const handleUserPress = (user: any) => {
    navigateTo({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: {
        userId: user.id,
      },
    } as any);
  };

  const syncDraftFiltersFromApplied = useCallback(() => {
    setDraftActivityPlanFilters(activityPlanFilters);
    setDraftTrainingPlanFilters(trainingPlanFilters);
    setDraftRouteFilters(routeFilters);
  }, [activityPlanFilters, trainingPlanFilters, routeFilters]);

  const handleOpenFilterSheet = () => {
    if (!showFilterButton) {
      return;
    }

    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(true);
  };

  const handleCloseFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(false);
  };

  const handleApplyFilters = () => {
    switch (activeTab) {
      case "activityPlans":
        setActivityPlanFilters(draftActivityPlanFilters);
        break;
      case "trainingPlans":
        setTrainingPlanFilters(draftTrainingPlanFilters);
        break;
      case "routes":
        setRouteFilters(draftRouteFilters);
        break;
      case "users":
        break;
    }

    setIsFilterSheetOpen(false);
  };

  const handleResetDraftFilters = () => {
    switch (activeTab) {
      case "activityPlans":
        setDraftActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
        break;
      case "trainingPlans":
        setDraftTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
        break;
      case "routes":
        setDraftRouteFilters(DEFAULT_ROUTE_FILTERS);
        break;
      case "users":
        break;
    }
  };

  const handleResetActiveTabFilters = useCallback(() => {
    switch (activeTab) {
      case "activityPlans":
        setActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
        break;
      case "trainingPlans":
        setTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
        break;
      case "routes":
        setRouteFilters(DEFAULT_ROUTE_FILTERS);
        break;
      case "users":
        break;
    }
  }, [activeTab]);

  const handleEmptyStateAction = () => {
    if (isSearchMode) {
      setSearchQuery("");
    }

    if (activeTabHasFilters) {
      handleResetActiveTabFilters();
    }
  };

  const renderTabBar = () => (
    <View className="border-b border-border bg-background px-4 pt-3 pb-3">
      <Text className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Browse by type
      </Text>
      <View className="flex-row rounded-2xl border border-border bg-muted/20 p-1.5">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = tabCounts[tab.id];
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              testID={`discover-tab-${tab.id}`}
              className={`flex-1 items-center justify-center gap-1.5 rounded-xl px-1 py-2.5 ${
                isActive ? "bg-background shadow-sm" : "bg-transparent"
              }`}
              activeOpacity={0.8}
            >
              <View className="flex-row items-center justify-center gap-1.5">
                <Icon
                  as={tab.icon}
                  size={16}
                  className={isActive ? "text-foreground" : "text-muted-foreground"}
                />
                <Text
                  className={`text-xs font-medium ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </View>
              <Text
                className={`text-[11px] ${
                  isActive ? "text-foreground/70" : "text-muted-foreground"
                }`}
              >
                {count} {count === 1 ? "item" : "items"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSearchInput = () => {
    const activeCopy = TAB_COPY[activeTab];
    const clearButtonRight = showFilterButton ? 52 : 14;

    return (
      <View className="px-4 pt-4 pb-3 border-b border-border bg-background">
        <View className="relative rounded-2xl border border-border bg-card">
          <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            placeholder={activeCopy.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className={`h-12 border-0 bg-transparent pl-10 ${showFilterButton ? "pr-24" : "pr-10"}`}
            testID="discover-search-input"
          />

          {searchQuery.length > 0 ? (
            <TouchableOpacity
              className="absolute top-1/2 -translate-y-1/2"
              style={{ right: clearButtonRight }}
              onPress={() => setSearchQuery("")}
              activeOpacity={0.8}
              testID="discover-search-clear"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </TouchableOpacity>
          ) : null}

          {showFilterButton ? (
            <TouchableOpacity
              className={`absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border ${
                activeTabHasFilters
                  ? "border-primary bg-primary"
                  : "border-border bg-background"
              }`}
              onPress={handleOpenFilterSheet}
              activeOpacity={0.85}
              testID="discover-filter-button"
              accessibilityState={{ selected: activeTabHasFilters }}
            >
              <Icon
                as={SlidersHorizontal}
                size={16}
                className={activeTabHasFilters ? "text-primary-foreground" : "text-foreground"}
              />
              {activeTabHasFilters ? (
                <View
                  className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-background"
                  testID="discover-filter-button-dot"
                />
              ) : null}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderLoadingSkeleton = () => (
    <View className="p-4 gap-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />
      ))}
    </View>
  );

  const renderEmptyState = (tab: TabType) => {
    const actionLabel = isSearchMode && activeTabHasFilters
      ? "Clear search & filters"
      : activeTabHasFilters
        ? "Reset filters"
        : isSearchMode
          ? "Clear search"
          : undefined;

    return (
      <View className="px-4 py-12">
        <EmptyStateCard
          icon={Search}
          title={TAB_COPY[tab].emptyTitle}
          description={TAB_COPY[tab].emptyDescription}
          actionLabel={actionLabel}
          onAction={actionLabel ? handleEmptyStateAction : undefined}
        />
      </View>
    );
  };

  const renderResultsHeader = (title: string, description: string, count: number, noun: string) => (
    <View className="mb-4 gap-1.5">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      <Text className="text-sm text-muted-foreground">{description}</Text>
      <Text className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mt-1">
        {count} {noun}
        {count === 1 ? "" : "s"}
      </Text>
    </View>
  );

  const renderNeutralStateHeader = (title: string, description: string) => (
    <View className="mb-5 gap-2">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
    </View>
  );

  const renderActivityPlansContent = () => {
    if (activityPlansInfiniteQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (!isSearchMode && !hasActivityPlanFilters(activityPlanFilters)) {
      if (activityPlans.length === 0) {
        return renderEmptyState("activityPlans");
      }

      return (
        <FlatList
          testID="discover-activity-plans-list"
          data={activityPlans.slice(0, 8)}
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderNeutralStateHeader(
            "Search anything in Discover",
            "Start with a plan, or use search and filters when you know what you want to narrow down.",
          )}
          renderItem={({ item }) => (
            <ActivityPlanCard
              activityPlan={item as any}
              onPress={() => handleTemplatePress(item)}
              variant="default"
            />
          )}
        />
      );
    }

    if (activityPlans.length === 0) {
      return renderEmptyState("activityPlans");
    }

    const headerTitle = selectedActivityCategory
      ? `${selectedActivityCategory.name} plans`
      : isSearchMode
        ? "Plan matches"
        : "All activity plans";
    const headerDescription = selectedActivityCategory
      ? selectedActivityCategory.description
      : isSearchMode
        ? "Open any session to inspect the structure, route, and scheduling options."
        : "Browse every available activity plan in one place.";

    return (
      <FlatList
        testID="discover-activity-plans-list"
        data={activityPlans}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderResultsHeader(
          headerTitle,
          headerDescription,
          activityPlans.length,
          "plan",
        )}
        renderItem={({ item }) => (
          <ActivityPlanCard
            activityPlan={item as any}
            onPress={() => handleTemplatePress(item)}
            variant="default"
          />
        )}
        ListEmptyComponent={renderEmptyState("activityPlans")}
        onRefresh={() => activityPlansInfiniteQuery.refetch()}
        refreshing={activityPlansInfiniteQuery.isRefetching}
        onEndReached={() => {
          if (
            activityPlansInfiniteQuery.hasNextPage &&
            !activityPlansInfiniteQuery.isFetchingNextPage
          ) {
            activityPlansInfiniteQuery.fetchNextPage();
          }
        }}
        ListFooterComponent={
          activityPlansInfiniteQuery.hasNextPage ? (
            <View className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onPress={() => activityPlansInfiniteQuery.fetchNextPage()}
                disabled={activityPlansInfiniteQuery.isFetchingNextPage}
              >
                <Text className="text-foreground">
                  {activityPlansInfiniteQuery.isFetchingNextPage ? "Loading more..." : "Load More"}
                </Text>
              </Button>
            </View>
          ) : null
        }
      />
    );
  };

  const renderTrainingPlansContent = () => {
    if (trainingPlansQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (trainingPlans.length === 0) {
      return renderEmptyState("trainingPlans");
    }

    const hasFilters = hasTrainingPlanFilters(trainingPlanFilters);
    const isNeutralState = !isSearchMode && !hasFilters;

    return (
      <FlatList
        testID="discover-training-plans-list"
        data={trainingPlans}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          isNeutralState
            ? renderNeutralStateHeader(
                "Search anything in Discover",
                "Browse a few training templates, or use search and filters when you know the structure you want.",
              )
            : renderResultsHeader(
                "Training plan results",
                "Compare commitment, cadence, and focus before you open a plan.",
                trainingPlans.length,
                "template",
              )
        }
        renderItem={({ item }) => (
          <TrainingPlanCard template={item} onPress={() => handleTrainingPlanPress(item)} />
        )}
        ListEmptyComponent={renderEmptyState("trainingPlans")}
        onRefresh={() => trainingPlansQuery.refetch()}
        refreshing={trainingPlansQuery.isRefetching}
      />
    );
  };

  const renderRoutesContent = () => {
    if (routesInfiniteQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (routes.length === 0) {
      return renderEmptyState("routes");
    }

    const headerTitle = selectedRouteCategory
      ? `${selectedRouteCategory.name} routes`
      : isSearchMode
        ? "Route matches"
        : "Saved routes";
    const isNeutralState = !isSearchMode && !hasRouteFilters(routeFilters);

    return (
      <FlatList
        testID="discover-routes-list"
        data={routes}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          isNeutralState
            ? renderNeutralStateHeader(
                "Search anything in Discover",
                "Start with a few saved routes, or search when you know the name, distance, or type you want.",
              )
            : renderResultsHeader(
                headerTitle,
                "Open a route when the distance and climbing feel like the right fit.",
                routes.length,
                "route",
              )
        }
        renderItem={({ item }) => <RouteCard route={item} onPress={() => handleRoutePress(item)} />}
        ListEmptyComponent={renderEmptyState("routes")}
        onRefresh={() => routesInfiniteQuery.refetch()}
        refreshing={routesInfiniteQuery.isRefetching}
        onEndReached={() => {
          if (routesInfiniteQuery.hasNextPage && !routesInfiniteQuery.isFetchingNextPage) {
            routesInfiniteQuery.fetchNextPage();
          }
        }}
        ListFooterComponent={
          routesInfiniteQuery.hasNextPage ? (
            <View className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                onPress={() => routesInfiniteQuery.fetchNextPage()}
                disabled={routesInfiniteQuery.isFetchingNextPage}
              >
                <Text className="text-foreground">
                  {routesInfiniteQuery.isFetchingNextPage ? "Loading more..." : "Load More"}
                </Text>
              </Button>
            </View>
          ) : null
        }
      />
    );
  };

  const renderUsersContent = () => {
    if (usersQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (users.length === 0) {
      return renderEmptyState("users");
    }

    return (
      <FlatList
        testID="discover-users-list"
        data={users}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          isSearchMode
            ? renderResultsHeader(
                "Profiles",
                "Profiles stay simple here: open one to decide whether you want to follow or message.",
                users.length,
                "profile",
              )
            : renderNeutralStateHeader(
                "Search anything in Discover",
                "Search profiles directly when you know who you want to find.",
              )
        }
        renderItem={({ item }) => <UserCard user={item} onPress={() => handleUserPress(item)} />}
        ListEmptyComponent={renderEmptyState("users")}
        onRefresh={() => usersQuery.refetch()}
        refreshing={usersQuery.isRefetching}
      />
    );
  };

  const renderContent = () => {
    switch (activeTab) {
      case "activityPlans":
        return renderActivityPlansContent();
      case "trainingPlans":
        return renderTrainingPlansContent();
      case "routes":
        return renderRoutesContent();
      case "users":
        return renderUsersContent();
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-background" testID="discover-screen">
      <AppHeader title="Discover" />
      {renderSearchInput()}
      {renderTabBar()}
      <View testID={getDiscoverResultsListId(activeTab)} />
      {renderContent()}
      <DiscoverFilterSheet
        activeTab={activeTab}
        activityPlanFilters={draftActivityPlanFilters}
        onActivityPlanFiltersChange={setDraftActivityPlanFilters}
        trainingPlanFilters={draftTrainingPlanFilters}
        onTrainingPlanFiltersChange={setDraftTrainingPlanFilters}
        routeFilters={draftRouteFilters}
        onRouteFiltersChange={setDraftRouteFilters}
        onApply={handleApplyFilters}
        onClose={handleCloseFilterSheet}
        onReset={handleResetDraftFilters}
        visible={isFilterSheetOpen}
      />
    </View>
  );
}

function FilterChip({
  label,
  isActive,
  onPress,
  testID,
}: {
  label: string;
  isActive: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
      className={`rounded-full border px-3 py-2 ${
        isActive ? "border-primary bg-primary/10" : "border-border bg-background"
      }`}
    >
      <Text
        className={`text-xs font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface DiscoverFilterSheetProps {
  visible: boolean;
  activeTab: TabType;
  activityPlanFilters: ActivityPlanFilters;
  onActivityPlanFiltersChange: (filters: ActivityPlanFilters) => void;
  trainingPlanFilters: TrainingPlanFilters;
  onTrainingPlanFiltersChange: (filters: TrainingPlanFilters) => void;
  routeFilters: RouteFilters;
  onRouteFiltersChange: (filters: RouteFilters) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
}

function DiscoverFilterSheet({
  visible,
  activeTab,
  activityPlanFilters,
  onActivityPlanFiltersChange,
  trainingPlanFilters,
  onTrainingPlanFiltersChange,
  routeFilters,
  onRouteFiltersChange,
  onReset,
  onApply,
  onClose,
}: DiscoverFilterSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["62%", "85%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    [],
  );

  const isResetDisabled = useMemo(() => {
    switch (activeTab) {
      case "activityPlans":
        return !hasActivityPlanFilters(activityPlanFilters);
      case "trainingPlans":
        return !hasTrainingPlanFilters(trainingPlanFilters);
      case "routes":
        return !hasRouteFilters(routeFilters);
      case "users":
        return true;
      default:
        return true;
    }
  }, [activeTab, activityPlanFilters, trainingPlanFilters, routeFilters]);

  if (!visible || activeTab === "users") {
    return null;
  }

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      onClose={onClose}
    >
      <BottomSheetView className="flex-1" testID="discover-filter-sheet">
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120 }}
        >
          <View className="gap-1 border-b border-border pb-4">
            <Text className="text-lg font-semibold text-foreground">Filters</Text>
            <Text className="text-sm text-muted-foreground">
              {activeTab === "activityPlans"
                ? "Activity Plans"
                : activeTab === "trainingPlans"
                  ? "Training Plans"
                  : "Routes"}
            </Text>
          </View>

          {activeTab === "activityPlans" ? (
            <View className="mt-6 gap-3">
              <Text className="text-sm font-medium text-foreground">Activity</Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <FilterChip
                    key={category.id}
                    label={category.name}
                    isActive={activityPlanFilters.categoryId === category.id}
                    onPress={() =>
                      onActivityPlanFiltersChange({
                        categoryId:
                          activityPlanFilters.categoryId === category.id ? null : category.id,
                      })
                    }
                    testID={`discover-filter-activityPlans-category-${category.id}`}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {activeTab === "trainingPlans" ? (
            <View className="mt-6 gap-6">
              <View className="gap-3">
                <Text className="text-sm font-medium text-foreground">Sport</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TRAINING_PLAN_SPORT_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.id}
                      label={option.label}
                      isActive={trainingPlanFilters.sport === option.id}
                      onPress={() =>
                        onTrainingPlanFiltersChange({
                          ...trainingPlanFilters,
                          sport: trainingPlanFilters.sport === option.id ? null : option.id,
                        })
                      }
                      testID={`discover-filter-trainingPlans-sport-${option.id}`}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-3">
                <Text className="text-sm font-medium text-foreground">Experience</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TRAINING_PLAN_EXPERIENCE_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.id}
                      label={option.label}
                      isActive={trainingPlanFilters.experienceLevel === option.id}
                      onPress={() =>
                        onTrainingPlanFiltersChange({
                          ...trainingPlanFilters,
                          experienceLevel:
                            trainingPlanFilters.experienceLevel === option.id ? null : option.id,
                        })
                      }
                      testID={`discover-filter-trainingPlans-experience-${option.id}`}
                    />
                  ))}
                </View>
              </View>

              <View className="gap-3">
                <Text className="text-sm font-medium text-foreground">Duration</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TRAINING_PLAN_DURATION_PRESETS.map((option) => (
                    <FilterChip
                      key={option.id}
                      label={option.label}
                      isActive={trainingPlanFilters.durationPreset === option.id}
                      onPress={() =>
                        onTrainingPlanFiltersChange({
                          ...trainingPlanFilters,
                          durationPreset:
                            trainingPlanFilters.durationPreset === option.id ? null : option.id,
                        })
                      }
                      testID={`discover-filter-trainingPlans-duration-${option.id}`}
                    />
                  ))}
                </View>
              </View>
            </View>
          ) : null}

          {activeTab === "routes" ? (
            <View className="mt-6 gap-3">
              <Text className="text-sm font-medium text-foreground">Route type</Text>
              <View className="flex-row flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <FilterChip
                    key={category.id}
                    label={category.name}
                    isActive={routeFilters.categoryId === category.id}
                    onPress={() =>
                      onRouteFiltersChange({
                        categoryId: routeFilters.categoryId === category.id ? null : category.id,
                      })
                    }
                    testID={`discover-filter-routes-category-${category.id}`}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </BottomSheetScrollView>

        <View className="border-t border-border bg-background px-4 pb-8 pt-3">
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={onReset}
              activeOpacity={0.85}
              disabled={isResetDisabled}
              testID="discover-filter-reset"
              className={`flex-1 items-center justify-center rounded-2xl border px-4 py-3 ${
                isResetDisabled ? "border-border bg-muted/40" : "border-border bg-background"
              }`}
            >
              <Text className="text-sm font-medium text-foreground">Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onApply}
              activeOpacity={0.85}
              testID="discover-filter-apply"
              className="flex-1 items-center justify-center rounded-2xl bg-primary px-4 py-3"
            >
              <Text className="text-sm font-semibold text-primary-foreground">Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

interface TrainingPlanCardProps {
  template: any;
  onPress: () => void;
}

function TrainingPlanCard({ template, onPress }: TrainingPlanCardProps) {
  const sports = Array.isArray(template.sport) ? template.sport : [];
  const experienceLevels = Array.isArray(template.experienceLevel)
    ? template.experienceLevel
    : template.experienceLevel
      ? [template.experienceLevel]
      : [];
  const durationWeeks = template.durationWeeks?.recommended || template.durationWeeks?.min;
  const sessionsPerWeek = template.sessions_per_week_target || template.sessionsPerWeek;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      testID={`discover-training-plan-${template.id}`}
      className="bg-card border border-border rounded-2xl p-4 gap-3"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-primary/10 px-2.5 py-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Template
              </Text>
            </View>
            {durationWeeks ? (
              <View className="rounded-full bg-muted px-2.5 py-1">
                <Text className="text-[11px] font-medium text-muted-foreground">
                  {durationWeeks} week{durationWeeks === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="text-lg font-semibold text-foreground">{template.name}</Text>
          <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
            {template.description?.trim() ||
              "Structured plan template with enough detail to preview before scheduling."}
          </Text>
        </View>
        <Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />
      </View>

      <View className="flex-row flex-wrap gap-2">
        {sessionsPerWeek ? <InfoChip label={`${sessionsPerWeek} sessions/week`} /> : null}
        {sports.slice(0, 2).map((sport: string) => (
          <InfoChip key={sport} label={sport} />
        ))}
        {experienceLevels.slice(0, 1).map((level: string) => (
          <InfoChip key={level} label={level} />
        ))}
      </View>

      <Text className="text-xs font-medium text-primary">Open plan details</Text>
    </TouchableOpacity>
  );
}

interface RouteCardProps {
  route: any;
  onPress: () => void;
}

function RouteCard({ route, onPress }: RouteCardProps) {
  const distanceKm = route.total_distance ? (route.total_distance / 1000).toFixed(1) : "0.0";
  const elevationM = route.total_ascent || 0;
  const routeType = ROUTE_CATEGORY_LABELS[route.activity_category] || "Route";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      testID={`discover-route-${route.id}`}
      className="bg-card border border-border rounded-2xl p-4 gap-3"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1.5">
          <View className="rounded-full bg-muted px-2.5 py-1 self-start">
            <Text className="text-[11px] font-medium text-muted-foreground">{routeType}</Text>
          </View>
          <Text className="text-lg font-semibold text-foreground">{route.name}</Text>
          <Text className="text-sm leading-5 text-muted-foreground" numberOfLines={2}>
            {route.description?.trim() ||
              "Open route details to inspect the full map and elevation."}
          </Text>
        </View>
        <Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />
      </View>

      <View className="flex-row flex-wrap gap-2">
        <InfoChip label={`${distanceKm} km`} />
        {elevationM > 0 ? <InfoChip label={`${elevationM} m climb`} /> : null}
      </View>

      <Text className="text-xs font-medium text-primary">Open route details</Text>
    </TouchableOpacity>
  );
}

interface UserCardProps {
  user: any;
  onPress: () => void;
}

function UserCard({ user, onPress }: UserCardProps) {
  const username = user.username || "User";
  const visibilityLabel = user.is_public ? "Public profile" : "Private profile";
  const description = user.is_public
    ? "Open profile to view their public details and follow status."
    : "Open profile to request access or follow them privately.";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      testID={`discover-user-${user.id}`}
      className="bg-card border border-border rounded-2xl p-4 flex-row items-center gap-3"
    >
      <Avatar alt={username} className="h-14 w-14">
        <AvatarImage source={{ uri: user.avatar_url }} />
        <AvatarFallback>
          <Text className="text-base font-medium text-foreground">
            {username.slice(0, 2).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-foreground">{username}</Text>
          <View className="rounded-full bg-muted px-2 py-0.5">
            <Text className="text-[11px] font-medium text-muted-foreground">{visibilityLabel}</Text>
          </View>
        </View>
        <Text className="text-sm leading-5 text-muted-foreground">{description}</Text>
        <Text className="text-xs font-medium text-primary">Open profile</Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </TouchableOpacity>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1">
      <Text className="text-[11px] font-medium capitalize text-muted-foreground">{label}</Text>
    </View>
  );
}
