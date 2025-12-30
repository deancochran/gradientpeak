import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useReliableMutation } from "@/lib/hooks/useReliableMutation";
import { trpc } from "@/lib/trpc";
import { decodePolyline } from "@repo/core";
import { useRouter } from "expo-router";
import {
  MapPin,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";
import { Alert, FlatList, Pressable, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";

const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  outdoor_run: "🏃 Run",
  outdoor_bike: "🚴 Bike",
  indoor_treadmill: "🏃 Treadmill",
  indoor_bike_trainer: "🚴 Trainer",
};

export default function RoutesLibraryScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data, isLoading, fetchNextPage, hasNextPage } =
    trpc.routes.list.useInfiniteQuery(
      { limit: 20 },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const deleteMutation = useReliableMutation(trpc.routes.delete, {
    invalidate: [utils.routes],
    success: "Route deleted successfully",
  });

  const routes = data?.pages.flatMap((page) => page.items) ?? [];

  const handleDelete = (routeId: string, routeName: string) => {
    Alert.alert(
      "Delete Route",
      `Are you sure you want to delete "${routeName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate({ id: routeId }),
        },
      ],
    );
  };

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  };

  const renderRouteCard = ({ item }: { item: any }) => {
    const coordinates = decodePolyline(item.polyline);

    return (
      <Pressable
        onPress={() => router.push(`/route-detail?id=${item.id}` as any)}
        className="mb-3"
      >
        <Card>
          <CardContent className="p-0">
            {/* Map Preview */}
            <View className="h-32 bg-muted overflow-hidden rounded-t-lg">
              {coordinates.length > 0 && (
                <MapView
                  style={{ flex: 1 }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                  initialRegion={{
                    latitude: coordinates[0].latitude,
                    longitude: coordinates[0].longitude,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                >
                  <Polyline
                    coordinates={coordinates}
                    strokeColor="#f97316"
                    strokeWidth={3}
                  />
                </MapView>
              )}
            </View>

            {/* Route Info */}
            <View className="p-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  className="text-lg font-semibold flex-1"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => handleDelete(item.id, item.name)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="text-destructive" size={18} />
                </Button>
              </View>

              <Text className="text-sm text-muted-foreground mb-3">
                {ACTIVITY_CATEGORY_LABELS[item.activity_category] ||
                  item.activity_category}
              </Text>

              {/* Stats */}
              <View className="flex-row gap-4">
                <View className="flex-row items-center gap-1">
                  <MapPin size={16} className="text-muted-foreground" />
                  <Text className="text-sm">
                    {formatDistance(item.total_distance)}
                  </Text>
                </View>

                {item.total_ascent > 0 && (
                  <View className="flex-row items-center gap-1">
                    <TrendingUp size={16} className="text-green-600" />
                    <Text className="text-sm">{item.total_ascent}m</Text>
                  </View>
                )}

                {item.total_descent > 0 && (
                  <View className="flex-row items-center gap-1">
                    <TrendingDown size={16} className="text-red-600" />
                    <Text className="text-sm">{item.total_descent}m</Text>
                  </View>
                )}
              </View>

              {item.description && (
                <Text
                  className="text-sm text-muted-foreground mt-2"
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
              )}
            </View>
          </CardContent>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={routes}
        renderItem={renderRouteCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-12">
            <MapPin size={64} className="text-muted-foreground mb-4" />
            <Text className="text-xl font-semibold mb-2">No Routes Yet</Text>
            <Text className="text-muted-foreground text-center mb-6">
              Upload your first GPX route to get started
            </Text>
            <Button onPress={() => router.push("/route-upload" as any)}>
              <Plus className="text-primary-foreground mr-2" size={20} />
              <Text className="text-primary-foreground">Upload Route</Text>
            </Button>
          </View>
        }
        onEndReached={() => {
          if (hasNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        refreshing={isLoading}
      />

      {/* Floating Action Button */}
      {routes.length > 0 && (
        <View className="absolute bottom-6 right-6">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onPress={() => router.push("/route-upload" as any)}
          >
            <Plus className="text-primary-foreground" size={24} />
          </Button>
        </View>
      )}
    </View>
  );
}
