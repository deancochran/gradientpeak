import { AppHeader, ListSkeleton } from "@/components/shared";
import { ActivityPlanCard } from "@/components/shared/ActivityPlanCard";
import { PastActivityCard } from "@/components/PastActivityCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ROUTES } from "@/lib/constants/routes";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { decodePolyline } from "@repo/core";
import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  ChevronRight,
  Dumbbell,
  Library,
  MapPin,
  Plus,
  Route,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

type ResourceType =
  | "activity_plans"
  | "training_plans"
  | "activities"
  | "routes";

const VALID_RESOURCE_TYPES = new Set<ResourceType>([
  "activity_plans",
  "training_plans",
  "activities",
  "routes",
]);

function parseResourceParam(
  resource: string | string[] | undefined,
): ResourceType | null {
  const value = Array.isArray(resource) ? resource[0] : resource;
  if (!value || !VALID_RESOURCE_TYPES.has(value as ResourceType)) {
    return null;
  }

  return value as ResourceType;
}

const RESOURCE_OPTIONS = [
  { value: "activity_plans" as const, label: "Activity Plans", icon: Dumbbell },
  { value: "training_plans" as const, label: "Training Plans", icon: Calendar },
  { value: "activities" as const, label: "Past Activities", icon: Activity },
  { value: "routes" as const, label: "Routes", icon: Route },
];

// Helper functions extracted outside component to prevent hook violations

// Item rendering components
function TrainingPlanItem({
  item,
  onPress,
  onActivate,
}: {
  item: any;
  onPress: () => void;
  onActivate?: (id: string) => void;
}) {
  return (
    <Card className={item.is_active ? "border-primary" : ""}>
      <Pressable onPress={onPress}>
        <CardContent className="p-4">
          <View className="flex-row items-start justify-between mb-3">
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-2">
                <View
                  className={`w-2 h-2 rounded-full ${
                    item.is_active ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
                <Text className="text-xs font-medium text-muted-foreground uppercase">
                  {item.is_active ? "Active" : "Inactive"}
                </Text>
              </View>
              <Text className="text-xl font-bold mb-1">{item.name}</Text>
              {item.description && (
                <Text className="text-sm text-muted-foreground">
                  {item.description}
                </Text>
              )}
            </View>
            <Icon
              as={ChevronRight}
              size={20}
              className="text-muted-foreground ml-2"
            />
          </View>

          <View className="flex-row gap-3 pt-3 border-t border-border">
            <View className="flex-1">
              <Text className="text-xs text-muted-foreground mb-1">
                Created
              </Text>
              <Text className="text-sm font-semibold">
                {new Date(item.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </View>
          </View>
        </CardContent>
      </Pressable>

      {/* Action Buttons */}
      {!item.is_active && onActivate && (
        <CardContent className="pt-0 pb-4 px-4">
          <Button
            size="sm"
            onPress={() => onActivate(item.id)}
            className="w-full"
          >
            <Text className="text-primary-foreground font-semibold text-sm">
              Set as Active Plan
            </Text>
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

function ActivityItem({ item, onPress }: { item: any; onPress: () => void }) {
  return <PastActivityCard activity={item} onPress={onPress} />;
}

function RouteItem({ item, onPress }: { item: any; onPress: () => void }) {
  const coordinates = item.polyline ? decodePolyline(item.polyline) : [];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <CardContent className="p-0">
          {coordinates.length > 0 && (
            <View className="h-32 bg-muted overflow-hidden rounded-t-lg">
              <MapView
                style={{ flex: 1 }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
                provider={PROVIDER_DEFAULT}
                initialRegion={{
                  latitude:
                    coordinates[Math.floor(coordinates.length / 2)].latitude,
                  longitude:
                    coordinates[Math.floor(coordinates.length / 2)].longitude,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
              >
                <Polyline
                  coordinates={coordinates}
                  strokeColor="#3b82f6"
                  strokeWidth={3}
                  lineCap="round"
                  lineJoin="round"
                />
              </MapView>
            </View>
          )}

          <View className="p-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-lg font-semibold flex-1" numberOfLines={1}>
                {item.name}
              </Text>
              <Icon
                as={ChevronRight}
                size={20}
                className="text-muted-foreground ml-2"
              />
            </View>

            {item.description && (
              <Text
                className="text-sm text-muted-foreground mb-3"
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}

            <View className="flex-row gap-4">
              <View className="flex-row items-center gap-1">
                <Icon as={MapPin} size={16} className="text-muted-foreground" />
                <Text className="text-sm">
                  {(item.total_distance / 1000).toFixed(1)} km
                </Text>
              </View>

              {item.total_ascent > 0 && (
                <View className="flex-row items-center gap-1">
                  <Icon as={TrendingUp} size={16} className="text-green-600" />
                  <Text className="text-sm">{item.total_ascent}m</Text>
                </View>
              )}

              {item.total_descent > 0 && (
                <View className="flex-row items-center gap-1">
                  <Icon as={TrendingDown} size={16} className="text-red-600" />
                  <Text className="text-sm">{item.total_descent}m</Text>
                </View>
              )}
            </View>
          </View>
        </CardContent>
      </Card>
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { resource } = useLocalSearchParams<{ resource?: string | string[] }>();
  const utils = trpc.useUtils();
  const routeResource = useMemo(() => parseResourceParam(resource), [resource]);

  const [selectedResource, setSelectedResource] = useState<ResourceType>(
    routeResource ?? "activity_plans",
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!routeResource || routeResource === selectedResource) {
      return;
    }

    setSelectedResource(routeResource);
    setSearchQuery("");
  }, [routeResource, selectedResource]);

  // Training plan activation mutation
  const activateMutation = useReliableMutation(trpc.trainingPlans.activate, {
    invalidate: [utils.trainingPlans],
    onSuccess: () => {
      Alert.alert("Success", "Training plan activated successfully");
      refetchTrainingPlans();
    },
    onError: (error) => {
      Alert.alert(
        "Activation Failed",
        error.message || "Failed to activate plan",
      );
    },
  });

  // Activity Plans Query
  const {
    data: activityPlansData,
    isLoading: loadingActivityPlans,
    refetch: refetchActivityPlans,
    fetchNextPage: fetchNextActivityPlans,
    hasNextPage: hasNextActivityPlans,
    isFetchingNextPage: isFetchingNextActivityPlans,
  } = trpc.activityPlans.list.useInfiniteQuery(
    {
      includeOwnOnly: true,
      includeSystemTemplates: false,
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: selectedResource === "activity_plans",
    },
  );

  // Training Plans Query
  const {
    data: trainingPlans,
    isLoading: loadingTrainingPlans,
    refetch: refetchTrainingPlans,
  } = trpc.trainingPlans.list.useQuery(undefined, {
    enabled: selectedResource === "training_plans",
  });

  // Activities Query
  const {
    data: activitiesData,
    isLoading: loadingActivities,
    refetch: refetchActivities,
  } = trpc.activities.listPaginated.useQuery(
    {
      limit: 50,
      offset: 0,
      sort_by: "date",
      sort_order: "desc",
    },
    {
      enabled: selectedResource === "activities",
    },
  );

  // Routes Query
  const {
    data: routesData,
    isLoading: loadingRoutes,
    refetch: refetchRoutes,
    fetchNextPage: fetchNextRoutes,
    hasNextPage: hasNextRoutes,
    isFetchingNextPage: isFetchingNextRoutes,
  } = trpc.routes.list.useInfiniteQuery(
    {
      limit: 20,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: selectedResource === "routes",
    },
  );

  // Flatten paginated data
  const activityPlans = useMemo(
    () => activityPlansData?.pages.flatMap((page) => page.items) ?? [],
    [activityPlansData],
  );

  const activities = useMemo(
    () => activitiesData?.items ?? [],
    [activitiesData],
  );

  const routes = useMemo(
    () => routesData?.pages.flatMap((page) => page.items) ?? [],
    [routesData],
  );

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    const query = searchQuery.toLowerCase();
    if (!query) {
      if (selectedResource === "activity_plans") return activityPlans;
      if (selectedResource === "training_plans") return trainingPlans || [];
      if (selectedResource === "activities") return activities;
      if (selectedResource === "routes") return routes;
      return [];
    }

    if (selectedResource === "activity_plans") {
      return activityPlans.filter((plan) =>
        plan.name.toLowerCase().includes(query),
      );
    }
    if (selectedResource === "training_plans") {
      return (trainingPlans || []).filter((plan) =>
        plan.name.toLowerCase().includes(query),
      );
    }
    if (selectedResource === "activities") {
      return activities.filter((activity) =>
        activity.name.toLowerCase().includes(query),
      );
    }
    if (selectedResource === "routes") {
      return routes.filter((route) => route.name.toLowerCase().includes(query));
    }
    return [];
  }, [
    searchQuery,
    selectedResource,
    activityPlans,
    trainingPlans,
    activities,
    routes,
  ]);

  // Determine loading state
  const isLoading =
    (selectedResource === "activity_plans" && loadingActivityPlans) ||
    (selectedResource === "training_plans" && loadingTrainingPlans) ||
    (selectedResource === "activities" && loadingActivities) ||
    (selectedResource === "routes" && loadingRoutes);

  // Determine if there's more to load
  const hasMore =
    (selectedResource === "activity_plans" && hasNextActivityPlans) ||
    (selectedResource === "routes" && hasNextRoutes);

  const isFetchingMore =
    (selectedResource === "activity_plans" && isFetchingNextActivityPlans) ||
    (selectedResource === "routes" && isFetchingNextRoutes);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (selectedResource === "activity_plans") refetchActivityPlans();
    if (selectedResource === "training_plans") refetchTrainingPlans();
    if (selectedResource === "activities") refetchActivities();
    if (selectedResource === "routes") refetchRoutes();
  }, [
    selectedResource,
    refetchActivityPlans,
    refetchTrainingPlans,
    refetchActivities,
    refetchRoutes,
  ]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (
      selectedResource === "activity_plans" &&
      hasNextActivityPlans &&
      !isFetchingNextActivityPlans
    ) {
      fetchNextActivityPlans();
    }
    if (
      selectedResource === "routes" &&
      hasNextRoutes &&
      !isFetchingNextRoutes
    ) {
      fetchNextRoutes();
    }
  }, [
    selectedResource,
    hasNextActivityPlans,
    isFetchingNextActivityPlans,
    fetchNextActivityPlans,
    hasNextRoutes,
    isFetchingNextRoutes,
    fetchNextRoutes,
  ]);

  // Handle item tap
  const handleItemTap = useCallback(
    (id: string) => {
      if (selectedResource === "activity_plans") {
        router.push({
          pathname: "/activity-plan-detail" as any,
          params: { planId: id },
        });
      } else if (selectedResource === "training_plans") {
        router.push(`${ROUTES.PLAN.TRAINING_PLAN.INDEX}?id=${id}` as any);
      } else if (selectedResource === "activities") {
        router.push(`/activity-detail?id=${id}` as any);
      } else if (selectedResource === "routes") {
        router.push(`/route-detail?id=${id}` as any);
      }
    },
    [selectedResource, router],
  );

  // Handle create new
  const handleCreate = useCallback(() => {
    if (selectedResource === "activity_plans") {
      router.push("/create-activity-plan" as any);
    } else if (selectedResource === "training_plans") {
      router.push(ROUTES.PLAN.TRAINING_PLAN.CREATE as any);
    } else if (selectedResource === "routes") {
      router.push("/route-upload" as any);
    }
  }, [selectedResource, router]);

  // Handle training plan activation
  const handleActivateTrainingPlan = useCallback(
    async (planId: string) => {
      await activateMutation.mutateAsync({ id: planId });
    },
    [activateMutation],
  );

  // Render empty state
  const renderEmptyState = useCallback(() => {
    const config = {
      activity_plans: {
        message: "No activity plans yet",
        action: "Create Activity Plan",
      },
      training_plans: {
        message: "No training plans yet",
        action: "Create Training Plan",
      },
      activities: {
        message: "No activities recorded yet",
        action: null,
      },
      routes: {
        message: "No routes yet",
        action: "Upload Route",
      },
    }[selectedResource];

    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <Icon
          as={Library}
          size={48}
          className="text-muted-foreground/40 mb-3"
        />
        <Text className="text-muted-foreground text-center mb-4">
          {config.message}
        </Text>
        {config.action && (
          <Button onPress={handleCreate}>
            <Icon
              as={Plus}
              size={16}
              className="text-primary-foreground mr-2"
            />
            <Text className="text-primary-foreground font-semibold">
              {config.action}
            </Text>
          </Button>
        )}
      </View>
    );
  }, [selectedResource, handleCreate]);

  // Render item based on type - simplified to use memoized components
  const renderItem = useCallback(
    (item: any) => {
      const handlePress = () => handleItemTap(item.id);

      if (selectedResource === "activity_plans") {
        return (
          <ActivityPlanCard
            key={item.id}
            activityPlan={item}
            onPress={handlePress}
            variant="default"
            showScheduleInfo={false}
          />
        );
      }

      if (selectedResource === "training_plans") {
        return (
          <TrainingPlanItem
            key={item.id}
            item={item}
            onPress={handlePress}
            onActivate={handleActivateTrainingPlan}
          />
        );
      }

      if (selectedResource === "activities") {
        return <ActivityItem key={item.id} item={item} onPress={handlePress} />;
      }

      if (selectedResource === "routes") {
        return <RouteItem key={item.id} item={item} onPress={handlePress} />;
      }

      return null;
    },
    [selectedResource, handleItemTap],
  );

  return (
    <View className="flex-1 bg-background">
      <AppHeader title="Library" />

      {/* Resource Type Selector */}
      <View className="px-4 pt-4 pb-3 border-b border-border">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
        >
          {RESOURCE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              onPress={() => {
                setSelectedResource(option.value);
                setSearchQuery("");
              }}
              activeOpacity={0.7}
              className={`flex-row items-center gap-2 px-4 py-2 rounded-full border ${
                selectedResource === option.value
                  ? "bg-primary border-primary"
                  : "bg-background border-border"
              }`}
            >
              <Icon
                as={option.icon}
                size={18}
                className={
                  selectedResource === option.value
                    ? "text-primary-foreground"
                    : "text-foreground"
                }
              />
              <Text
                className={`font-medium ${
                  selectedResource === option.value
                    ? "text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Search Bar */}
        <View className="mt-3 flex-row items-center gap-2 px-3 py-2 rounded-lg bg-muted">
          <Icon as={Search} size={18} className="text-muted-foreground" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${RESOURCE_OPTIONS.find((o) => o.value === selectedResource)?.label.toLowerCase()}...`}
            className="flex-1 text-foreground"
            placeholderTextColor="#888"
          />
        </View>

        {/* Item Count */}
        <Text className="text-sm text-muted-foreground mt-3">
          {filteredItems.length} {filteredItems.length === 1 ? "item" : "items"}
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1">
        {isLoading && filteredItems.length === 0 ? (
          <View className="flex-1 p-4">
            <ListSkeleton count={5} />
          </View>
        ) : filteredItems.length === 0 ? (
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
            {filteredItems.map(renderItem)}

            {/* Load More */}
            {hasMore && (
              <View className="py-4 items-center">
                {isFetchingMore ? (
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

      {/* FAB - Only show for resources that can be created */}
      {selectedResource !== "activities" && (
        <TouchableOpacity
          onPress={handleCreate}
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
      )}
    </View>
  );
}
