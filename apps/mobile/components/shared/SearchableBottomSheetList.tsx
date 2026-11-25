import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Button } from "@repo/ui/components/button";
import { Text } from "@repo/ui/components/text";
import type { ReactElement } from "react";
import { FlatList, View } from "react-native";
import {
  APP_BOTTOM_SHEET_ACTION_FOOTER_BOTTOM_INSET,
  APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET,
} from "@/components/shared/AppBottomSheet";
import { IndexResultsSummary } from "@/components/shared/IndexSearchBar";
import { EmptyState, LoadingState } from "@/components/shared/ScreenState";

type SearchableBottomSheetListProps<TItem> = {
  data: TItem[];
  emptyMessage: string;
  hasNextPage?: boolean;
  headerInLayout?: boolean;
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

export type SearchableListPresentation = "sheet" | "screen";

type SearchableListProps<TItem> = SearchableBottomSheetListProps<TItem> & {
  presentation?: SearchableListPresentation;
};

export function SearchableBottomSheetList<TItem>({
  ...props
}: SearchableBottomSheetListProps<TItem>) {
  return <SearchableList {...props} presentation="sheet" />;
}

/**
 * The Gorhom list is coupled to BottomSheet's scrollable context. Picker pages
 * use the native list instead, while sheet consumers retain their existing
 * keyboard and footer integration.
 */
export function SearchableList<TItem>({
  data,
  emptyMessage,
  hasNextPage,
  headerInLayout = false,
  isFetchingNextPage,
  isLoading,
  keyExtractor,
  loadingMessage,
  onFetchNextPage,
  pluralLabel,
  renderItem,
  sectionLabel,
  singularLabel,
  presentation = "sheet",
}: SearchableListProps<TItem>) {
  const listData = isLoading ? [] : data;
  const List = presentation === "sheet" ? BottomSheetFlatList : FlatList;

  return (
    <List
      data={listData}
      {...(presentation === "sheet" ? { enableFooterMarginAdjustment: true } : {})}
      keyExtractor={(item: unknown) => keyExtractor(item as TItem)}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: headerInLayout ? 16 : APP_BOTTOM_SHEET_SEARCH_HEADER_CONTENT_TOP_INSET,
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
        isLoading ? <LoadingState message={loadingMessage} /> : <EmptyState title={emptyMessage} />
      }
      ListFooterComponent={
        hasNextPage && onFetchNextPage ? (
          <View className="pt-4">
            <Button disabled={isFetchingNextPage} onPress={onFetchNextPage} variant="outline">
              <Text className="text-foreground">
                {isFetchingNextPage ? "Loading more..." : "Load more"}
              </Text>
            </Button>
          </View>
        ) : null
      }
      renderItem={({ item }: { item: unknown }) => renderItem(item as TItem)}
      showsVerticalScrollIndicator
    />
  );
}
