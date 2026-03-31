import { decodePolyline } from "@repo/core";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Calendar, Heart, MapPin, Trash2, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { api } from "@/lib/api";

const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  outdoor_run: "🏃 Outdoor Run",
  outdoor_bike: "🚴 Outdoor Bike",
  indoor_treadmill: "🏃 Indoor Treadmill",
  indoor_bike_trainer: "🚴 Indoor Bike Trainer",
};

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();
  const mapRef = useRef<MapView>(null);

  const { data: route, isLoading } = api.routes.get.useQuery({ id: id! }, { enabled: !!id });

  const deleteMutation = useReliableMutation(api.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
    onSuccess: () => router.back(),
  });

  // Like state and mutation
  const [isLiked, setIsLiked] = useState(route?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(route?.has_liked ? 1 : 0);

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(route?.has_liked ?? false);
      setLikesCount(route?.has_liked ? 1 : 0);
    },
  });

  const handleToggleLike = () => {
    if (!route?.id) return;
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(route.id)) {
      Alert.alert("Error", "Cannot like this item - invalid ID");
      return;
    }
    const newLikedState = !isLiked;
    setIsLiked(newLikedState);
    setLikesCount((prev: number) => (newLikedState ? prev + 1 : prev - 1));
    toggleLikeMutation.mutate({
      entity_id: route.id,
      entity_type: "route",
    });
  };

  // Update like state when route data loads
  React.useEffect(() => {
    if (route) {
      setIsLiked(route.has_liked ?? false);
      setLikesCount(route.has_liked ? 1 : 0);
    }
  }, [route?.has_liked]);

  const coordinates = useMemo(() => (route ? decodePolyline(route.polyline) : []), [route]);

  const handleDelete = () => {
    if (!route) return;

    Alert.alert(
      "Delete Route",
      `Are you sure you want to delete "${route.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: route.id }),
        },
      ],
    );
  };

  // Fit map to route coordinates on mount
  useEffect(() => {
    if (coordinates.length > 0 && mapRef.current) {
      const timeout = setTimeout(() => {
        mapRef.current?.fitToCoordinates(coordinates, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: false,
        });
      }, 100);

      return () => clearTimeout(timeout);
    }
  }, [coordinates]);

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="route-detail-loading"
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        testID="route-detail-not-found"
      >
        <Text>Route not found</Text>
      </View>
    );
  }

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <View className="flex-1 bg-background" testID="route-detail-screen">
      <ScrollView>
        {/* Map */}
        <View className="h-64 bg-muted">
          {coordinates.length > 0 ? (
            <MapView
              ref={mapRef}
              style={{ flex: 1 }}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: coordinates[Math.floor(coordinates.length / 2)]?.latitude || 0,
                longitude: coordinates[Math.floor(coordinates.length / 2)]?.longitude || 0,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              mapType="standard"
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={true}
              showsScale={true}
              toolbarEnabled={false}
            >
              {/* Route Polyline */}
              <Polyline
                coordinates={coordinates}
                strokeColor="#f97316"
                strokeWidth={4}
                lineCap="round"
                lineJoin="round"
              />

              {/* Start Marker */}
              <Marker coordinate={coordinates[0]} anchor={{ x: 0.5, y: 0.5 }} title="Start">
                <View className="w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
              </Marker>

              {/* End Marker */}
              <Marker
                coordinate={coordinates[coordinates.length - 1]}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Finish"
              >
                <View className="w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
              </Marker>
            </MapView>
          ) : (
            <View className="flex-1 items-center justify-center">
              <Text className="text-muted-foreground">No GPS data available</Text>
            </View>
          )}
        </View>

        <View className="p-4 gap-4">
          {/* Header */}
          <View className="gap-3">
            <View>
              <Text className="text-2xl font-bold mb-2">{route.name}</Text>
              <Text className="text-base text-muted-foreground">
                {ACTIVITY_CATEGORY_LABELS[route.activity_category] || route.activity_category}
              </Text>
            </View>

            <View className="flex-row flex-wrap gap-2">
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground">
                  {formatDistance(route.total_distance)}
                </Text>
              </View>
              {route.total_ascent != null && route.total_ascent > 0 ? (
                <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                  <Text className="text-xs font-medium text-foreground">
                    {route.total_ascent}m climb
                  </Text>
                </View>
              ) : null}
              <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
                <Text className="text-xs font-medium text-foreground">
                  Uploaded {formatDate(route.created_at)}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Card */}
          <Card>
            <CardContent className="p-4">
              <Text className="text-sm font-semibold mb-3">Route Statistics</Text>

              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MapPin size={20} className="text-muted-foreground" />
                    <Text className="text-muted-foreground">Distance</Text>
                  </View>
                  <Text className="font-semibold">{formatDistance(route.total_distance)}</Text>
                </View>

                {route.total_ascent != null && route.total_ascent > 0 && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <TrendingUp size={20} className="text-green-600" />
                      <Text className="text-muted-foreground">Elevation Gain</Text>
                    </View>
                    <Text className="font-semibold">{route.total_ascent}m</Text>
                  </View>
                )}

                {route.total_descent != null && route.total_descent > 0 && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <TrendingDown size={20} className="text-red-600" />
                      <Text className="text-muted-foreground">Elevation Loss</Text>
                    </View>
                    <Text className="font-semibold">{route.total_descent}m</Text>
                  </View>
                )}

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Calendar size={20} className="text-muted-foreground" />
                    <Text className="text-muted-foreground">Uploaded</Text>
                  </View>
                  <Text className="font-semibold">{formatDate(route.created_at)}</Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Description Card */}
          {route.description && (
            <Card>
              <CardContent className="p-4">
                <Text className="text-sm font-semibold mb-2">Description</Text>
                <Text className="text-muted-foreground">{route.description}</Text>
              </CardContent>
            </Card>
          )}

          {/* Source Card */}
          {route.source && (
            <Card>
              <CardContent className="p-4">
                <Text className="text-sm font-semibold mb-2">Source</Text>
                <Text className="text-muted-foreground">{route.source}</Text>
              </CardContent>
            </Card>
          )}

          <View className="gap-3 pb-6">
            <Pressable
              onPress={handleToggleLike}
              testID="route-detail-like-button"
              className="flex-row items-center justify-center gap-2 py-3 rounded-lg border border-border bg-card"
            >
              <Icon
                as={Heart}
                size={20}
                className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
              />
              <Text
                className={isLiked ? "text-red-500 font-medium" : "text-foreground font-medium"}
              >
                {isLiked ? "Liked" : "Like this route"}
              </Text>
              {likesCount > 0 && <Text className="text-muted-foreground">({likesCount})</Text>}
            </Pressable>

            <Card className="border-destructive/40">
              <CardContent className="p-4 gap-3">
                <View className="gap-1">
                  <Text className="text-sm font-semibold text-foreground">Route management</Text>
                  <Text className="text-xs text-muted-foreground">
                    Delete only if you no longer want this route in your personal library.
                  </Text>
                </View>
                <Button
                  variant="destructive"
                  className="flex-row items-center gap-2"
                  onPress={handleDelete}
                  disabled={deleteMutation.isPending}
                  testID="route-detail-delete-button"
                >
                  <Trash2 className="text-destructive-foreground" size={20} />
                  <Text className="text-destructive-foreground">
                    {deleteMutation.isPending ? "Deleting..." : "Delete Route"}
                  </Text>
                </Button>
              </CardContent>
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
