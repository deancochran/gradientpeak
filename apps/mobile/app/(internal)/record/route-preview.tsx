import { decodePolyline } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import React, { useMemo } from "react";
import { Alert, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { api } from "@/lib/api";
import { useRecordingConfiguration } from "@/lib/hooks/useRecordingConfiguration";
import { useSharedActivityRecorder } from "@/lib/providers/ActivityRecorderProvider";

function formatDistance(meters: number | null | undefined) {
  if (!meters) return "-";
  return `${(meters / 1000).toFixed(2)} km`;
}

export default function RoutePreviewScreen() {
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const router = useRouter();
  const service = useSharedActivityRecorder();
  const { attachRoute, attachedRouteId, sessionContract } = useRecordingConfiguration(service);
  const canEditRoute = sessionContract?.editing.canEditRoute ?? true;

  const { data: route, isLoading } = api.routes.get.useQuery(
    { id: routeId ?? "" },
    { enabled: Boolean(routeId) },
  );

  const coordinates = useMemo(() => {
    if (!route?.polyline) return [];
    return decodePolyline(route.polyline);
  }, [route?.polyline]);

  const initialRegion = useMemo(() => {
    if (coordinates.length === 0) return null;

    const center = coordinates[Math.floor(coordinates.length / 2)];
    if (!center) return null;

    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [coordinates]);

  const handleAttach = async () => {
    if (!route?.id) return;

    if (!canEditRoute) {
      Alert.alert("Route Setup Locked", "Finish this workout to attach a different route.");
      return;
    }

    try {
      await attachRoute(route.id);
      router.back();
    } catch (error) {
      Alert.alert(
        "Route Update Failed",
        error instanceof Error ? error.message : "Unable to attach this route right now.",
      );
    }
  };

  const isAttached = route?.id === attachedRouteId;

  if (isLoading) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        testID="route-preview-loading"
      >
        <Text>Loading route preview...</Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background px-6"
        testID="route-preview-not-found"
      >
        <Text className="text-lg font-semibold">Route not found</Text>
        <Text className="mt-2 text-center text-muted-foreground">
          This route is no longer available for selection.
        </Text>
        <Button className="mt-4" variant="outline" onPress={() => router.back()}>
          <Text>Go Back</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" testID="route-preview-screen">
      <View className="h-72 bg-muted">
        {coordinates.length > 0 && initialRegion ? (
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_DEFAULT}
            initialRegion={initialRegion}
            showsCompass
            showsScale
            showsUserLocation={false}
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            <Polyline coordinates={coordinates} strokeColor="#f97316" strokeWidth={4} />
            <Marker coordinate={coordinates[0]!} title="Start" />
            <Marker coordinate={coordinates[coordinates.length - 1]!} title="Finish" />
          </MapView>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-muted-foreground">No map preview available</Text>
          </View>
        )}
      </View>

      <View className="flex-1 gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>{route.name}</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            {route.description ? (
              <Text className="text-sm text-muted-foreground">{route.description}</Text>
            ) : null}

            <View className="flex-row items-center gap-2">
              <MapPin size={16} className="text-muted-foreground" />
              <Text>{formatDistance(route.total_distance)}</Text>
            </View>
          </CardContent>
        </Card>

        <View className="mt-auto gap-3 pb-4">
          <Button
            onPress={handleAttach}
            disabled={!canEditRoute}
            testID="route-preview-attach-button"
          >
            <Text>{isAttached ? "Reattach Route" : "Attach Route"}</Text>
          </Button>
          <Button
            variant="outline"
            onPress={() => router.back()}
            testID="route-preview-cancel-button"
          >
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
