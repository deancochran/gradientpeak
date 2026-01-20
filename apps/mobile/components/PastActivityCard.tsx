import { TimelineChart } from "@/components/ActivityPlan/TimelineChart";
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
import pako from "pako";

// Helper function to decompress latlng stream data
function decompressLatlngStream(compressedBase64: string): Array<{ latitude: number; longitude: number }> {
  try {
    // Decode base64 to binary
    const binaryString = atob(compressedBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decompress with pako
    const decompressed = pako.ungzip(bytes, { to: "string" });

    // Parse JSON array of [lat, lng] tuples
    const latlngArray = JSON.parse(decompressed) as Array<[number, number]>;

    // Convert to {latitude, longitude} objects
    return latlngArray.map(([lat, lng]) => ({
      latitude: lat,
      longitude: lng,
    }));
  } catch (error) {
    console.error("Error decompressing latlng stream:", error);
    return [];
  }
}

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
  const minutesPerKm = (seconds / 60) / (meters / 1000);
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
    }
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
    { enabled: !!activity.route_id }
  );

  // Fetch GPS track from activity_streams if no route_id (recorded activity)
  const { data: activityWithStreams } = trpc.activities.getActivityWithStreams.useQuery(
    { id: activity.id },
    {
      enabled: !activity.route_id, // Only fetch if no pre-planned route
      staleTime: Infinity, // Activity streams never change
    }
  );

  // Fetch activity plan data if activity_plan_id exists
  const { data: activityPlan } = trpc.activityPlans.getById.useQuery(
    { id: activity.activity_plan_id! },
    { enabled: !!activity.activity_plan_id }
  );

  // Get coordinates from either route polyline OR activity streams
  const coordinates = useMemo(() => {
    // Priority 1: Pre-planned route polyline
    if (route?.polyline) {
      return decodePolyline(route.polyline);
    }

    // Priority 2: Recorded GPS track from activity_streams
    if (activityWithStreams?.activity_streams) {
      const latlngStream = activityWithStreams.activity_streams.find(
        (s: any) => s.type === "latlng"
      );

      if (latlngStream?.compressed_values) {
        try {
          // Decompress the latlng data
          const decompressed = decompressLatlngStream(latlngStream.compressed_values);
          return decompressed;
        } catch (error) {
          console.error("Failed to decompress latlng stream:", error);
          return [];
        }
      }
    }

    return [];
  }, [route?.polyline, activityWithStreams?.activity_streams]);

  // Determine visual assets
  const hasRoute = coordinates.length > 0;
  const hasPlan = !!(
    activityPlan?.structure?.intervals &&
    activityPlan.structure.intervals.length > 0
  );
  const visualAssets = [
    ...(hasRoute ? ["route"] as const : []),
    ...(hasPlan ? ["plan"] as const : []),
  ];
  const hasVisuals = visualAssets.length > 0;

  // Calculate pace
  const pace = useMemo(() => {
    if (activity.type === "run" || activity.type === "bike") {
      return calculatePace(activity.distance_meters, activity.moving_seconds);
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
          <View className="flex-row items-start gap-3 mb-3">
            {/* User Avatar */}
            <Avatar className="w-10 h-10">
              {profileData.avatar_url && (
                <AvatarImage source={{ uri: profileData.avatar_url }} />
              )}
              <AvatarFallback>
                <Text className="text-sm font-semibold">
                  {profileData.username?.[0]?.toUpperCase() || "?"}
                </Text>
              </AvatarFallback>
            </Avatar>

            {/* Metadata Column */}
            <View className="flex-1">
              {/* User Name */}
              <Text className="text-sm font-semibold text-foreground">
                {profileData.username}
              </Text>

              {/* Date/Time + Location */}
              <View className="flex-row items-center gap-1 mt-0.5">
                <Text className="text-xs text-muted-foreground">
                  {format(new Date(activity.started_at), "MMM d, yyyy 'at' h:mm a")}
                </Text>
                {locationString && (
                  <>
                    <Text className="text-xs text-muted-foreground">•</Text>
                    <View className="flex-row items-center gap-0.5">
                      <Icon
                        as={MapPin}
                        size={10}
                        className="text-muted-foreground"
                      />
                      <Text className="text-xs text-muted-foreground">
                        {locationString}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
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
                      <View
                        key={index}
                        style={{ width: SCREEN_WIDTH - 32 }}
                      >
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
