/**
 * Route Picker Page
 *
 * Full-screen page for selecting/detaching routes during recording.
 * Accessed via navigation from footer "Route" tile.
 *
 * Features:
 * - Display list of available routes
 * - Search and filter functionality
 * - "Detach Route" option if route currently attached
 * - Preview/Confirmation workflow before attaching
 * - Standard back navigation via header
 * - Recording continues in background
 */

import type { ActivityCategory } from "@repo/core";
import { EmptyStateCard } from "@repo/ui/components/empty-state-card";
import { Icon } from "@repo/ui/components/icon";
import { Input } from "@repo/ui/components/input";
import { Text } from "@repo/ui/components/text";
import { useRouter } from "expo-router";
import { Check, Route, Search } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { api } from "@/lib/api";
import { useRecordingState } from "@/lib/hooks/useActivityRecorder";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";
import { useDedupedPush } from "@/lib/navigation/useDedupedPush";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

const CATEGORY_OPTIONS: {
  value: ActivityCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "All Categories" },
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
];

export default function RoutePickerPage() {
  const router = useRouter();
  const pushIfNotCurrent = useDedupedPush();
  const service = useSharedActivityRecorder();
  const recordingState = useRecordingState(service);
  const { attachedRouteId, detachRoute } = useRecordingConfiguration(service);
  const isSetupLocked = recordingState !== "pending" && recordingState !== "ready";

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | "all">("all");

  // Fetch routes (no category filter in query since we filter client-side)
  const { data: routes, isLoading } = api.routes.list.useInfiniteQuery(
    {
      limit: 100,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  // Handle route selection - Navigate to preview/confirmation screen
  const handleRoutePress = useCallback((routeId: string) => {
    pushIfNotCurrent({
      pathname: "/record/route-preview",
      params: { routeId },
    } as any);
  }, [pushIfNotCurrent]);

  // Handle detach route
  const handleDetach = useCallback(() => {
    detachRoute();
    router.back();
  }, [detachRoute]);

  const currentRouteId = attachedRouteId;

  // Extract routes from paginated response
  const routesList = routes?.pages.flatMap((page: any) => page.items) || [];

  // Filter routes by search and category filter
  const filteredRoutes = React.useMemo(() => {
    return routesList.filter((route: any) => {
      // Category filter
      if (categoryFilter !== "all" && route.activity_category !== categoryFilter) {
        return false;
      }

      // Search filter (searches name and description)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const name = route.name?.toLowerCase() || "";
        const description = route.description?.toLowerCase() || "";

        if (!name.includes(query) && !description.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [routesList, searchQuery, categoryFilter]);

  return (
    <View className="flex-1 bg-background" testID="record-route-screen">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Search Input */}
        <View className="mb-3">
          <View className="relative">
            <Icon
              as={Search}
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground z-10"
              style={{ top: "50%", transform: [{ translateY: -9 }] }}
            />
            <Input
              placeholder="Search routes..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="pl-10"
              testID="record-route-search-input"
            />
          </View>
        </View>

        {/* Category Filter Dropdown */}
        <View className="mb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
            <View className="flex-row gap-2">
              {CATEGORY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => setCategoryFilter(option.value)}
                  className="px-3 py-2 rounded-full border border-border"
                  testID={`record-route-filter-${option.value}`}
                  style={{
                    backgroundColor:
                      categoryFilter === option.value ? "rgb(34, 197, 94)" : undefined,
                  }}
                >
                  <Text
                    className="text-sm font-medium"
                    style={{
                      color: categoryFilter === option.value ? "white" : undefined,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">Loading routes...</Text>
          </View>
        )}

        {isSetupLocked && (
          <View className="mb-3 rounded-lg border border-border bg-card p-4">
            <Text className="text-base font-medium text-foreground">
              Route setup is locked after recording starts
            </Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Finish this workout to attach a different route or detach the current one.
            </Text>
          </View>
        )}

        {/* Detach Route Option (if route attached) */}
        {!isLoading && currentRouteId && !isSetupLocked && (
          <Pressable
            onPress={handleDetach}
            className="bg-card p-4 rounded-lg border border-border mb-3"
            testID="record-route-detach-button"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-medium text-destructive">Detach Current Route</Text>
                <Text className="text-sm text-muted-foreground mt-1">
                  Remove route from this workout
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Routes List */}
        {!isLoading && filteredRoutes.length > 0 ? (
          <View className="gap-3 pb-6">
            {filteredRoutes.map((route: any) => (
              <RouteListItem
                key={route.id}
                route={route}
                disabled={isSetupLocked}
                isSelected={route.id === currentRouteId}
                onPress={() => handleRoutePress(route.id)}
              />
            ))}
          </View>
        ) : (
          !isLoading && (
            <EmptyStateCard
              icon={Route}
              title={
                searchQuery || categoryFilter !== "all"
                  ? "No matching routes found"
                  : "No routes available"
              }
              description={
                searchQuery || categoryFilter !== "all"
                  ? "Try adjusting your search or filter"
                  : "Upload routes from the Library tab"
              }
              iconSize={32}
            />
          )
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Route List Item Component
 */
interface RouteListItemProps {
  route: {
    id: string;
    name: string;
    description: string | null;
    total_distance: number;
    activity_category: string;
  };
  isSelected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function RouteListItem({ route, isSelected, disabled = false, onPress }: RouteListItemProps) {
  // Format distance (meters to km)
  const distanceKm = (route.total_distance / 1000).toFixed(2);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className="bg-card p-4 rounded-lg border border-border"
      testID={`record-route-item-${route.id}`}
      style={{
        borderColor: isSelected ? "rgb(34, 197, 94)" : undefined,
        borderWidth: isSelected ? 2 : 1,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base font-medium">{route.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-sm text-muted-foreground">{distanceKm} km</Text>
            <Text className="text-sm text-muted-foreground">•</Text>
            <Text className="text-sm text-muted-foreground capitalize">
              {route.activity_category}
            </Text>
          </View>
          {route.description && (
            <Text className="text-sm text-muted-foreground mt-1">{route.description}</Text>
          )}
        </View>

        {isSelected && <Icon as={Check} size={20} className="text-green-500 ml-2" />}
      </View>
    </Pressable>
  );
}
