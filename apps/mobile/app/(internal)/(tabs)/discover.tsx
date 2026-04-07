import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import {
  Activity,
  Bike,
  ChevronRight,
  Dumbbell,
  Footprints,
  MapPin,
  Search,
  Users,
  Waves,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, TouchableOpacity, View } from "react-native";
import { AppHeader } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";

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
    browseTitle: string;
    browseDescription: string;
    resultsLabel: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  activityPlans: {
    placeholder: "Search activity plans",
    browseTitle: "Find your next workout",
    browseDescription:
      "Browse simple, structured activity plans by sport or search for a specific session.",
    resultsLabel: "activity plans",
    emptyTitle: "No activity plans found",
    emptyDescription: "Try another keyword or switch categories.",
  },
  trainingPlans: {
    placeholder: "Search training plans",
    browseTitle: "Browse ready-to-use training plans",
    browseDescription:
      "See template plans with just enough detail to know the time commitment before you open one.",
    resultsLabel: "training plans",
    emptyTitle: "No training plans found",
    emptyDescription: "Try a broader search term like 10k, cycling, or beginner.",
  },
  routes: {
    placeholder: "Search your routes",
    browseTitle: "Revisit saved routes",
    browseDescription:
      "Scan your route library by distance, climbing, and activity type before opening the map.",
    resultsLabel: "routes",
    emptyTitle: "No routes found",
    emptyDescription: "Try another route name or clear your search.",
  },
  users: {
    placeholder: "Search profiles",
    browseTitle: "Find people to follow",
    browseDescription:
      "Discover athletes and coaches by username, then open their profile for the full context.",
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("activityPlans");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const isSearchMode = debouncedSearch.trim() !== "";
  const selectedCategoryId = selectedCategories[0] ?? null;
  const selectedCategory =
    CATEGORIES.find((category) => category.id === selectedCategoryId) ?? null;

  const activityPlansInfiniteQuery = api.activityPlans.list.useInfiniteQuery(
    {
      includeSystemTemplates: true,
      includeOwnOnly: false,
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

  const filteredActivities = useMemo(() => {
    let activities = activityPlans;

    if (selectedCategories.length > 0) {
      activities = activities.filter((activity) => {
        return selectedCategories.includes(activity.activity_category || "");
      });
    }

    return activities;
  }, [activityPlans, selectedCategories]);

  const tabCounts = useMemo(
    () => ({
      activityPlans: filteredActivities.length,
      trainingPlans: trainingPlans.length,
      routes: routes.length,
      users: users.length,
    }),
    [filteredActivities.length, trainingPlans.length, routes.length, users.length],
  );

  const handleTemplatePress = (template: any) => {
    router.push({
      pathname: "/(internal)/(standard)/activity-plan-detail",
      params: {
        template: JSON.stringify(template),
        source: "discover",
      },
    });
  };

  const handleTrainingPlanPress = (template: any) => {
    router.push(ROUTES.PLAN.TRAINING_PLAN.DETAIL(template.id) as any);
  };

  const handleRoutePress = (route: any) => {
    router.push({
      pathname: "/(internal)/(standard)/route-detail",
      params: {
        id: route.id,
      },
    });
  };

  const handleUserPress = (user: any) => {
    router.push({
      pathname: "/(internal)/(standard)/user/[userId]",
      params: {
        userId: user.id,
      },
    });
  };

  const handleViewAll = (categoryId: string) => {
    setActiveTab("activityPlans");
    setSearchQuery("");
    setSelectedCategories([categoryId]);
  };

  const handleCategoryToggle = (categoryId: string | null) => {
    if (!categoryId) {
      setSelectedCategories([]);
      return;
    }

    setSelectedCategories((current) => (current[0] === categoryId ? [] : [categoryId]));
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategories([]);
  };

  const renderTabBar = () => (
    <View className="border-b border-border bg-background px-4 pt-3 pb-3">
      <Text className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

  const renderCategoryChips = () => {
    if (activeTab !== "activityPlans") {
      return null;
    }

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingRight: 16 }}
      >
        <FilterChip
          label="All"
          isActive={!selectedCategoryId}
          onPress={() => handleCategoryToggle(null)}
          testID="discover-category-all"
        />
        {CATEGORIES.map((category) => (
          <FilterChip
            key={category.id}
            label={category.name}
            isActive={selectedCategoryId === category.id}
            onPress={() => handleCategoryToggle(category.id)}
            testID={`discover-category-${category.id}`}
          />
        ))}
      </ScrollView>
    );
  };

  const renderSearchInput = () => {
    const activeCopy = TAB_COPY[activeTab];

    return (
      <View className="px-4 pt-4 pb-3 border-b border-border bg-background gap-3">
        <View className="relative">
          <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            placeholder={activeCopy.placeholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="h-12 pl-10 pr-10"
            testID="discover-search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              className="absolute right-3 top-1/2 -translate-y-1/2"
              onPress={() => setSearchQuery("")}
              activeOpacity={0.8}
            >
              <Icon as={X} size={20} className="text-muted-foreground" />
            </TouchableOpacity>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-sm font-medium text-foreground">{activeCopy.browseTitle}</Text>
          <Text className="text-xs text-muted-foreground">{activeCopy.browseDescription}</Text>
          {isSearchMode ? (
            <View className="flex-row items-center gap-2">
              <Text className="text-xs text-muted-foreground">
                Searching {activeCopy.resultsLabel} for {`"${debouncedSearch}"`}
              </Text>
              <TouchableOpacity onPress={handleClearFilters} activeOpacity={0.8}>
                <Text className="text-xs font-medium text-primary">Clear</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {renderCategoryChips()}
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

  const renderEmptyState = (tab: TabType) => (
    <View className="px-4 py-12">
      <EmptyStateCard
        icon={Search}
        title={TAB_COPY[tab].emptyTitle}
        description={TAB_COPY[tab].emptyDescription}
        actionLabel={selectedCategoryId || isSearchMode ? "Clear filters" : undefined}
        onAction={selectedCategoryId || isSearchMode ? handleClearFilters : undefined}
      />
    </View>
  );

  const renderResultsHeader = (title: string, description: string, count: number, noun: string) => (
    <View className="mb-3 gap-1">
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      <Text className="text-sm text-muted-foreground">{description}</Text>
      <Text className="text-xs text-muted-foreground mt-1">
        {count} {noun}
        {count === 1 ? "" : "s"}
      </Text>
    </View>
  );

  const renderBrowseIntro = () => (
    <View className="mx-4 mb-5 rounded-2xl border border-border bg-card p-4 gap-3">
      <Text className="text-lg font-semibold text-foreground">Discover your next session</Text>
      <Text className="text-sm leading-5 text-muted-foreground">
        Keep search simple, browse by sport when you want inspiration, and open any detail page for
        a deeper look before you commit.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        <BrowsePill label={`${activityPlans.length} activity plans`} />
        <BrowsePill label={`${trainingPlans.length} training plans`} />
        <BrowsePill label={`${routes.length} routes`} />
        <BrowsePill label={`${users.length} profiles`} />
      </View>
    </View>
  );

  const renderActivityPlansContent = () => {
    if (activityPlansInfiniteQuery.isLoading) {
      return renderLoadingSkeleton();
    }

    if (!isSearchMode && !selectedCategoryId) {
      return (
        <ScrollView className="flex-1 py-4" showsVerticalScrollIndicator={false}>
          {renderBrowseIntro()}
          {CATEGORIES.map((category) => {
            const categoryActivities = activityPlans.filter(
              (plan) => plan.activity_category === category.id,
            );

            return (
              <CategoryRow
                key={category.id}
                category={category}
                activities={categoryActivities}
                onViewAll={() => handleViewAll(category.id)}
                onTemplatePress={handleTemplatePress}
              />
            );
          })}
          <View className="h-8" />
        </ScrollView>
      );
    }

    if (filteredActivities.length === 0) {
      return renderEmptyState("activityPlans");
    }

    const headerTitle = selectedCategory
      ? `${selectedCategory.name} activity plans`
      : isSearchMode
        ? "Search results"
        : "All activity plans";
    const headerDescription = selectedCategory
      ? selectedCategory.description
      : isSearchMode
        ? "Open any session to inspect the structure, route, and scheduling options."
        : "Browse every available activity plan in one place.";

    return (
      <FlatList
        testID="discover-activity-plans-list"
        data={filteredActivities}
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderResultsHeader(
          headerTitle,
          headerDescription,
          filteredActivities.length,
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

    return (
      <FlatList
        testID="discover-training-plans-list"
        data={trainingPlans}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderResultsHeader(
          isSearchMode ? "Training plan matches" : "Training plan templates",
          "Compare commitment, cadence, and focus before you open a plan.",
          trainingPlans.length,
          "template",
        )}
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

    return (
      <FlatList
        testID="discover-routes-list"
        data={routes}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderResultsHeader(
          isSearchMode ? "Route matches" : "Saved routes",
          "Open a route when the distance and climbing feel like the right fit.",
          routes.length,
          "route",
        )}
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
        ListHeaderComponent={renderResultsHeader(
          isSearchMode ? "Profiles found" : "People to follow",
          "Profiles stay simple here: open one to decide whether you want to follow or message.",
          users.length,
          "profile",
        )}
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
    </View>
  );
}

function BrowsePill({ label }: { label: string }) {
  return (
    <View className="rounded-full border border-border bg-background px-3 py-1.5">
      <Text className="text-xs font-medium text-muted-foreground">{label}</Text>
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
      className={`rounded-full border px-3 py-1.5 ${
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

interface CategoryRowProps {
  category: (typeof CATEGORIES)[number];
  activities: any[];
  onViewAll: () => void;
  onTemplatePress: (template: any) => void;
}

function CategoryRow({ category, activities, onViewAll, onTemplatePress }: CategoryRowProps) {
  if (activities.length === 0) return null;

  return (
    <View className="mb-6 gap-3">
      <View className="flex-row items-start justify-between px-4 gap-3">
        <View className="flex-1 flex-row gap-3">
          <View className={`mt-0.5 rounded-xl p-2 ${category.bgColor}`}>
            <Icon as={category.icon} size={18} className={category.color} />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-lg font-semibold text-foreground">{category.name}</Text>
            <Text className="text-sm text-muted-foreground">{category.description}</Text>
            <Text className="text-xs text-muted-foreground">
              {activities.length} plan{activities.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <TouchableOpacity onPress={onViewAll} activeOpacity={0.8}>
          <Text className="text-sm text-primary font-medium">See all</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        data={activities.slice(0, 5)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ width: 280 }}>
            <ActivityPlanCard
              activityPlan={item}
              onPress={() => onTemplatePress(item)}
              variant="default"
            />
          </View>
        )}
      />
    </View>
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
