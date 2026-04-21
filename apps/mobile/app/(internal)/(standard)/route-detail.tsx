import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ellipsis, Heart, MapPin, Trash2, TrendingDown, TrendingUp } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { ElevationProfileChart } from "@/components/activity/charts/ElevationProfileChart";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { EntityCommentsSection } from "@/components/social/EntityCommentsSection";
import { api } from "@/lib/api";
import { getActivityConfig } from "@/lib/constants/activities";
import { useEntityCommentsController } from "@/lib/hooks/useEntityCommentsController";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import type { DecompressedStream } from "@/lib/utils/streamDecompression";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

function calculateCoordinateDistance(left: RouteCoordinate, right: RouteCoordinate): number {
  const earthRadiusMeters = 6371e3;
  const lat1 = (left.latitude * Math.PI) / 180;
  const lat2 = (right.latitude * Math.PI) / 180;
  const deltaLat = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLng = ((right.longitude - left.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function decodeRoutePolyline(polyline?: string | null): RouteCoordinate[] {
  if (!polyline) {
    return [];
  }

  const encoded = polyline;
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates: RouteCoordinate[] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);

    const deltaLatitude = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += deltaLatitude;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index <= encoded.length);

    const deltaLongitude = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += deltaLongitude;

    coordinates.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return coordinates;
}

function buildRouteStreams(
  coordinates: RouteCoordinate[] | undefined,
): { distanceStream: DecompressedStream; elevationStream: DecompressedStream } | null {
  if (!coordinates || coordinates.length < 2) {
    return null;
  }

  const elevatedCoordinates = coordinates.filter((point) => typeof point.altitude === "number");
  if (elevatedCoordinates.length < 2) {
    return null;
  }

  const distanceValues: number[] = [];
  const elevationValues: number[] = [];
  const timestamps: number[] = [];
  let cumulativeDistance = 0;

  elevatedCoordinates.forEach((point, index) => {
    if (index > 0) {
      cumulativeDistance += calculateCoordinateDistance(elevatedCoordinates[index - 1]!, point);
    }

    distanceValues.push(cumulativeDistance);
    elevationValues.push(point.altitude as number);
    timestamps.push(index);
  });

  return {
    distanceStream: {
      type: "distance",
      dataType: "float",
      values: distanceValues,
      timestamps,
      sampleCount: distanceValues.length,
    },
    elevationStream: {
      type: "elevation",
      dataType: "float",
      values: elevationValues,
      timestamps,
      sampleCount: elevationValues.length,
    },
  };
}

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-full border border-border bg-muted/20 px-3 py-1.5">
      <Text className="text-xs font-medium text-foreground">
        {label}: {value}
      </Text>
    </View>
  );
}

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = api.useUtils();
  const mapRef = useRef<MapView>(null);
  const { Stack } = require("expo-router") as typeof import("expo-router");

  const { data: route, isLoading } = api.routes.get.useQuery({ id: id! }, { enabled: !!id });
  const { data: routeFull } = api.routes.loadFull.useQuery({ id: id! }, { enabled: !!id });

  const deleteMutation = useReliableMutation(api.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
    onSuccess: () => router.back(),
  });

  const [isLiked, setIsLiked] = useState(route?.has_liked ?? false);
  const [likesCount, setLikesCount] = useState(route?.has_liked ? 1 : 0);
  const comments = useEntityCommentsController({ entityId: route?.id, entityType: "route" });

  const toggleLikeMutation = api.social.toggleLike.useMutation({
    onError: () => {
      setIsLiked(route?.has_liked ?? false);
      setLikesCount(route?.has_liked ? 1 : 0);
    },
  });

  const handleToggleLike = () => {
    if (!route?.id) return;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(route.id)) {
      Alert.alert("Error", "Cannot save this route - invalid ID");
      return;
    }

    const nextLikedState = !isLiked;
    setIsLiked(nextLikedState);
    setLikesCount((prev) => (nextLikedState ? prev + 1 : Math.max(0, prev - 1)));
    toggleLikeMutation.mutate({
      entity_id: route.id,
      entity_type: "route",
    });
  };

  React.useEffect(() => {
    if (route) {
      setIsLiked(route.has_liked ?? false);
      setLikesCount(route.has_liked ? 1 : 0);
    }
  }, [route?.has_liked]);

  const coordinates = useMemo<RouteCoordinate[]>(() => {
    if (routeFull?.coordinates?.length) {
      return routeFull.coordinates;
    }

    return decodeRoutePolyline(route?.polyline);
  }, [route?.polyline, routeFull?.coordinates]);

  const elevationStreams = useMemo(
    () => buildRouteStreams(routeFull?.coordinates),
    [routeFull?.coordinates],
  );

  const activityConfig = getActivityConfig(route?.activity_category || "other");

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
        className="flex-1 bg-background items-center justify-center px-6"
        testID="route-detail-not-found"
      >
        <Text className="text-lg font-semibold text-foreground">Route not found</Text>
        <Text className="mt-2 text-center text-sm text-muted-foreground">
          This route may have been removed.
        </Text>
        <Button className="mt-4" onPress={() => router.back()}>
          <Text className="text-primary-foreground">Go Back</Text>
        </Button>
      </View>
    );
  }

  const renderOptionsMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger testID="route-detail-options-trigger">
        <View className="rounded-full p-2">
          <Icon as={Ellipsis} size={18} className="text-foreground" />
        </View>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        <DropdownMenuItem
          onPress={handleDelete}
          variant="destructive"
          testID="route-detail-options-delete"
        >
          <Text>Delete Route</Text>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <View className="flex-1 bg-background" testID="route-detail-screen">
      <Stack.Screen options={{ headerRight: renderOptionsMenu }} />
      <ScrollView className="flex-1">
        <View className="p-4 gap-4 pb-6">
          <View className="rounded-3xl border border-border bg-card p-4">
            <View className="flex-row items-start gap-3">
              <View className={`rounded-full p-2.5 ${activityConfig.bgColor}`}>
                <Icon as={activityConfig.icon} size={18} className={activityConfig.color} />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-2xl font-semibold text-foreground">{route.name}</Text>
                {route.description ? (
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {route.description}
                  </Text>
                ) : (
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {activityConfig.name} route
                  </Text>
                )}
              </View>
              <Pressable
                onPress={handleToggleLike}
                className="rounded-full border border-border bg-background px-3 py-2"
                testID="route-detail-like-button"
              >
                <View className="flex-row items-center gap-1.5">
                  <Icon
                    as={Heart}
                    size={16}
                    className={isLiked ? "text-red-500 fill-red-500" : "text-muted-foreground"}
                  />
                  <Text
                    className={
                      isLiked ? "text-red-500 text-sm font-medium" : "text-muted-foreground text-sm"
                    }
                  >
                    {likesCount > 0 ? `${likesCount}` : isLiked ? "Liked" : "Like"}
                  </Text>
                </View>
              </Pressable>
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <MetricPill label="Distance" value={formatDistance(route.total_distance ?? 0)} />
              {route.total_ascent != null && route.total_ascent > 0 ? (
                <MetricPill label="Climb" value={`${route.total_ascent}m`} />
              ) : null}
              <MetricPill label="Uploaded" value={formatDate(route.created_at)} />
            </View>

            {route.owner ? (
              <View className="mt-4 border-t border-border pt-4">
                <EntityOwnerRow owner={route.owner} subtitle="Route owner" />
              </View>
            ) : null}
          </View>

          <View className="overflow-hidden rounded-3xl border border-border bg-card">
            <View className="h-56 bg-muted">
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
                  <Polyline
                    coordinates={coordinates}
                    strokeColor="#f97316"
                    strokeWidth={4}
                    lineCap="round"
                    lineJoin="round"
                  />
                  <Marker coordinate={coordinates[0]!} anchor={{ x: 0.5, y: 0.5 }} title="Start">
                    <View className="h-3 w-3 rounded-full border-2 border-white bg-green-500" />
                  </Marker>
                  <Marker
                    coordinate={coordinates[coordinates.length - 1]!}
                    anchor={{ x: 0.5, y: 0.5 }}
                    title="Finish"
                  >
                    <View className="h-3 w-3 rounded-full border-2 border-white bg-red-500" />
                  </Marker>
                </MapView>
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-muted-foreground">No GPS data available</Text>
                </View>
              )}
            </View>
            <View className="border-t border-border px-3 py-3">
              <Text className="text-sm font-semibold text-foreground">Route Preview</Text>
              <Text className="mt-1 text-xs text-muted-foreground">
                Review the route geometry and elevation before using it in a plan.
              </Text>
            </View>
          </View>

          {elevationStreams ? (
            <ElevationProfileChart
              elevationStream={elevationStreams.elevationStream}
              distanceStream={elevationStreams.distanceStream}
              title="Elevation Profile"
              height={150}
              showStats={true}
            />
          ) : null}

          <Card className="rounded-3xl border border-border bg-card">
            <CardContent className="p-4 gap-4">
              <View className="gap-1">
                <Text className="text-sm font-semibold text-foreground">Route details</Text>
                <Text className="text-xs text-muted-foreground">
                  Key route facts and source information.
                </Text>
              </View>

              <View className="gap-3 rounded-2xl border border-border bg-muted/10 p-3">
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon as={MapPin} size={16} className="text-muted-foreground" />
                    <Text className="text-xs text-muted-foreground">Distance</Text>
                  </View>
                  <Text className="text-sm font-medium text-foreground">
                    {formatDistance(route.total_distance ?? 0)}
                  </Text>
                </View>

                {route.total_ascent != null && route.total_ascent > 0 ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-row items-center gap-2">
                      <Icon as={TrendingUp} size={16} className="text-green-600" />
                      <Text className="text-xs text-muted-foreground">Elevation gain</Text>
                    </View>
                    <Text className="text-sm font-medium text-foreground">
                      {route.total_ascent}m
                    </Text>
                  </View>
                ) : null}

                {route.total_descent != null && route.total_descent > 0 ? (
                  <View className="flex-row items-center justify-between gap-3">
                    <View className="flex-row items-center gap-2">
                      <Icon as={TrendingDown} size={16} className="text-red-600" />
                      <Text className="text-xs text-muted-foreground">Elevation loss</Text>
                    </View>
                    <Text className="text-sm font-medium text-foreground">
                      {route.total_descent}m
                    </Text>
                  </View>
                ) : null}

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Activity type</Text>
                  <Text className="text-sm font-medium text-foreground">{activityConfig.name}</Text>
                </View>

                <View className="flex-row items-center justify-between gap-3">
                  <Text className="text-xs text-muted-foreground">Uploaded</Text>
                  <Text className="text-sm font-medium text-foreground">
                    {formatDate(route.created_at)}
                  </Text>
                </View>

                {route.source ? (
                  <View className="gap-1 pt-1">
                    <Text className="text-xs text-muted-foreground">Source</Text>
                    <Text className="text-sm text-foreground">{route.source}</Text>
                  </View>
                ) : null}
              </View>
            </CardContent>
          </Card>

          <EntityCommentsSection
            addCommentPending={comments.addCommentPending}
            commentCount={comments.commentCount}
            comments={comments.comments}
            helperText="Discuss the route and share notes before reusing it elsewhere."
            newComment={comments.newComment}
            onAddComment={comments.handleAddComment}
            onChangeNewComment={comments.setNewComment}
            testIDPrefix="route-detail"
          />
        </View>
      </ScrollView>
    </View>
  );
}
