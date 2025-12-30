import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { decodePolyline } from "@repo/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Calendar,
  Edit,
  MapPin,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { Alert, ScrollView, View } from "react-native";
import MapView, { Polyline, PROVIDER_GOOGLE } from "react-native-maps";

const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  outdoor_run: "🏃 Outdoor Run",
  outdoor_bike: "🚴 Outdoor Bike",
  indoor_treadmill: "🏃 Indoor Treadmill",
  indoor_bike_trainer: "🚴 Indoor Bike Trainer",
};

export default function RouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: route, isLoading } = trpc.routes.get.useQuery(
    { id: id! },
    { enabled: !!id },
  );

  const deleteMutation = useReliableMutation(trpc.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
    onSuccess: () => router.back(),
  });

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

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!route) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text>Route not found</Text>
      </View>
    );
  }

  const coordinates = decodePolyline(route.polyline);
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
    <View className="flex-1 bg-background">
      <ScrollView>
        {/* Map */}
        <View className="h-64 bg-muted">
          {coordinates.length > 0 && (
            <MapView
              style={{ flex: 1 }}
              provider={PROVIDER_GOOGLE}
              initialRegion={{
                latitude:
                  coordinates[Math.floor(coordinates.length / 2)].latitude,
                longitude:
                  coordinates[Math.floor(coordinates.length / 2)].longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              <Polyline
                coordinates={coordinates}
                strokeColor="#f97316"
                strokeWidth={4}
              />
            </MapView>
          )}
        </View>

        <View className="p-4 gap-4">
          {/* Header */}
          <View>
            <Text className="text-2xl font-bold mb-2">{route.name}</Text>
            <Text className="text-base text-muted-foreground">
              {ACTIVITY_CATEGORY_LABELS[route.activity_category] ||
                route.activity_category}
            </Text>
          </View>

          {/* Stats Card */}
          <Card>
            <CardContent className="p-4">
              <Text className="text-sm font-semibold mb-3">
                Route Statistics
              </Text>

              <View className="gap-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <MapPin size={20} className="text-muted-foreground" />
                    <Text className="text-muted-foreground">Distance</Text>
                  </View>
                  <Text className="font-semibold">
                    {formatDistance(route.total_distance)}
                  </Text>
                </View>

                {route.total_ascent != null && route.total_ascent > 0 && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <TrendingUp size={20} className="text-green-600" />
                      <Text className="text-muted-foreground">
                        Elevation Gain
                      </Text>
                    </View>
                    <Text className="font-semibold">{route.total_ascent}m</Text>
                  </View>
                )}

                {route.total_descent != null && route.total_descent > 0 && (
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <TrendingDown size={20} className="text-red-600" />
                      <Text className="text-muted-foreground">
                        Elevation Loss
                      </Text>
                    </View>
                    <Text className="font-semibold">
                      {route.total_descent}m
                    </Text>
                  </View>
                )}

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <Calendar size={20} className="text-muted-foreground" />
                    <Text className="text-muted-foreground">Uploaded</Text>
                  </View>
                  <Text className="font-semibold">
                    {formatDate(route.created_at)}
                  </Text>
                </View>
              </View>
            </CardContent>
          </Card>

          {/* Description Card */}
          {route.description && (
            <Card>
              <CardContent className="p-4">
                <Text className="text-sm font-semibold mb-2">Description</Text>
                <Text className="text-muted-foreground">
                  {route.description}
                </Text>
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

          {/* Actions */}
          <View className="gap-3 pb-6">
            <Button
              variant="outline"
              className="flex-row items-center gap-2"
              onPress={() => {
                // TODO: Navigate to plan creation with this route selected
                Alert.alert("Coming Soon", "Use this route in a plan");
              }}
            >
              <Edit className="text-foreground" size={20} />
              <Text>Use in Activity Plan</Text>
            </Button>

            <Button
              variant="destructive"
              className="flex-row items-center gap-2"
              onPress={handleDelete}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="text-destructive-foreground" size={20} />
              <Text className="text-destructive-foreground">
                {deleteMutation.isPending ? "Deleting..." : "Delete Route"}
              </Text>
            </Button>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
