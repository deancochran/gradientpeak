import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();
let listQueryInput: Record<string, unknown> | undefined;

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      React.createElement("StackScreen", null, options?.headerRight?.() ?? null),
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateMock,
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared/HeaderAction", () => ({
  __esModule: true,
  HeaderTextAction: ({ onPress, testID }: { onPress: () => void; testID: string }) =>
    React.createElement("Pressable", { onPress, testID }),
}));

jest.mock("@/components/shared/IndexSearchBar", () => ({
  __esModule: true,
  IndexSearchBar: ({ onChangeText, onFilterPress }: Record<string, () => void>) =>
    React.createElement(
      "View",
      null,
      React.createElement("TextInput", {
        testID: "training-plans-list-search-input",
        onChangeText,
      }),
      React.createElement("Pressable", {
        testID: "training-plans-list-filter-trigger",
        onPress: onFilterPress,
      }),
    ),
  FilterSection: ({ children }: React.PropsWithChildren) => children,
  FilterChip: ({
    label,
    onPress,
    testID,
  }: {
    label: string;
    onPress: () => void;
    testID: string;
  }) =>
    React.createElement("Pressable", { onPress, testID }, React.createElement("Text", null, label)),
  IndexResultsSummary: createHost("IndexResultsSummary"),
}));

jest.mock("@/components/shared/IndexFilterSheet", () => ({
  __esModule: true,
  IndexFilterSheet: ({
    visible,
    children,
    onApply,
  }: React.PropsWithChildren<{
    visible: boolean;
    onApply: () => void;
  }>) =>
    visible
      ? React.createElement(
          "View",
          { testID: "training-plans-list-filter-sheet" },
          children,
          React.createElement("Pressable", {
            testID: "training-plans-list-filter-apply",
            onPress: onApply,
          }),
        )
      : null,
}));

jest.mock("@/components/shared/ResourceList", () => ({
  __esModule: true,
  ResourceList: ({
    data,
    ListHeaderComponent,
    renderItem,
  }: {
    data: Array<{ id: string }>;
    ListHeaderComponent?: React.ReactNode;
    renderItem: (item: { id: string }) => React.ReactNode;
  }) =>
    React.createElement(
      "View",
      null,
      ListHeaderComponent,
      data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem(item))),
    ),
}));

jest.mock("@/components/shared/TrainingPlanCard", () => ({
  __esModule: true,
  TrainingPlanCard: ({ plan }: { plan: { id: string; name: string } }) =>
    React.createElement("Text", { testID: `training-plan-${plan.id}` }, plan.name),
}));

jest.mock("@repo/ui/components/empty-state-card", () => ({
  EmptyStateCard: createHost("EmptyStateCard"),
}));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/loading-skeletons", () => ({
  ListSkeleton: createHost("ListSkeleton"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    trainingPlans: {
      list: {
        useInfiniteQuery: (input: Record<string, unknown>) => {
          listQueryInput = input;
          return {
            data: { pages: [{ items: [{ id: "plan-1", name: "Marathon Build" }], total: 1 }] },
            isLoading: false,
            isFetching: false,
            isFetchingNextPage: false,
            hasNextPage: false,
            fetchNextPage: jest.fn(),
            refetch: jest.fn(),
          };
        },
      },
    },
  },
}));

const TrainingPlansListScreen = require("../training-plans-list").default;

describe("P1 training-plan mobile capability", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    listQueryInput = undefined;
  });

  it("opens the create screen from the owned plan browse screen", () => {
    renderNative(<TrainingPlansListScreen />);

    fireEvent.press(screen.getByTestId("training-plans-list-create-trigger"));

    expect(navigateMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.CREATE);
  });

  it("passes search and applied visibility filters to the real list screen query", () => {
    renderNative(<TrainingPlansListScreen />);

    fireEvent.changeText(screen.getByTestId("training-plans-list-search-input"), "marathon");
    expect(listQueryInput).toMatchObject({ search: "marathon", visibility: undefined });

    fireEvent.press(screen.getByTestId("training-plans-list-filter-trigger"));
    fireEvent.press(screen.getByTestId("training-plans-list-filter-visibility-public"));
    fireEvent.press(screen.getByTestId("training-plans-list-filter-apply"));

    expect(listQueryInput).toMatchObject({ search: "marathon", visibility: "public" });
  });
});
