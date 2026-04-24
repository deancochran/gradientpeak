import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { MapPin } from "lucide-react-native";
import { FlatList, Pressable, View } from "react-native";
import { RouteCard } from "@/components/shared/RouteCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export default function RoutesLibraryScreen() {
  const navigateTo = useAppNavigate();

  const { data, isLoading, fetchNextPage, hasNextPage } = api.routes.list.useInfiniteQuery(
    { limit: 20, ownerScope: "own" },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );

  const routes = data?.pages.flatMap((page) => page.items) ?? [];

  const renderRouteCard = ({ item }: { item: any }) => {
    return (
      <RouteCard
        route={item}
        onPress={() => navigateTo(`/route-detail?id=${item.id}` as any)}
        variant="compact"
      />
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
