/**
 * Route Picker Page
 *
 * Full-screen page for selecting/detaching routes during recording.
 * Accessed via navigation from footer "Route" tile.
 *
 * Features:
 * - Display list of available routes
 * - "Detach Route" option if route currently attached
 * - Standard back navigation via header
 * - Recording continues in background
 */

import React, { useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { Check } from "lucide-react-native";
import { trpc } from "@/lib/trpc";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";

export default function RoutePickerPage() {
  const service = useSharedActivityRecorder();
  const { attachRoute, detachRoute } = useRecordingConfiguration(service);

  // Fetch routes (filter by current activity category)
  const { data: routes, isLoading } = trpc.routes.list.useQuery({
    activityCategory: service?.selectedActivityCategory,
    limit: 50,
  });

  // Handle route selection
  const handleRoutePress = useCallback(
    (routeId: string) => {
      attachRoute(routeId);
      router.back();
    },
    [attachRoute],
  );

  // Handle detach route
  const handleDetach = useCallback(() => {
    detachRoute();
    router.back();
  }, [detachRoute]);

  // TODO: Get current route ID from service
  // Routes are currently only loaded via plans
  const currentRouteId = null;

  // Extract routes from paginated response
  const routesList = routes?.routes || [];

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-8">
            <ActivityIndicator size="large" />
            <Text className="text-sm text-muted-foreground mt-2">
              Loading routes...
            </Text>
          </View>
        )}

        {/* Detach Route Option (if route attached) */}
        {!isLoading && currentRouteId && (
          <Pressable
            onPress={handleDetach}
            className="bg-card p-4 rounded-lg border border-border mb-3"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-base font-medium text-destructive">
                  Detach Current Route
                </Text>
                <Text className="text-sm text-muted-foreground mt-1">
                  Remove route from this workout
                </Text>
              </View>
            </View>
          </Pressable>
        )}

        {/* Routes List */}
        {!isLoading && routesList.length > 0 ? (
          <View className="gap-3 pb-6">
            {routesList.map((route) => (
              <RouteListItem
                key={route.id}
                route={route}
                isSelected={route.id === currentRouteId}
                onPress={() => handleRoutePress(route.id)}
              />
            ))}
          </View>
        ) : (
          !isLoading && (
            <View className="items-center justify-center py-8">
              <Text className="text-sm text-muted-foreground">
                No routes available
              </Text>
              <Text className="text-xs text-muted-foreground mt-1">
                Upload routes from the Library tab
              </Text>
            </View>
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
  onPress: () => void;
}

function RouteListItem({ route, isSelected, onPress }: RouteListItemProps) {
  // Format distance (meters to km)
  const distanceKm = (route.total_distance / 1000).toFixed(2);

  return (
    <Pressable
      onPress={onPress}
      className="bg-card p-4 rounded-lg border border-border"
      style={{
        borderColor: isSelected ? "rgb(34, 197, 94)" : undefined,
        borderWidth: isSelected ? 2 : 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-base font-medium">{route.name}</Text>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-sm text-muted-foreground">
              {distanceKm} km
            </Text>
            <Text className="text-sm text-muted-foreground">•</Text>
            <Text className="text-sm text-muted-foreground capitalize">
              {route.activity_category}
            </Text>
          </View>
          {route.description && (
            <Text className="text-sm text-muted-foreground mt-1">
              {route.description}
            </Text>
          )}
        </View>

        {isSelected && (
          <Icon as={Check} size={20} className="text-green-500 ml-2" />
        )}
      </View>
    </Pressable>
  );
}
