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
  ChevronRight,
  Dumbbell,
  MapPin,
  Search,
  SlidersHorizontal,
  Users,
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
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  activityPlans: {
    placeholder: "Search activity plans",
    emptyTitle: "No matching plans",
    emptyDescription: "Try another search or adjust filters.",
  },
  trainingPlans: {
    placeholder: "Search training plans",
    emptyTitle: "No matching training plans",
    emptyDescription: "Try another search or adjust filters.",
  },
  routes: {
    placeholder: "Search your routes",
    emptyTitle: "No matching routes",
    emptyDescription: "Try another search or adjust filters.",
  },
  users: {
    placeholder: "Search profiles",
    emptyTitle: "No profiles found",
    emptyDescription: "Try a username or a shorter search term.",
  },
};

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

type DiscoverTypeFilters = {
  activeTab: TabType;
};

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

export default function DiscoverPage() {
  const navigateTo = useAppNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("activityPlans");
  const [draftDiscoverTypeFilters, setDraftDiscoverTypeFilters] = useState<DiscoverTypeFilters>({
    activeTab: "activityPlans",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const isSearchMode = debouncedSearch.trim() !== "";
  const activeTabHasFilters = activeTab !== "activityPlans";

  const activityPlansInfiniteQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
      includeEstimation: false,
      ownerScope: "all",
      search: debouncedSearch || undefined,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const trainingPlansQuery = api.trainingPlans.listTemplates.useQuery({
    search: debouncedSearch || undefined,
  });

  const routesInfiniteQuery = api.routes.list.useInfiniteQuery(
    {
      search: debouncedSearch || undefined,
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
  const activeTabConfig = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const activeResultCount =
    activeTab === "activityPlans"
      ? activityPlans.length
      : activeTab === "trainingPlans"
        ? trainingPlans.length
        : activeTab === "routes"
          ? routes.length
          : users.length;

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
    setDraftDiscoverTypeFilters({ activeTab });
  }, [activeTab]);

  const handleOpenFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(true);
  };

  const handleCloseFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(false);
  };

  const handleApplyFilters = () => {
    setActiveTab(draftDiscoverTypeFilters.activeTab);
    setIsFilterSheetOpen(false);
  };

  const handleResetDraftFilters = () => {
    setDraftDiscoverTypeFilters({ activeTab: "activityPlans" });
  };

  const handleResetActiveTabFilters = useCallback(() => {
    setActiveTab("activityPlans");
  }, []);

  const handleEmptyStateAction = () => {
    if (isSearchMode) {
      setSearchQuery("");
    }

    if (activeTabHasFilters) {
      handleResetActiveTabFilters();
    }
  };

  const renderSearchInput = () => {
    const activeCopy = TAB_COPY[activeTab];
    const clearButtonRight = 52;

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
            className="h-12 border-0 bg-transparent pl-10 pr-24"
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

          <TouchableOpacity
            className={`absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border ${
              activeTabHasFilters ? "border-primary bg-primary" : "border-border bg-background"
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
        </View>

        <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-muted/30 px-3 py-2.5">
          <View className="flex-row items-center gap-2">
            <View className="rounded-full bg-background px-2.5 py-1">
              <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                {activeTabConfig.label}
              </Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {activeResultCount} result{activeResultCount === 1 ? "" : "s"}
            </Text>
          </View>
          <Text className="text-xs font-medium text-muted-foreground">Change in filters</Text>
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
    const actionLabel =
      isSearchMode && activeTabHasFilters
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

    if (!isSearchMode && !activeTabHasFilters) {
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

    const headerTitle = isSearchMode ? "Plan matches" : "All activity plans";
    const headerDescription = isSearchMode
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

    const isNeutralState = !isSearchMode && !activeTabHasFilters;

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

    const headerTitle = isSearchMode ? "Route matches" : "Saved routes";
    const isNeutralState = !isSearchMode && !activeTabHasFilters;

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
      <View testID={getDiscoverResultsListId(activeTab)} />
      {renderContent()}
      <DiscoverFilterSheet
        discoverTypeFilters={draftDiscoverTypeFilters}
        onDiscoverTypeFiltersChange={setDraftDiscoverTypeFilters}
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
  discoverTypeFilters: DiscoverTypeFilters;
  onDiscoverTypeFiltersChange: (filters: DiscoverTypeFilters) => void;
  onReset: () => void;
  onApply: () => void;
  onClose: () => void;
}

function DiscoverFilterSheet({
  visible,
  discoverTypeFilters,
  onDiscoverTypeFiltersChange,
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

  const isResetDisabled = discoverTypeFilters.activeTab === "activityPlans";

  if (!visible) {
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
              Choose which Discover results you want to browse.
            </Text>
          </View>

          <View className="mt-6 gap-3">
            <Text className="text-sm font-medium text-foreground">Content type</Text>
            <View className="flex-row flex-wrap gap-2">
              {TABS.map((tab) => (
                <FilterChip
                  key={tab.id}
                  label={tab.label}
                  isActive={discoverTypeFilters.activeTab === tab.id}
                  onPress={() => onDiscoverTypeFiltersChange({ activeTab: tab.id })}
                  testID={`discover-filter-type-${tab.id}`}
                />
              ))}
            </View>
          </View>
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
