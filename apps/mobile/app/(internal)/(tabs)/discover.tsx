import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { InlineLoadingStatus } from "@repo/ui/components/loading";
import { Text } from "@repo/ui/components/text";
import { keepPreviousData } from "@tanstack/react-query";
import type { Href } from "expo-router";
import { useLocalSearchParams } from "expo-router";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { DiscoverFilterSheet } from "@/components/discover/DiscoverFilterSheet";
import { GroupCard } from "@/components/groups";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { RouteCard as SharedRouteCard } from "@/components/shared/RouteCard";
import { TrainingPlanCard as SharedTrainingPlanCard } from "@/components/shared/TrainingPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import {
  type ActivityPlanFilters,
  type ActivityPlanSortField,
  areSortStatesEqual,
  buildDiscoverFeedItems,
  DEFAULT_ACTIVITY_PLAN_FILTERS,
  DEFAULT_ACTIVITY_PLAN_SORT,
  DEFAULT_PROFILE_SORT,
  DEFAULT_ROUTE_FILTERS,
  DEFAULT_ROUTE_SORT,
  DEFAULT_TRAINING_PLAN_FILTERS,
  DEFAULT_TRAINING_PLAN_SORT,
  type DiscoverActivityPlanItem,
  type DiscoverFeedItem,
  type DiscoverGroupItem,
  type DiscoverRouteItem,
  type DiscoverScope,
  type DiscoverTrainingPlanItem,
  type DiscoverUserItem,
  getActivityPlanFilterErrors,
  getRouteFilterErrors,
  getScopeNoun,
  getSearchPlaceholder,
  getTrainingPlanFilterErrors,
  hasActivityPlanFilters,
  hasRouteFilters,
  hasTrainingPlanFilters,
  normalizeSearchValue,
  type ProfileSortField,
  type RouteFilters,
  type RouteSortField,
  SCOPE_OPTIONS,
  SEARCH_QUERY_MAX_LENGTH,
  type SortState,
  sanitizeSearchInput,
  sanitizeSortState,
  type TrainingPlanFilters,
  type TrainingPlanSortField,
  toProfileSortParam,
  toRouteSortParam,
  toTrainingPlanSortParam,
} from "@/lib/discover";
import { useAuth } from "@/lib/hooks/useAuth";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";
import { usePerformanceScreenReady } from "@/lib/performance";

const PAGE_SIZE = 25;

type InfinitePageWithCursor = {
  nextCursor?: string | null;
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

export default function DiscoverPage() {
  const { user: signedInUser } = useAuth();
  const navigateTo = useAppNavigate();
  usePerformanceScreenReady("route-discover");
  const params = useLocalSearchParams<{
    q?: string;
    scope?: DiscoverScope;
  }>();
  const initialScope = SCOPE_OPTIONS.some((option) => option.id === params.scope)
    ? params.scope
    : "activityPlans";
  const [activeScope, setActiveScope] = useState<DiscoverScope>(initialScope ?? "activityPlans");
  const [searchQuery, setSearchQuery] = useState(
    sanitizeSearchInput(typeof params.q === "string" ? params.q : ""),
  );
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [activityPlanSort, setActivityPlanSort] = useState<SortState<ActivityPlanSortField>>(
    DEFAULT_ACTIVITY_PLAN_SORT,
  );
  const [draftActivityPlanSort, setDraftActivityPlanSort] = useState<
    SortState<ActivityPlanSortField>
  >(DEFAULT_ACTIVITY_PLAN_SORT);
  const [routeSort, setRouteSort] = useState<SortState<RouteSortField>>(DEFAULT_ROUTE_SORT);
  const [draftRouteSort, setDraftRouteSort] =
    useState<SortState<RouteSortField>>(DEFAULT_ROUTE_SORT);
  const [trainingPlanSort, setTrainingPlanSort] = useState<SortState<TrainingPlanSortField>>(
    DEFAULT_TRAINING_PLAN_SORT,
  );
  const [draftTrainingPlanSort, setDraftTrainingPlanSort] = useState<
    SortState<TrainingPlanSortField>
  >(DEFAULT_TRAINING_PLAN_SORT);
  const [profileSort, setProfileSort] = useState<SortState<ProfileSortField>>(DEFAULT_PROFILE_SORT);
  const [draftProfileSort, setDraftProfileSort] =
    useState<SortState<ProfileSortField>>(DEFAULT_PROFILE_SORT);
  const [activityPlanFilters, setActivityPlanFilters] = useState<ActivityPlanFilters>(
    DEFAULT_ACTIVITY_PLAN_FILTERS,
  );
  const [trainingPlanFilters, setTrainingPlanFilters] = useState<TrainingPlanFilters>(
    DEFAULT_TRAINING_PLAN_FILTERS,
  );
  const [routeFilters, setRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [draftActivityPlanFilters, setDraftActivityPlanFilters] = useState<ActivityPlanFilters>(
    DEFAULT_ACTIVITY_PLAN_FILTERS,
  );
  const [draftTrainingPlanFilters, setDraftTrainingPlanFilters] = useState<TrainingPlanFilters>(
    DEFAULT_TRAINING_PLAN_FILTERS,
  );
  const [draftRouteFilters, setDraftRouteFilters] = useState<RouteFilters>(DEFAULT_ROUTE_FILTERS);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const validatedSearchQuery = debouncedSearch.trim();
  const hasSearchQuery = validatedSearchQuery.length > 0;
  const normalizedSearchQuery = normalizeSearchValue(validatedSearchQuery);
  const safeActivityPlanSort = sanitizeSortState(
    activityPlanSort,
    ["created_at", "estimated_duration", "estimated_tss", "intensity_factor"] as const,
    DEFAULT_ACTIVITY_PLAN_SORT,
  );
  const safeTrainingPlanSort = sanitizeSortState(
    trainingPlanSort,
    ["created_at", "duration_weeks", "sessions_per_week"] as const,
    DEFAULT_TRAINING_PLAN_SORT,
  );
  const safeRouteSort = sanitizeSortState(
    routeSort,
    ["created_at", "distance", "ascent"] as const,
    DEFAULT_ROUTE_SORT,
  );
  const safeProfileSort = sanitizeSortState(
    profileSort,
    ["created_at", "username"] as const,
    DEFAULT_PROFILE_SORT,
  );
  const shouldLoadActivityPlans = activeScope === "activityPlans";
  const shouldLoadTrainingPlans = activeScope === "trainingPlans";
  const shouldLoadRoutes = activeScope === "routes";
  const shouldLoadGroups = activeScope === "groups";
  const shouldLoadUsers = activeScope === "users";
  const activityPlansInfiniteQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
      includeEstimation: true,
      ownerScope: "all",
      search: validatedSearchQuery || undefined,
      activityCategories: activityPlanFilters.categoryIds.length
        ? activityPlanFilters.categoryIds
        : undefined,
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadActivityPlans,
      getNextPageParam: (lastPage: InfinitePageWithCursor) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const trainingPlansInfiniteQuery = api.trainingPlans.listTemplates.useInfiniteQuery(
    {
      search: validatedSearchQuery || undefined,
      sport: trainingPlanFilters.sport || undefined,
      experience_level: trainingPlanFilters.experienceLevel || undefined,
      min_weeks: trainingPlanFilters.minWeeks || undefined,
      max_weeks: trainingPlanFilters.maxWeeks || undefined,
      min_sessions_per_week: trainingPlanFilters.minSessionsPerWeek || undefined,
      max_sessions_per_week: trainingPlanFilters.maxSessionsPerWeek || undefined,
      sort_by: toTrainingPlanSortParam(safeTrainingPlanSort),
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadTrainingPlans,
      getNextPageParam: (lastPage: InfinitePageWithCursor) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const routesInfiniteQuery = api.routes.list.useInfiniteQuery(
    {
      search: validatedSearchQuery || undefined,
      min_distance_m:
        routeFilters.minDistanceKm !== null
          ? Math.round(routeFilters.minDistanceKm * 1000)
          : undefined,
      max_distance_m:
        routeFilters.maxDistanceKm !== null
          ? Math.round(routeFilters.maxDistanceKm * 1000)
          : undefined,
      min_ascent_m: routeFilters.minAscentM || undefined,
      max_ascent_m: routeFilters.maxAscentM || undefined,
      sort_by: toRouteSortParam(safeRouteSort),
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadRoutes,
      getNextPageParam: (lastPage: InfinitePageWithCursor) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const usersInfiniteQuery = api.social.searchUsers.useInfiniteQuery(
    {
      query: validatedSearchQuery || undefined,
      limit: PAGE_SIZE,
      sort_by: toProfileSortParam(safeProfileSort),
    },
    {
      enabled: shouldLoadUsers,
      getNextPageParam: (lastPage: InfinitePageWithCursor) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const groupsInfiniteQuery = api.groups.listDiscoverable.useInfiniteQuery(
    {
      search: validatedSearchQuery || undefined,
      limit: PAGE_SIZE,
    },
    {
      enabled: shouldLoadGroups,
      getNextPageParam: (lastPage: InfinitePageWithCursor) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    },
  );

  const activityPlans = useMemo<DiscoverActivityPlanItem[]>(() => {
    return shouldLoadActivityPlans
      ? activityPlansInfiniteQuery.data?.pages.flatMap((page) => page.items) || []
      : [];
  }, [activityPlansInfiniteQuery.data, shouldLoadActivityPlans]);

  const trainingPlans = useMemo<DiscoverTrainingPlanItem[]>(() => {
    return shouldLoadTrainingPlans
      ? trainingPlansInfiniteQuery.data?.pages.flatMap((page) => page.items) || []
      : [];
  }, [shouldLoadTrainingPlans, trainingPlansInfiniteQuery.data]);

  const routes = useMemo<DiscoverRouteItem[]>(() => {
    return shouldLoadRoutes
      ? routesInfiniteQuery.data?.pages.flatMap((page) => page.items) || []
      : [];
  }, [routesInfiniteQuery.data, shouldLoadRoutes]);

  const users = useMemo<DiscoverUserItem[]>(() => {
    return shouldLoadUsers
      ? usersInfiniteQuery.data?.pages.flatMap((page) => page.users) || []
      : [];
  }, [shouldLoadUsers, usersInfiniteQuery.data]);

  const groupsList = useMemo<DiscoverGroupItem[]>(() => {
    return shouldLoadGroups
      ? groupsInfiniteQuery.data?.pages.flatMap((page) => page.items) || []
      : [];
  }, [groupsInfiniteQuery.data, shouldLoadGroups]);

  const hasSubFilters =
    (activeScope === "activityPlans" && hasActivityPlanFilters(activityPlanFilters)) ||
    (activeScope === "trainingPlans" && hasTrainingPlanFilters(trainingPlanFilters)) ||
    (activeScope === "routes" && hasRouteFilters(routeFilters));
  const hasAnyFilters =
    hasSubFilters ||
    (activeScope === "activityPlans" &&
      !areSortStatesEqual(safeActivityPlanSort, DEFAULT_ACTIVITY_PLAN_SORT)) ||
    (activeScope === "trainingPlans" &&
      !areSortStatesEqual(safeTrainingPlanSort, DEFAULT_TRAINING_PLAN_SORT)) ||
    (activeScope === "routes" && !areSortStatesEqual(safeRouteSort, DEFAULT_ROUTE_SORT)) ||
    (activeScope === "users" && !areSortStatesEqual(safeProfileSort, DEFAULT_PROFILE_SORT));
  const draftFilterErrors = useMemo(() => {
    if (activeScope === "activityPlans") {
      return getActivityPlanFilterErrors(draftActivityPlanFilters);
    }

    if (activeScope === "trainingPlans") {
      return getTrainingPlanFilterErrors(draftTrainingPlanFilters);
    }

    if (activeScope === "routes") {
      return getRouteFilterErrors(draftRouteFilters);
    }

    return [];
  }, [activeScope, draftActivityPlanFilters, draftRouteFilters, draftTrainingPlanFilters]);
  const isFilterApplyDisabled = draftFilterErrors.length > 0;
  const syncDraftFiltersFromApplied = useCallback(() => {
    setDraftActivityPlanSort(activityPlanSort);
    setDraftRouteSort(routeSort);
    setDraftTrainingPlanSort(trainingPlanSort);
    setDraftProfileSort(profileSort);
    setDraftActivityPlanFilters(activityPlanFilters);
    setDraftTrainingPlanFilters(trainingPlanFilters);
    setDraftRouteFilters(routeFilters);
  }, [
    activityPlanFilters,
    activityPlanSort,
    profileSort,
    routeFilters,
    routeSort,
    trainingPlanFilters,
    trainingPlanSort,
  ]);

  const handleTemplatePress = (template: DiscoverActivityPlanItem) => {
    navigateTo({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    } as Href);
  };

  const handleTrainingPlanPress = (template: DiscoverTrainingPlanItem) => {
    navigateTo(ROUTES.PLAN.TRAINING_PLAN.DETAIL(template.id) as Href);
  };

  const handleRoutePress = (route: DiscoverRouteItem) => {
    navigateTo({
      pathname: "/(internal)/(standard)/route-detail",
      params: { id: route.id },
    } as Href);
  };

  const handleUserPress = (profile: DiscoverUserItem) => {
    if (profile.id === signedInUser?.id) {
      navigateTo("/profile");
      return;
    }

    navigateTo({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: { userId: profile.id },
    } as Href);
  };

  const handleGroupPress = (group: DiscoverGroupItem) => {
    navigateTo({
      pathname: "/(internal)/(standard)/group-detail",
      params: { groupId: group.id },
    } as Href);
  };

  const handleOpenFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(true);
  };

  const handleCloseFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(false);
  };

  const handleApplyFilters = () => {
    if (isFilterApplyDisabled) {
      return;
    }

    if (activeScope === "activityPlans") {
      setActivityPlanSort(draftActivityPlanSort);
      setActivityPlanFilters(draftActivityPlanFilters);
    } else if (activeScope === "trainingPlans") {
      setTrainingPlanSort(draftTrainingPlanSort);
      setTrainingPlanFilters(draftTrainingPlanFilters);
    } else if (activeScope === "routes") {
      setRouteSort(draftRouteSort);
      setRouteFilters(draftRouteFilters);
    } else if (activeScope === "users") {
      setProfileSort(draftProfileSort);
    }
    setIsFilterSheetOpen(false);
  };

  const handleResetDraftFilters = () => {
    if (activeScope === "activityPlans") {
      setDraftActivityPlanSort(DEFAULT_ACTIVITY_PLAN_SORT);
      setDraftActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
    } else if (activeScope === "trainingPlans") {
      setDraftTrainingPlanSort(DEFAULT_TRAINING_PLAN_SORT);
      setDraftTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
    } else if (activeScope === "routes") {
      setDraftRouteSort(DEFAULT_ROUTE_SORT);
      setDraftRouteFilters(DEFAULT_ROUTE_FILTERS);
    } else if (activeScope === "users") {
      setDraftProfileSort(DEFAULT_PROFILE_SORT);
    }
  };

  const handleResetFilters = useCallback(() => {
    if (activeScope === "activityPlans") {
      setActivityPlanSort(DEFAULT_ACTIVITY_PLAN_SORT);
      setActivityPlanFilters(DEFAULT_ACTIVITY_PLAN_FILTERS);
    } else if (activeScope === "trainingPlans") {
      setTrainingPlanSort(DEFAULT_TRAINING_PLAN_SORT);
      setTrainingPlanFilters(DEFAULT_TRAINING_PLAN_FILTERS);
    } else if (activeScope === "routes") {
      setRouteSort(DEFAULT_ROUTE_SORT);
      setRouteFilters(DEFAULT_ROUTE_FILTERS);
    } else if (activeScope === "users") {
      setProfileSort(DEFAULT_PROFILE_SORT);
    }
  }, [activeScope]);

  const handleEmptyStateAction = () => {
    if (searchQuery.length > 0) {
      setSearchQuery("");
    }

    if (hasAnyFilters) {
      handleResetFilters();
    }
  };

  const hasNextPage =
    (shouldLoadActivityPlans && activityPlansInfiniteQuery.hasNextPage) ||
    (shouldLoadTrainingPlans && trainingPlansInfiniteQuery.hasNextPage) ||
    (shouldLoadRoutes && routesInfiniteQuery.hasNextPage) ||
    (shouldLoadGroups && groupsInfiniteQuery.hasNextPage) ||
    (shouldLoadUsers && usersInfiniteQuery.hasNextPage);
  const isFetchingNextPage =
    (shouldLoadActivityPlans && activityPlansInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadTrainingPlans && trainingPlansInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadRoutes && routesInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadGroups && groupsInfiniteQuery.isFetchingNextPage) ||
    (shouldLoadUsers && usersInfiniteQuery.isFetchingNextPage);

  const handleLoadNextPage = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    if (activeScope === "activityPlans") {
      void activityPlansInfiniteQuery.fetchNextPage();
      return;
    }

    if (activeScope === "trainingPlans") {
      void trainingPlansInfiniteQuery.fetchNextPage();
      return;
    }

    if (activeScope === "routes") {
      void routesInfiniteQuery.fetchNextPage();
      return;
    }

    if (activeScope === "groups") {
      void groupsInfiniteQuery.fetchNextPage();
      return;
    }

    void usersInfiniteQuery.fetchNextPage();
  }, [
    activeScope,
    activityPlansInfiniteQuery,
    groupsInfiniteQuery,
    hasNextPage,
    isFetchingNextPage,
    routesInfiniteQuery,
    trainingPlansInfiniteQuery,
    usersInfiniteQuery,
  ]);

  const feedItems = useMemo<DiscoverFeedItem[]>(() => {
    return buildDiscoverFeedItems({
      activeScope,
      activityPlans,
      activityPlanFilters,
      groupsList,
      hasSearchQuery,
      normalizedSearchQuery,
      routeSort: safeRouteSort,
      routes,
      activityPlanSort: safeActivityPlanSort,
      profileSort: safeProfileSort,
      trainingPlanSort: safeTrainingPlanSort,
      trainingPlans,
      users,
    });
  }, [
    activeScope,
    activityPlans,
    activityPlanFilters,
    groupsList,
    hasSearchQuery,
    normalizedSearchQuery,
    safeActivityPlanSort,
    safeProfileSort,
    safeRouteSort,
    safeTrainingPlanSort,
    routes,
    trainingPlans,
    users,
  ]);

  const isContentLoading =
    (shouldLoadActivityPlans &&
      activityPlansInfiniteQuery.isLoading &&
      activityPlans.length === 0) ||
    (shouldLoadTrainingPlans &&
      trainingPlansInfiniteQuery.isLoading &&
      trainingPlans.length === 0) ||
    (shouldLoadRoutes && routesInfiniteQuery.isLoading && routes.length === 0) ||
    (shouldLoadGroups && groupsInfiniteQuery.isLoading && groupsList.length === 0) ||
    (shouldLoadUsers && usersInfiniteQuery.isLoading && users.length === 0);
  const activeQuery =
    activeScope === "activityPlans"
      ? activityPlansInfiniteQuery
      : activeScope === "trainingPlans"
        ? trainingPlansInfiniteQuery
        : activeScope === "routes"
          ? routesInfiniteQuery
          : activeScope === "groups"
            ? groupsInfiniteQuery
            : usersInfiniteQuery;
  const isUpdatingResults =
    activeQuery.isFetching && !activeQuery.isLoading && !activeQuery.isFetchingNextPage;

  const resultCountLabel = `${feedItems.length} item${feedItems.length === 1 ? "" : "s"}`;
  const resultsMetaText = hasSearchQuery
    ? `${resultCountLabel} for "${validatedSearchQuery}"`
    : resultCountLabel;

  const renderSearchInput = () => {
    const showFilterButton = activeScope !== "groups";
    const clearButtonRight = showFilterButton ? 52 : 16;

    return (
      <View className="border-b border-border bg-background px-4 pb-3 pt-4">
        <View className="relative rounded-2xl border border-border bg-card">
          <View className="absolute left-3 top-1/2 -translate-y-1/2">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            placeholder={getSearchPlaceholder(activeScope)}
            value={searchQuery}
            onChangeText={(value) => setSearchQuery(sanitizeSearchInput(value))}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={SEARCH_QUERY_MAX_LENGTH}
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

          {showFilterButton ? (
            <TouchableOpacity
              className={`absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border ${
                hasAnyFilters ? "border-primary bg-primary" : "border-border bg-background"
              }`}
              onPress={handleOpenFilterSheet}
              activeOpacity={0.85}
              testID="discover-filter-button"
              accessibilityState={{ selected: hasAnyFilters }}
            >
              <Icon
                as={SlidersHorizontal}
                size={16}
                className={hasAnyFilters ? "text-primary-foreground" : "text-foreground"}
              />
              {hasAnyFilters ? (
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

  const renderScopeRow = () => (
    <View className="border-b border-border bg-background py-3">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        testID="discover-scope-row"
      >
        <View className="flex-row rounded-2xl border border-border/80 bg-muted/35 p-1">
          {SCOPE_OPTIONS.map((option) => {
            const isActive = activeScope === option.id;

            return (
              <TouchableOpacity
                key={option.id}
                onPress={() => setActiveScope(option.id)}
                activeOpacity={0.85}
                testID={`discover-scope-${option.id}`}
                className={`items-center justify-center rounded-xl px-3 py-2 ${
                  isActive ? "bg-background" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderLoadingSkeleton = () => (
    <View className="gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
      ))}
    </View>
  );

  const renderEmptyState = () => {
    const actionLabel =
      searchQuery.length > 0 && hasAnyFilters
        ? "Clear search & filters"
        : hasAnyFilters
          ? "Reset filters"
          : searchQuery.length > 0
            ? "Clear search"
            : undefined;

    const title = hasSearchQuery
      ? `No ${getScopeNoun(activeScope)} found`
      : `No ${getScopeNoun(activeScope)} yet`;

    const description = hasSearchQuery
      ? `Try another search term or remove a filter to widen the ${getScopeNoun(activeScope)} list.`
      : `Switch record type or check back after more ${getScopeNoun(activeScope)} are added.`;

    return (
      <View className="px-4 py-12">
        <EmptyStateCard
          icon={Search}
          title={title}
          description={description}
          actionLabel={actionLabel}
          onAction={actionLabel ? handleEmptyStateAction : undefined}
        />
      </View>
    );
  };

  const renderLoadMoreActions = () => {
    if (!hasNextPage && !isFetchingNextPage) {
      return null;
    }

    return (
      <View className="px-4 pb-8 pt-2">
        <Text className="text-center text-xs text-muted-foreground">
          {isFetchingNextPage
            ? `Loading more ${getScopeNoun(activeScope)}...`
            : `Scroll to load more ${getScopeNoun(activeScope)}.`}
        </Text>
      </View>
    );
  };

  const renderFeedItem = (result: DiscoverFeedItem) => (
    <View key={result.id} testID={`discover-feed-item-${result.id}`}>
      {result.type === "activityPlans" ? (
        <ActivityPlanCard
          activityPlan={result.item}
          onPress={() => handleTemplatePress(result.item)}
          variant="default"
        />
      ) : null}
      {result.type === "trainingPlans" ? (
        <TrainingPlanCard
          template={result.item}
          onPress={() => handleTrainingPlanPress(result.item)}
        />
      ) : null}
      {result.type === "routes" ? (
        <RouteCard route={result.item} onPress={() => handleRoutePress(result.item)} />
      ) : null}
      {result.type === "groups" ? (
        <GroupCard group={result.item} onPress={() => handleGroupPress(result.item)} />
      ) : null}
      {result.type === "users" ? (
        <UserCard user={result.item} onPress={() => handleUserPress(result.item)} />
      ) : null}
    </View>
  );

  const renderContent = () => {
    if (isContentLoading && feedItems.length === 0) {
      return renderLoadingSkeleton();
    }

    if (feedItems.length === 0) {
      return renderEmptyState();
    }

    return (
      <ScrollView
        testID="discover-results-list"
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          if (distanceFromBottom < 240) {
            handleLoadNextPage();
          }
        }}
        scrollEventThrottle={16}
      >
        <View className="gap-4 px-4 pb-2 pt-4">
          <View className="px-1">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-xs text-muted-foreground">{resultsMetaText}</Text>
              <InlineLoadingStatus loading={isUpdatingResults} label="Updating results..." />
            </View>
          </View>
          {feedItems.map(renderFeedItem)}
        </View>
        {renderLoadMoreActions()}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="discover-screen">
      {renderSearchInput()}
      {renderScopeRow()}
      {renderContent()}
      <DiscoverFilterSheet
        visible={isFilterSheetOpen}
        scope={activeScope}
        activityPlanSort={draftActivityPlanSort}
        onActivityPlanSortChange={setDraftActivityPlanSort}
        routeSort={draftRouteSort}
        onRouteSortChange={setDraftRouteSort}
        trainingPlanSort={draftTrainingPlanSort}
        onTrainingPlanSortChange={setDraftTrainingPlanSort}
        profileSort={draftProfileSort}
        onProfileSortChange={setDraftProfileSort}
        activityPlanFilters={draftActivityPlanFilters}
        onActivityPlanFiltersChange={setDraftActivityPlanFilters}
        trainingPlanFilters={draftTrainingPlanFilters}
        onTrainingPlanFiltersChange={setDraftTrainingPlanFilters}
        routeFilters={draftRouteFilters}
        onRouteFiltersChange={setDraftRouteFilters}
        validationErrors={draftFilterErrors}
        onReset={handleResetDraftFilters}
        onApply={handleApplyFilters}
        onClose={handleCloseFilterSheet}
      />
    </View>
  );
}

interface TrainingPlanCardProps {
  template: DiscoverTrainingPlanItem;
  onPress: () => void;
}

function TrainingPlanCard({ template, onPress }: TrainingPlanCardProps) {
  return (
    <SharedTrainingPlanCard
      plan={template}
      onPress={onPress}
      variant="compact"
      headerAccessory={<Icon as={ChevronRight} size={18} className="mt-1 text-muted-foreground" />}
    />
  );
}

interface RouteCardProps {
  route: DiscoverRouteItem;
  onPress: () => void;
}

function RouteCard({ route, onPress }: RouteCardProps) {
  return <SharedRouteCard route={route} onPress={onPress} />;
}

interface UserCardProps {
  user: DiscoverUserItem;
  onPress: () => void;
}

function UserCard({ user, onPress }: UserCardProps) {
  const supportingText = user.is_public
    ? "Open profile to view their public details and follow status."
    : "Open profile to request access or follow them privately.";

  return (
    <ProfileCard
      profile={user}
      onPress={onPress}
      testID={`discover-user-${user.id}`}
      supportingText={supportingText}
      actions={
        <View className="flex-row items-center gap-1">
          <Text className="text-xs font-medium text-primary">Open profile</Text>
          <Icon as={ChevronRight} size={14} className="text-primary" />
        </View>
      }
    />
  );
}
