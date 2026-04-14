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
import { Activity, ChevronRight, Dumbbell, MapPin, Search, SlidersHorizontal, Users, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
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

const SEARCH_PLACEHOLDER = "Search plans, routes, and profiles";
const PREVIEW_LIMIT = 4;

export type TabType = (typeof TABS)[number]["id"];

type DiscoverTypeFilters = {
  selectedTypes: TabType[];
};

const ALL_DISCOVER_TYPES = TABS.map((tab) => tab.id);

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

function areAllTypesSelected(selectedTypes: readonly TabType[]) {
  return selectedTypes.length === ALL_DISCOVER_TYPES.length;
}

function getTypeLabel(type: TabType) {
  return TABS.find((tab) => tab.id === type)?.label ?? type;
}

function getSelectedResultCount(type: TabType, counts: Record<TabType, number>) {
  return counts[type] ?? 0;
}

export default function DiscoverPage() {
  const navigateTo = useAppNavigate();
  const [typeFilters, setTypeFilters] = useState<DiscoverTypeFilters>({
    selectedTypes: [...ALL_DISCOVER_TYPES],
  });
  const [draftTypeFilters, setDraftTypeFilters] = useState<DiscoverTypeFilters>({
    selectedTypes: [...ALL_DISCOVER_TYPES],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const selectedTypes = typeFilters.selectedTypes;
  const hasTypeFilters = !areAllTypesSelected(selectedTypes);

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

  const resultCounts: Record<TabType, number> = {
    activityPlans: activityPlans.length,
    trainingPlans: trainingPlans.length,
    routes: routes.length,
    users: users.length,
  };

  const totalSelectedResults = selectedTypes.reduce(
    (sum, type) => sum + getSelectedResultCount(type, resultCounts),
    0,
  );
  const isSelectedContentLoading =
    (selectedTypes.includes("activityPlans") &&
      activityPlansInfiniteQuery.isLoading &&
      activityPlans.length === 0) ||
    (selectedTypes.includes("trainingPlans") &&
      trainingPlansQuery.isLoading &&
      trainingPlans.length === 0) ||
    (selectedTypes.includes("routes") && routesInfiniteQuery.isLoading && routes.length === 0) ||
    (selectedTypes.includes("users") && usersQuery.isLoading && users.length === 0);

  const syncDraftFiltersFromApplied = useCallback(() => {
    setDraftTypeFilters({ selectedTypes: [...selectedTypes] });
  }, [selectedTypes]);

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

  const handleOpenFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(true);
  };

  const handleCloseFilterSheet = () => {
    syncDraftFiltersFromApplied();
    setIsFilterSheetOpen(false);
  };

  const handleApplyFilters = () => {
    setTypeFilters({ selectedTypes: [...draftTypeFilters.selectedTypes] });
    setIsFilterSheetOpen(false);
  };

  const handleResetDraftFilters = () => {
    setDraftTypeFilters({ selectedTypes: [...ALL_DISCOVER_TYPES] });
  };

  const handleResetFilters = useCallback(() => {
    setTypeFilters({ selectedTypes: [...ALL_DISCOVER_TYPES] });
  }, []);

  const handleEmptyStateAction = () => {
    if (searchQuery.length > 0) {
      setSearchQuery("");
    }

    if (hasTypeFilters) {
      handleResetFilters();
    }
  };

  const renderSearchInput = () => {
    const clearButtonRight = 52;

    return (
      <View className="border-b border-border bg-background px-4 pb-3 pt-4">
        <View className="relative rounded-2xl border border-border bg-card">
          <View className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
            <Icon as={Search} size={18} className="text-muted-foreground" />
          </View>
          <Input
            placeholder={SEARCH_PLACEHOLDER}
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
              hasTypeFilters ? "border-primary bg-primary" : "border-border bg-background"
            }`}
            onPress={handleOpenFilterSheet}
            activeOpacity={0.85}
            testID="discover-filter-button"
            accessibilityState={{ selected: hasTypeFilters }}
          >
            <Icon
              as={SlidersHorizontal}
              size={16}
              className={hasTypeFilters ? "text-primary-foreground" : "text-foreground"}
            />
            {hasTypeFilters ? (
              <View
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-background"
                testID="discover-filter-button-dot"
              />
            ) : null}
          </TouchableOpacity>
        </View>

      </View>
    );
  };

  const renderLoadingSkeleton = () => (
    <View className="gap-4 p-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
      ))}
    </View>
  );

  const renderEmptyState = () => {
    if (selectedTypes.length === 0) {
      return (
        <View className="px-4 py-12">
          <EmptyStateCard
            icon={SlidersHorizontal}
            title="No result types selected"
            description="Choose at least one content type in filters to build your discover feed."
            actionLabel="Reset filters"
            onAction={handleResetFilters}
          />
        </View>
      );
    }

    const actionLabel =
      searchQuery.length > 0 && hasTypeFilters
        ? "Clear search & filters"
        : hasTypeFilters
          ? "Reset filters"
          : searchQuery.length > 0
            ? "Clear search"
            : undefined;

    return (
      <View className="px-4 py-12">
        <EmptyStateCard
          icon={Search}
          title="No discover matches"
          description="Try another search term or widen the included content types."
          actionLabel={actionLabel}
          onAction={actionLabel ? handleEmptyStateAction : undefined}
        />
      </View>
    );
  };

  const renderSectionHeader = (type: TabType, count: number, description: string) => (
    <View className="mb-3 gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-foreground">{getTypeLabel(type)}</Text>
        <Text className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {count} result{count === 1 ? "" : "s"}
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">{description}</Text>
    </View>
  );

  const renderActivityPlansSection = () => {
    if (!selectedTypes.includes("activityPlans") || activityPlans.length === 0) {
      return null;
    }

    return (
      <View className="mb-6 px-4" testID="discover-section-activityPlans">
        {renderSectionHeader(
          "activityPlans",
          activityPlans.length,
          "Open any session to inspect the structure, route, and scheduling options.",
        )}
        <View className="gap-4">
          {activityPlans.slice(0, PREVIEW_LIMIT).map((item) => (
            <ActivityPlanCard
              key={item.id}
              activityPlan={item as any}
              onPress={() => handleTemplatePress(item)}
              variant="default"
            />
          ))}
          {activityPlansInfiniteQuery.hasNextPage ? (
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
          ) : null}
        </View>
      </View>
    );
  };

  const renderTrainingPlansSection = () => {
    if (!selectedTypes.includes("trainingPlans") || trainingPlans.length === 0) {
      return null;
    }

    return (
      <View className="mb-6 px-4" testID="discover-section-trainingPlans">
        {renderSectionHeader(
          "trainingPlans",
          trainingPlans.length,
          "Compare commitment, cadence, and focus before you open a plan.",
        )}
        <View className="gap-3">
          {trainingPlans.slice(0, PREVIEW_LIMIT).map((item) => (
            <TrainingPlanCard
              key={item.id}
              template={item}
              onPress={() => handleTrainingPlanPress(item)}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderRoutesSection = () => {
    if (!selectedTypes.includes("routes") || routes.length === 0) {
      return null;
    }

    return (
      <View className="mb-6 px-4" testID="discover-section-routes">
        {renderSectionHeader(
          "routes",
          routes.length,
          "Open a route when the distance and climbing feel like the right fit.",
        )}
        <View className="gap-3">
          {routes.slice(0, PREVIEW_LIMIT).map((item) => (
            <RouteCard key={item.id} route={item} onPress={() => handleRoutePress(item)} />
          ))}
          {routesInfiniteQuery.hasNextPage ? (
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
          ) : null}
        </View>
      </View>
    );
  };

  const renderUsersSection = () => {
    if (!selectedTypes.includes("users") || users.length === 0) {
      return null;
    }

    return (
      <View className="mb-6 px-4" testID="discover-section-users">
        {renderSectionHeader(
          "users",
          users.length,
          "Profiles stay simple here: open one to decide whether you want to follow or message.",
        )}
        <View className="gap-3">
          {users.slice(0, PREVIEW_LIMIT).map((item) => (
            <UserCard key={item.id} user={item} onPress={() => handleUserPress(item)} />
          ))}
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (selectedTypes.length === 0) {
      return renderEmptyState();
    }

    if (isSelectedContentLoading && totalSelectedResults === 0) {
      return renderLoadingSkeleton();
    }

    if (totalSelectedResults === 0) {
      return renderEmptyState();
    }

    return (
      <ScrollView testID="discover-results-list" contentContainerStyle={{ paddingBottom: 32 }}>
        {renderActivityPlansSection()}
        {renderTrainingPlansSection()}
        {renderRoutesSection()}
        {renderUsersSection()}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="discover-screen">
      <AppHeader title="Discover" />
      {renderSearchInput()}
      {renderContent()}
      <DiscoverFilterSheet
        discoverTypeFilters={draftTypeFilters}
        onDiscoverTypeFiltersChange={setDraftTypeFilters}
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

  const isResetDisabled = areAllTypesSelected(discoverTypeFilters.selectedTypes);

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
              Choose which result types stay visible in Discover.
            </Text>
          </View>

          <View className="mt-6 gap-3">
            <Text className="text-sm font-medium text-foreground">Include content types</Text>
            <View className="flex-row flex-wrap gap-2">
              {TABS.map((tab) => {
                const isActive = discoverTypeFilters.selectedTypes.includes(tab.id);

                return (
                  <FilterChip
                    key={tab.id}
                    label={tab.label}
                    isActive={isActive}
                    onPress={() => {
                      onDiscoverTypeFiltersChange({
                        selectedTypes: isActive
                          ? discoverTypeFilters.selectedTypes.filter((type) => type !== tab.id)
                          : [...discoverTypeFilters.selectedTypes, tab.id],
                      });
                    }}
                    testID={`discover-filter-type-${tab.id}`}
                  />
                );
              })}
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
      className="gap-3 rounded-2xl border border-border bg-card p-4"
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
      className="gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1.5">
          <View className="self-start rounded-full bg-muted px-2.5 py-1">
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
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
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
