import { decodePolyline } from "@repo/core";
import { Card, CardContent } from "@repo/ui/components/card";
import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { MapPin, TrendingDown, TrendingUp } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { EntityOwnerRow } from "@/components/shared/EntityOwnerRow";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

const ACTIVITY_CATEGORY_LABELS: Record<string, string> = {
  outdoor_run: "🏃 Run",
  outdoor_bike: "🚴 Bike",
  indoor_treadmill: "🏃 Treadmill",
  indoor_bike_trainer: "🚴 Trainer",
};

export default function RoutesLibraryScreen() {
  const navigateTo = useAppNavigate();

  const { data, isLoading, fetchNextPage, hasNextPage } = api.routes.list.useInfiniteQuery(
    { limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const routes = data?.pages.flatMap((page) => page.items) ?? [];

  const formatDistance = (meters: number) => {
    const km = meters / 1000;
    return `${km.toFixed(1)} km`;
  };

  const renderRouteCard = ({ item }: { item: any }) => {
    const coordinates = decodePolyline(item.polyline);

    return (
      <Pressable
        onPress={() => navigateTo(`/route-detail?id=${item.id}` as any)}
        testID={`routes-list-item-${item.id}`}
      >
        <Card className="rounded-3xl border border-border bg-card">
          <CardContent className="p-0">
            <View className="h-32 overflow-hidden rounded-t-3xl bg-muted">
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
                  <Polyline coordinates={coordinates} strokeColor="#f97316" strokeWidth={3} />
                </MapView>
              )}
            </View>

            <View className="p-4">
              <View className="mb-2">
                <Text className="text-lg font-semibold text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
              </View>

              <Text className="mb-3 text-sm text-muted-foreground">
                {ACTIVITY_CATEGORY_LABELS[item.activity_category] || item.activity_category}
              </Text>

              <View className="flex-row gap-4">
                <View className="flex-row items-center gap-1">
                  <MapPin size={16} className="text-muted-foreground" />
                  <Text className="text-sm text-foreground">
                    {formatDistance(item.total_distance)}
                  </Text>
                </View>

                {item.total_ascent > 0 && (
                  <View className="flex-row items-center gap-1">
                    <TrendingUp size={16} className="text-green-600" />
                    <Text className="text-sm text-foreground">{item.total_ascent}m</Text>
                  </View>
                )}

                {item.total_descent > 0 && (
                  <View className="flex-row items-center gap-1">
                    <TrendingDown size={16} className="text-red-600" />
                    <Text className="text-sm text-foreground">{item.total_descent}m</Text>
                  </View>
                )}
              </View>

              {item.description && (
                <Text className="text-sm text-muted-foreground mt-2" numberOfLines={2}>
                  {item.description}
                </Text>
              )}

              {item.owner ? (
                <View className="mt-3">
                  <EntityOwnerRow owner={item.owner} subtitle="Route owner" />
                </View>
              ) : null}
            </View>
          </CardContent>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background" testID="routes-list-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => navigateTo(ROUTES.ROUTES.UPLOAD as any)}
              className="mr-2 rounded-full px-2 py-1"
              testID="routes-list-upload-trigger"
            >
              <Text className="text-sm font-medium text-primary">Upload</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        testID="routes-list-content"
        data={routes}
        renderItem={renderRouteCard}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-4 pb-6"
        ListHeaderComponent={
          routes.length > 0 ? (
            <View className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {routes.length} {routes.length === 1 ? "route" : "routes"}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View
            className="flex-1 items-center justify-center py-12"
            testID="routes-list-empty-state"
          >
            <MapPin size={64} className="text-muted-foreground mb-4" />
            <Text className="text-xl font-semibold mb-2">No routes yet</Text>
            <Text className="text-muted-foreground text-center mb-6">
              Your saved routes will appear here.
            </Text>
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
    </View>
  );
}
