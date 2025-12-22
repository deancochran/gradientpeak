import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { trpc } from "@/lib/trpc";
import { decodePolyline } from "@repo/core";
import { useRouter } from "expo-router";
import { MapPin, TrendingUp, Upload, X } from "lucide-react-native";
import { View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { Icon } from "../ui/icon";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface RouteSelectorProps {
  activityCategory: string;
  selectedRouteId?: string | null;
  onSelectRoute: (routeId: string | null) => void;
}

export function RouteSelector({
  activityCategory,
  selectedRouteId,
  onSelectRoute,
}: RouteSelectorProps) {
  const router = useRouter();

  // Fetch routes filtered by activity category
  const { data } = trpc.routes.list.useInfiniteQuery(
    {
      activityCategory: activityCategory as any,
      limit: 50,
    },
    {
      enabled: true,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  // Extract string ID in case it's an object
  const routeId =
    typeof selectedRouteId === "string"
      ? selectedRouteId
      : (selectedRouteId as any)?.value || null;

  const { data: selectedRoute } = trpc.routes.get.useQuery(
    { id: routeId! },
    { enabled: !!routeId && typeof routeId === "string" },
  );

  const routes = data?.pages.flatMap((page) => page.items) ?? [];

  const handleUploadRoute = () => {
    router.push("/routes/upload" as any);
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold">Route (Optional)</Text>
          {selectedRouteId && (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onSelectRoute(null)}
            >
              <X size={16} className="text-muted-foreground" />
              <Text className="text-xs ml-1">Clear</Text>
            </Button>
          )}
        </View>

        {routes.length === 0 ? (
          <View className="py-6 items-center gap-3">
            <Text className="text-sm text-muted-foreground text-center mb-1">
              No routes available for this activity type
            </Text>
            <Button
              variant="outline"
              size="sm"
              onPress={handleUploadRoute}
              className="flex-row gap-2"
            >
              <Icon as={Upload} size={16} className="text-foreground" />
              <Text>Upload Route</Text>
            </Button>
          </View>
        ) : (
          <>
            <View className="flex-row gap-2 mb-2">
              <View className="flex-1">
                <Select
                  value={
                    selectedRouteId
                      ? { value: selectedRouteId, label: selectedRouteId }
                      : undefined
                  }
                  onValueChange={(option) => {
                    // Handle both string and object returns from Select
                    const routeId =
                      typeof option === "string"
                        ? option
                        : option?.value || null;
                    onSelectRoute(routeId);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a route (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {routes.map((route) => (
                        <SelectItem
                          key={route.id}
                          value={route.id}
                          label={route.name}
                        />
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </View>
              <Button variant="outline" size="icon" onPress={handleUploadRoute}>
                <Icon as={Upload} size={18} className="text-foreground" />
              </Button>
            </View>

            {/* Selected Route Preview */}
            {selectedRoute && (
              <View className="mt-3 border border-border rounded-lg overflow-hidden">
                {/* Map Preview */}
                <View className="h-24 bg-muted">
                  {selectedRoute.polyline && (
                    <MapView
                      style={{ flex: 1 }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      pitchEnabled={false}
                      rotateEnabled={false}
                      initialRegion={{
                        latitude: decodePolyline(selectedRoute.polyline)[0]
                          .latitude,
                        longitude: decodePolyline(selectedRoute.polyline)[0]
                          .longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                      }}
                    >
                      <Polyline
                        coordinates={decodePolyline(selectedRoute.polyline)}
                        strokeColor="#f97316"
                        strokeWidth={3}
                      />
                    </MapView>
                  )}
                </View>

                {/* Route Stats */}
                <View className="p-3 bg-card">
                  <Text className="font-medium mb-2">{selectedRoute.name}</Text>
                  <View className="flex-row gap-3">
                    <View className="flex-row items-center gap-1">
                      <MapPin size={14} className="text-muted-foreground" />
                      <Text className="text-xs">
                        {formatDistance(selectedRoute.total_distance)}
                      </Text>
                    </View>
                    {selectedRoute.total_ascent != null &&
                      selectedRoute.total_ascent > 0 && (
                        <View className="flex-row items-center gap-1">
                          <TrendingUp size={14} className="text-green-600" />
                          <Text className="text-xs">
                            {selectedRoute.total_ascent}m
                          </Text>
                        </View>
                      )}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
