import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
import { ActivityHeader } from "@/components/activity/shared/ActivityHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { decodePolyline } from "@repo/core";
import { format } from "date-fns";
import { MapPin } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  View,
  ScrollView,
} from "react-native";
import MapView, { Polyline, PROVIDER_DEFAULT } from "react-native-maps";

interface PastActivityCardProps {
  activity: {
    id: string;
    name: string;
    type: string;
    started_at: string;
    duration_seconds: number;
    moving_seconds: number;
    distance_meters: number;
    location?: string | null;
    route_id?: string | null;
    activity_plan_id?: string | null;
    metrics?: any;
    profile_id: string;
    polyline?: string | null;
    total_strokes?: number | null;
    avg_swolf?: number | null;
    pool_length?: number | null;
    device_manufacturer?: string | null;
    device_product?: string | null;
  };
  onPress?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAP_HEIGHT = 160;

// Helper functions
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

function calculatePace(meters: number, seconds: number): string {
  if (meters === 0 || seconds === 0) return "--";
  const minutesPerKm = seconds / 60 / (meters / 1000);
  const mins = Math.floor(minutesPerKm);
  const secs = Math.round((minutesPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")} /km`;
}

export function PastActivityCard({ activity, onPress }: PastActivityCardProps) {
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Fetch user identity from profiles table (current username/avatar)
  const { data: profile } = trpc.profiles.getPublicById.useQuery(
    { id: activity.profile_id },
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      enabled: !!activity.profile_id,
    },
  );

  // Use profile data with fallback
  const profileData = useMemo(() => {
    return {
      username: profile?.username || "Unknown User",
      avatar_url: profile?.avatar_url || null,
    };
  }, [profile]);

  // Fetch route data if route_id exists (pre-planned route)
  const { data: route } = trpc.routes.get.useQuery(
    { id: activity.route_id! },
    { enabled: !!activity.route_id },
  );

  // Fetch activity plan data if activity_plan_id exists
  const { data: activityPlan } = trpc.activityPlans.getById.useQuery(
    { id: activity.activity_plan_id! },
    { enabled: !!activity.activity_plan_id },
  );

  // Get coordinates from either route polyline OR activity streams
  const coordinates = useMemo(() => {
    // Priority 1: Activity Polyline (Actual recorded path)
    if (activity.polyline) {
      return decodePolyline(activity.polyline);
    }

    // Priority 2: Pre-planned route polyline
    if (route?.polyline) {
      return decodePolyline(route.polyline);
    }

    return [];
  }, [route?.polyline, activity.polyline]);

  // Determine visual assets
  const hasRoute = coordinates.length > 0;
  const hasPlan = !!(
    (activityPlan?.structure as any)?.intervals &&
    (activityPlan?.structure as any).intervals.length > 0
  );
  const visualAssets = [
    ...(hasRoute ? (["route"] as const) : []),
    ...(hasPlan ? (["plan"] as const) : []),
  ];

  const hasVisuals = visualAssets.length > 0;

  // Calculate pace
  const pace = useMemo(() => {
    if (activity.type === "run" || activity.type === "bike") {
      return calculatePace(activity.distance_meters, activity.moving_seconds);
    } else if (activity.type === "swim") {
      // Swim pace: min/100m
      if (activity.distance_meters === 0 || activity.moving_seconds === 0)
        return "--";
      const secondsPer100m =
        activity.moving_seconds / (activity.distance_meters / 100);
      const mins = Math.floor(secondsPer100m / 60);
      const secs = Math.round(secondsPer100m % 60);
      return `${mins}:${secs.toString().padStart(2, "0")} /100m`;
    }
    return null;
  }, [activity.type, activity.distance_meters, activity.moving_seconds]);

  // Format location
  const locationString = useMemo(() => {
    if (!activity.location) return null;
    // Check if we have a string location
    if (typeof activity.location === "string") {
      return activity.location;
    }
    return null;
  }, [activity.location]);

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card>
        <CardContent className="p-4">
          {/* Header: Avatar + User Info */}
          <View className="mb-3">
            <ActivityHeader
              user={profileData}
              activity={{
                type: activity.type,
                name: activity.name,
                startedAt: activity.started_at,
                device_manufacturer: activity.device_manufacturer,
                device_product: activity.device_product,
                location: locationString,
              }}
              variant="embedded"
            />
          </View>

          {/* Key Metrics Row */}
          <View className="flex-row items-center flex-wrap gap-x-4 gap-y-2 pb-3 border-b border-border">
            {/* Distance */}
            {activity.distance_meters > 0 && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                  Distance
                </Text>
                <Text className="text-base font-bold">
                  {formatDistance(activity.distance_meters)}
                </Text>
              </View>
            )}

            {/* Duration */}
            {activity.duration_seconds > 0 && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                  Time
                </Text>
                <Text className="text-base font-bold">
                  {formatDuration(activity.duration_seconds)}
                </Text>
              </View>
            )}

            {/* Avg Pace */}
            {pace && activity.distance_meters > 0 && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                  Avg Pace
                </Text>
                <Text className="text-base font-bold">{pace}</Text>
              </View>
            )}

            {/* TSS */}
            {activity.metrics?.tss && activity.metrics.tss > 0 && (
              <View>
                <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                  TSS
                </Text>
                <Text className="text-base font-bold">
                  {Math.round(activity.metrics.tss)}
                </Text>
              </View>
            )}

            {/* Swim Metrics */}
            {activity.type === "swim" && (
              <>
                {activity.avg_swolf && (
                  <View>
                    <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                      SWOLF
                    </Text>
                    <Text className="text-base font-bold">
                      {activity.avg_swolf}
                    </Text>
                  </View>
                )}
                {activity.total_strokes && (
                  <View>
                    <Text className="text-xs text-muted-foreground uppercase mb-0.5">
                      Strokes
                    </Text>
                    <Text className="text-base font-bold">
                      {activity.total_strokes}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {/* Conditional Visual Container */}
          {hasVisuals && (
            <View className="mt-3">
              {visualAssets.length === 1 ? (
                // Single Asset
                <View>
                  {visualAssets[0] === "route" ? (
                    <RoutePreview coordinates={coordinates} />
                  ) : (
                    <PlanPreview activityPlan={activityPlan!} />
                  )}
                </View>
              ) : (
                // Multiple Assets - Carousel
                <View>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onScroll={(event) => {
                      const offsetX = event.nativeEvent.contentOffset.x;
                      const index = Math.round(offsetX / (SCREEN_WIDTH - 32));
                      setCarouselIndex(index);
                    }}
                    scrollEventThrottle={16}
                  >
                    {visualAssets.map((asset, index) => (
                      <View key={index} style={{ width: SCREEN_WIDTH - 32 }}>
                        {asset === "route" ? (
                          <RoutePreview coordinates={coordinates} />
                        ) : (
                          <PlanPreview activityPlan={activityPlan!} />
                        )}
                      </View>
                    ))}
                  </ScrollView>

                  {/* Carousel Indicators */}
                  <View className="flex-row justify-center gap-1.5 mt-2">
                    {visualAssets.map((_, index) => (
                      <View
                        key={index}
                        className={`h-1.5 rounded-full ${
                          index === carouselIndex
                            ? "w-6 bg-primary"
                            : "w-1.5 bg-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </CardContent>
      </Card>
    </Pressable>
  );
}

// Sub-components for visual assets

interface RoutePreviewProps {
  coordinates: Array<{ latitude: number; longitude: number }>;
}

function RoutePreview({ coordinates }: RoutePreviewProps) {
  if (coordinates.length === 0) {
    return (
      <View
        style={{ height: MAP_HEIGHT }}
        className="items-center justify-center bg-muted rounded-lg"
      >
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const centerIndex = Math.floor(coordinates.length / 2);
  const centerCoord = coordinates[centerIndex];

  return (
    <View
      style={{ height: MAP_HEIGHT }}
      className="rounded-lg overflow-hidden border border-border"
    >
      <MapView
        style={{ flex: 1 }}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          latitude: centerCoord.latitude,
          longitude: centerCoord.longitude,
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
  );
}

interface PlanPreviewProps {
  activityPlan: {
    structure?: any;
  };
}

function PlanPreview({ activityPlan }: PlanPreviewProps) {
  if (!activityPlan.structure) {
    return (
      <View
        style={{ height: MAP_HEIGHT }}
        className="items-center justify-center bg-muted rounded-lg"
      >
        <Text className="text-xs text-muted-foreground">
          No plan data available
        </Text>
      </View>
    );
  }

  return (
    <View className="rounded-lg overflow-hidden bg-muted p-2">
      <TimelineChart
        structure={activityPlan.structure}
        height={MAP_HEIGHT - 16}
        compact={true}
      />
    </View>
  );
}
