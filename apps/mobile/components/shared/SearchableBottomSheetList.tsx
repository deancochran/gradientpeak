import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET,
  APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET,
} from "@/components/shared/AppBottomSheet";
import { IndexResultsSummary } from "@/components/shared/IndexSearchBar";

type SearchableBottomSheetListProps<TItem> = {
  data: TItem[];
  emptyMessage: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  keyExtractor: (item: TItem) => string;
  loadingMessage: string;
  onFetchNextPage?: () => void;
  pluralLabel: string;
  renderItem: (item: TItem) => ReactElement | null;
  sectionLabel?: string;
  singularLabel: string;
};

export function SearchableBottomSheetList<TItem>({
  data,
  emptyMessage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  keyExtractor,
  loadingMessage,
  onFetchNextPage,
  pluralLabel,
  renderItem,
  sectionLabel,
  singularLabel,
}: SearchableBottomSheetListProps<TItem>) {
  const listData = isLoading ? [] : data;

  return (
    <BottomSheetFlatList
      data={listData}
      enableFooterMarginAdjustment
      keyExtractor={(item: unknown) => keyExtractor(item as TItem)}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET,
        paddingBottom: APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET,
      }}
      ListHeaderComponent={
        <View className="gap-4 pb-2">
          <IndexResultsSummary
            count={data.length}
            singularLabel={singularLabel}
            pluralLabel={pluralLabel}
          />
          {!isLoading && data.length > 0 && sectionLabel ? (
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sectionLabel}
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        isLoading ? (
          <View className="items-center justify-center py-8">
            <ActivityIndicator />
            <Text className="mt-2 text-sm text-muted-foreground">{loadingMessage}</Text>
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-border p-4">
            <Text className="text-center text-sm text-muted-foreground">{emptyMessage}</Text>
          </View>
        )
      }
      ListFooterComponent={
        hasNextPage && onFetchNextPage ? (
          <View className="pt-4">
            <Button disabled={isFetchingNextPage} onPress={onFetchNextPage} variant="outline">
              <Text>{isFetchingNextPage ? "Loading more..." : "Load more"}</Text>
            </Button>
          </View>
        ) : null
      }
      renderItem={({ item }: { item: unknown }) => renderItem(item as TItem) as ReactNode}
      showsVerticalScrollIndicator
    />
  );
}
