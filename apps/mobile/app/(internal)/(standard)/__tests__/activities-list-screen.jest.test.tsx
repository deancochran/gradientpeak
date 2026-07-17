import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const activitiesListUseInfiniteQueryMock = jest.fn((_input?: unknown, _options?: unknown) => ({
  data: { pages: [{ items: [], total: 0, hasMore: false }] },
  isLoading: false,
  isFetchingNextPage: false,
  hasNextPage: false,
  fetchNextPage: jest.fn(async () => undefined),
  refetch: jest.fn(async () => undefined),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: createHost("FlatList"),
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

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("ActivityIcon"),
  Search: createHost("SearchIcon"),
  SlidersHorizontal: createHost("SlidersHorizontalIcon"),
  X: createHost("XIcon"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/empty-state-card", () => ({
  __esModule: true,
  EmptyStateCard: createHost("EmptyStateCard"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  __esModule: true,
  ListSkeleton: createHost("ListSkeleton"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children?: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: ({
    children,
    isResetDisabled,
    onApply,
    onReset,
    testID,
    visible,
  }: React.PropsWithChildren<{
    isResetDisabled?: boolean;
    onApply: () => void;
    onReset: () => void;
    testID: string;
    visible: boolean;
  }>) =>
    visible
      ? React.createElement(
          "IndexFilterSheet",
          { testID },
          children,
          React.createElement("TouchableOpacity", {
            disabled: isResetDisabled,
            onPress: onReset,
            testID: `${testID}-reset`,
          }),
          React.createElement("TouchableOpacity", {
            onPress: onApply,
            testID: `${testID}-apply`,
          }),
        )
      : null,
}));
jest.mock("@/components/shared/ActivityCard", () => ({
  __esModule: true,
  ActivityCard: createHost("ActivityCard"),
}));
jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ profile: null, user: null }),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));
jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activities: {
      listPaginated: { useInfiniteQuery: activitiesListUseInfiniteQueryMock },
    },
  },
}));

const ActivitiesListScreen = require("../activities-list").default;

describe("activities list screen filters", () => {
  beforeEach(() => {
    activitiesListUseInfiniteQueryMock.mockClear();
  });

  it("sends default query parameters without composition mode", () => {
    renderNative(<ActivitiesListScreen />);

    expect(activitiesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      {
        limit: 20,
        search: undefined,
        activity_category: undefined,
        sort_by: "date",
        sort_order: "desc",
      },
      expect.objectContaining({ getNextPageParam: expect.any(Function) }),
    );
  });

  it("applies category filter and clears it on reset", () => {
    renderNative(<ActivitiesListScreen />);

    fireEvent.press(screen.getByTestId("activities-list-filter-button"));
    fireEvent.press(screen.getByTestId("activities-list-filter-category-run"));
    fireEvent.press(screen.getByTestId("activities-list-filter-sheet-apply"));

    expect(activitiesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ activity_category: "run", sort_by: "date" }),
      expect.any(Object),
    );

    fireEvent.press(screen.getByTestId("activities-list-filter-button"));
    fireEvent.press(screen.getByTestId("activities-list-filter-sheet-reset"));
    fireEvent.press(screen.getByTestId("activities-list-filter-sheet-apply"));
    expect(activitiesListUseInfiniteQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activity_category: undefined,
        sort_by: "date",
      }),
      expect.any(Object),
    );
  });
});
