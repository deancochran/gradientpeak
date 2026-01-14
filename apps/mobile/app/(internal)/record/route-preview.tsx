/**
 * Route Preview/Confirmation Screen
 *
 * Displays route details and map preview before confirming attachment.
 * User can confirm to attach the route or cancel to go back.
 *
 * Features:
 * - Route details (name, description, distance, category)
 * - Map view with route visualization
 * - Confirm button to attach route
 * - Cancel button to go back
 */

import React from "react";
import { View, ScrollView, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ActivityRouteMap } from "@/components/activity/maps/ActivityRouteMap";
import { trpc } from "@/lib/trpc";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";

export default function RoutePreviewPage() {
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const service = useSharedActivityRecorder();
  const { attachRoute } = useRecordingConfiguration(service);

  // Fetch full route data including coordinates
  const { data: routeData, isLoading, error } = trpc.routes.loadFull.useQuery(
    { id: routeId! },
    { enabled: !!routeId }
  );

  const handleConfirm = () => {
    if (routeId) {
      attachRoute(routeId);
      // Navigate back to main record screen (go back 2 screens)
      router.back();
      router.back();
    }
  };

  const handleCancel = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" />
        <Text className="text-sm text-muted-foreground mt-2">
          Loading route preview...
        </Text>
      </View>
    );
  }

  if (error || !routeData) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-4">
        <Text className="text-base text-destructive mb-2">
          Failed to load route
        </Text>
        <Text className="text-sm text-muted-foreground mb-4 text-center">
          {error?.message || "Route not found"}
        </Text>
        <Button onPress={handleCancel}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  // Convert coordinates to map format
  const mapCoordinates = routeData.coordinates.map((coord) => ({
    latitude: coord.lat,
    longitude: coord.lng,
  }));

  return (
    <View className="flex-1 bg-background">
      <ScrollView className="flex-1 px-4 pt-4">
        {/* Route Details */}
        <View className="mb-4">
          <Text className="text-2xl font-bold mb-2">{routeData.name}</Text>
          {routeData.description && (
            <Text className="text-base text-muted-foreground mb-2">
              {routeData.description}
            </Text>
          )}
          <View className="flex-row gap-4 mt-2">
            <View>
              <Text className="text-xs text-muted-foreground">Distance</Text>
              <Text className="text-base font-medium">
                {(routeData.total_distance / 1000).toFixed(2)} km
              </Text>
            </View>
            <View>
              <Text className="text-xs text-muted-foreground">Category</Text>
              <Text className="text-base font-medium capitalize">
                {routeData.activity_category}
              </Text>
            </View>
          </View>
        </View>

        {/* Map Preview */}
        {mapCoordinates.length > 0 ? (
          <View className="mb-4">
            <ActivityRouteMap
              coordinates={mapCoordinates}
              title="Route Preview"
              height={400}
              showMarkers={true}
            />
          </View>
        ) : (
          <View className="bg-muted p-6 rounded-lg mb-4">
            <Text className="text-sm text-muted-foreground text-center">
              No GPS data available for this route
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View className="p-4 border-t border-border flex-row gap-3">
        <Button
          onPress={handleCancel}
          variant="outline"
          className="flex-1"
        >
          <Text>Cancel</Text>
        </Button>
        <Button
          onPress={handleConfirm}
          className="flex-1"
        >
          <Text className="text-primary-foreground">Confirm & Attach</Text>
        </Button>
      </View>
    </View>
  );
}
