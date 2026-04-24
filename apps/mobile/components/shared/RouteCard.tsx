import { Card, CardContent } from "@repo/ui/components/card";
import { Icon } from "@repo/ui/components/icon";
import { Text } from "@repo/ui/components/text";
import React, { useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import { ActivityPlanAttributionRow } from "@/components/shared/ActivityPlanAttributionRow";
import { StaticRouteMapPreview } from "@/components/shared/StaticRouteMapPreview";
import { getActivityCategoryConfig } from "@/lib/constants/activities";

type RouteCoordinate = {
  latitude: number;
  longitude: number;
  altitude?: number;
};

type RouteCardRoute = {
  id: string;
  name: string;
  description?: string | null;
  activity_category?: string | null;
  total_distance?: number | null;
  total_ascent?: number | null;
  total_descent?: number | null;
  polyline?: string | null;
  created_at?: string;
  updated_at?: string;
  owner?: {
    id?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
};

type RouteCardFullRoute = {
  coordinates?: RouteCoordinate[];
};

type RouteCardProps = {
  route: RouteCardRoute;
  routeFull?: RouteCardFullRoute | null;
  headerAccessory?: React.ReactNode;
  onPress?: () => void;
  showAttribution?: boolean;
  variant?: "default" | "compact";
};

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

function formatDistance(meters: number) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center gap-0.5">
      <Text className="text-[10px] text-muted-foreground">{label}</Text>
      <Text className="text-[11px] font-semibold text-foreground" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function RouteCard({
  route,
  routeFull,
  headerAccessory,
  onPress,
  showAttribution = true,
  variant = "default",
}: RouteCardProps) {
  const activityConfig = getActivityCategoryConfig(route.activity_category || "other");
  const isCompact = variant === "compact";
  const Wrapper = onPress ? TouchableOpacity : View;

  const coordinates = useMemo<RouteCoordinate[]>(() => {
    if (routeFull?.coordinates?.length) {
      return routeFull.coordinates;
    }

    return decodeRoutePolyline(route.polyline);
  }, [route.polyline, routeFull?.coordinates]);

  return (
    <Wrapper onPress={onPress} activeOpacity={onPress ? 0.85 : 1} disabled={!onPress}>
      <Card className={isCompact ? "py-2" : "py-3"}>
        <CardContent className={isCompact ? "px-2" : "px-3"}>
          <View className="flex-row items-start gap-3">
            <View className={`rounded-full p-2.5 ${activityConfig.bgColor}`}>
              <Icon as={activityConfig.icon} size={18} className={activityConfig.color} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text
                className={`${isCompact ? "text-lg" : "text-xl"} font-semibold text-foreground`}
              >
                {route.name}
              </Text>
              {route.description ? (
                <Text
                  className="text-sm leading-5 text-muted-foreground"
                  numberOfLines={isCompact ? 2 : undefined}
                >
                  {route.description}
                </Text>
              ) : (
                <Text className="text-sm leading-5 text-muted-foreground">
                  {activityConfig.name} route
                </Text>
              )}
            </View>
            {headerAccessory}
          </View>

          <View className="mt-3 rounded-lg bg-muted/30 px-2.5 py-2">
            <View className="flex-row justify-between gap-2">
              <MetricCell label="Distance" value={formatDistance(route.total_distance ?? 0)} />
              <MetricCell
                label="Climb"
                value={
                  route.total_ascent != null && route.total_ascent > 0
                    ? `${route.total_ascent}m`
                    : "--"
                }
              />
              <MetricCell
                label="Descent"
                value={
                  route.total_descent != null && route.total_descent > 0
                    ? `${route.total_descent}m`
                    : "--"
                }
              />
            </View>
          </View>

          <View className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
            <View className={`${isCompact ? "aspect-[2.15/1]" : "aspect-[16/9]"} bg-muted`}>
              {coordinates.length > 0 ? (
                <StaticRouteMapPreview
                  coordinates={coordinates}
                  showMarkers={true}
                  strokeColor="#f97316"
                  strokeWidth={4}
                />
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-muted-foreground">No GPS data available</Text>
                </View>
              )}
            </View>
          </View>

          {showAttribution ? (
            <ActivityPlanAttributionRow
              compact={isCompact}
              owner={route.owner ?? null}
              updatedAt={route.updated_at ?? route.created_at ?? null}
            />
          ) : null}
        </CardContent>
      </Card>
    </Wrapper>
  );
}
