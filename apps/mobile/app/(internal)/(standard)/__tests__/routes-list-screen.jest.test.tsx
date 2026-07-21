import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const routesListUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ items: [], nextCursor: undefined }] },
  error: null as Error | null,
  fetchNextPage: jest.fn(async () => undefined),
  hasNextPage: false,
  isError: false,
  isFetching: false,
  isFetchingNextPage: false,
  isLoading: false,
  refetch: jest.fn(async () => undefined),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data = [], ListEmptyComponent, ...props }: Record<string, unknown>) =>
    React.createElement(
      "FlatList",
      props,
      (data as unknown[]).length === 0 ? (ListEmptyComponent as React.ReactNode) : null,
    ),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetFooter: createHost("BottomSheetFooter"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: ({
    children,
    onApply,
    testID,
    visible,
  }: React.PropsWithChildren<{
    onApply: () => void;
    testID: string;
    visible: boolean;
  }>) =>
    visible
      ? React.createElement(
          "View",
          { testID },
          children,
          React.createElement("Pressable", { onPress: onApply, testID: `${testID}-apply` }),
        )
      : null,
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  MapPin: createHost("MapPin"),
  Search: createHost("Search"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
  X: createHost("X"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/components/shared/RouteCard", () => ({
  __esModule: true,
  RouteCard: createHost("RouteCard"),
}));
jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    emptyComponent,
    isEmptyFiltered,
  }: {
    emptyComponent?: React.ReactNode;
    isEmptyFiltered?: boolean;
  }) =>
    React.createElement(
      "View",
      null,
      isEmptyFiltered ? React.createElement("Text", null, "No matching results") : emptyComponent,
    ),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: { routes: { list: { useInfiniteQuery: routesListUseInfiniteQueryMock } } },
}));

const RoutesListScreen = require("../routes-list").default;

describe("routes list empty states", () => {
  beforeEach(() => {
    routesListUseInfiniteQueryMock.mockClear();
  });

  it("keeps a truly empty library state when only sort changes", () => {
    renderNative(<RoutesListScreen />);

    fireEvent.press(screen.getByTestId("routes-list-filter-button"));
    fireEvent.press(screen.getByTestId("routes-list-filter-sort-oldest"));
    fireEvent.press(screen.getByTestId("routes-list-filter-sheet-apply"));

    expect(screen.getByText("No routes yet")).toBeTruthy();
    expect(screen.queryByText("No matching results")).toBeNull();
    expect(screen.getByTestId("routes-list-filter-button-dot")).toBeTruthy();
  });

  it("shows filtered-empty copy when search is active", () => {
    renderNative(<RoutesListScreen />);

    fireEvent(screen.getByTestId("routes-list-search-input"), "changeText", "hills");

    expect(screen.getByText("No matching results")).toBeTruthy();
    expect(screen.queryByText("No routes yet")).toBeNull();
  });
});
