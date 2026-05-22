import { Text } from "@repo/ui/components/text";
import { Stack } from "expo-router";
import { MapPin } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { IndexFilterSheet } from "@/components/shared/IndexFilterSheet";
import {
  FilterChip,
  FilterSection,
  IndexResultsSummary,
  IndexSearchBar,
} from "@/components/shared/IndexSearchBar";
import { ResourceList } from "@/components/shared/ResourceList";
import { RouteCard } from "@/components/shared/RouteCard";
import { api } from "@/lib/api";
import { ROUTES } from "@/lib/constants/routes";
import { useAppNavigate } from "@/lib/navigation/useAppNavigate";

export default function RoutesLibraryScreen() {
  const navigateTo = useAppNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "distance_desc" | "ascent_desc">(
    "newest",
  );
  const [draftSortBy, setDraftSortBy] = useState<typeof sortBy>("newest");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    api.routes.list.useInfiniteQuery(
      { limit: 20, ownerScope: "own", search: searchQuery.trim() || undefined, sort_by: sortBy },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const routes = data?.pages.flatMap((page) => page.items) ?? [];

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
      <IndexSearchBar
        value={searchQuery}
        placeholder="Search routes"
        hasActiveFilters={sortBy !== "newest"}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery("")}
        onFilterPress={() => {
          setDraftSortBy(sortBy);
          setIsFilterSheetOpen(true);
        }}
        testIDPrefix="routes-list"
      />
      <ResourceList
        testID="routes-list-content"
        data={routes}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-4 p-4 pb-6"
        ListHeaderComponent={<IndexResultsSummary count={routes.length} singularLabel="route" />}
        emptyComponent={
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
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isLoading={isLoading}
        loadingMoreLabel="Loading more routes..."
        onLoadMore={() => void fetchNextPage()}
        renderItem={(item: any) => (
          <RouteCard
            route={item}
            onPress={() => navigateTo(`/route-detail?id=${item.id}` as any)}
          />
        )}
      />
      <IndexFilterSheet
        visible={isFilterSheetOpen}
        title="Route Filters"
        description="Refine your routes list."
        isResetDisabled={draftSortBy === "newest"}
        onReset={() => setDraftSortBy("newest")}
        onApply={() => {
          setSortBy(draftSortBy);
          setIsFilterSheetOpen(false);
        }}
        onClose={() => setIsFilterSheetOpen(false)}
        testID="routes-list-filter-sheet"
      >
        <FilterSection title="Sort">
          <View className="flex-row flex-wrap gap-2">
            {[
              { id: "newest", label: "Newest" },
              { id: "oldest", label: "Oldest" },
              { id: "distance_desc", label: "Distance" },
              { id: "ascent_desc", label: "Ascent" },
            ].map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isActive={draftSortBy === option.id}
                onPress={() => setDraftSortBy(option.id as typeof sortBy)}
                testID={`routes-list-filter-sort-${option.id}`}
              />
            ))}
          </View>
        </FilterSection>
      </IndexFilterSheet>
    </View>
  );
}
