import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const activityPlansListUseQueryMock = jest.fn((_input?: unknown) => ({
  data: {
    items: [
      {
        id: "plan-1",
        name: "Tempo Ride",
        description: "Steady state tempo blocks",
        activity_category: "bike",
        template_visibility: "private",
        owner: { id: "owner-1", username: "Owner", avatar_url: null },
      },
    ],
  },
  isLoading: false,
  error: null,
}));

type ActivityPlan = {
  id: string;
  owner?: {
    id: string;
    username: string;
  };
  [key: string]: unknown;
};

type FlatListProps = {
  data?: ActivityPlan[];
  renderItem: (args: { item: ActivityPlan }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  [key: string]: unknown;
};

type ActivityPlanCardNode = {
  props: {
    activityPlan: ActivityPlan;
    variant?: string;
  };
};

type UnsafeTypeQuery = {
  UNSAFE_getByType: (type: "ActivityPlanCard") => ActivityPlanCardNode;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    ...props
  }: FlatListProps) =>
    React.createElement(
      "FlatList",
      props,
      ListHeaderComponent,
      data?.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
    ),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: createHost("StackScreen"),
  },
}));

jest.mock("@gorhom/bottom-sheet", () => ({
  __esModule: true,
  default: createHost("BottomSheet"),
  BottomSheetBackdrop: createHost("BottomSheetBackdrop"),
  BottomSheetScrollView: createHost("BottomSheetScrollView"),
  BottomSheetView: createHost("BottomSheetView"),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
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
    onApply,
    onReset,
    testID,
    visible,
  }: React.PropsWithChildren<{
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

jest.mock("@/components/shared/ActivityPlanCard", () => ({
  __esModule: true,
  ActivityPlanCard: createHost("ActivityPlanCard"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    activityPlans: {
      list: {
        useQuery: activityPlansListUseQueryMock,
      },
    },
  },
}));

const ActivityPlansListScreen = require("../activity-plans-list").default;

describe("activity plans list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
    activityPlansListUseQueryMock.mockClear();
  });

  it("applies and resets the multisport composition filter", () => {
    renderNative(<ActivityPlansListScreen />);
    expect(activityPlansListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ compositionMode: "include_multisport" }),
    );

    fireEvent.press(screen.getByTestId("activity-plans-list-filter-button"));
    fireEvent.press(screen.getByTestId("activity-plans-list-filter-include-multisport"));
    fireEvent.press(screen.getByTestId("activity-plans-list-filter-sheet-apply"));
    expect(activityPlansListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ compositionMode: "single_only" }),
    );

    fireEvent.press(screen.getByTestId("activity-plans-list-filter-button"));
    fireEvent.press(screen.getByTestId("activity-plans-list-filter-sheet-reset"));
    fireEvent.press(screen.getByTestId("activity-plans-list-filter-sheet-apply"));
    expect(activityPlansListUseQueryMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ compositionMode: "include_multisport" }),
    );
  });

  it("opens activity plan detail when tapping a row", () => {
    renderNative(<ActivityPlansListScreen />);

    fireEvent.press(screen.getByTestId("activity-plan-list-item-plan-1"));

    expect(pushMock).toHaveBeenCalledWith("/activity-plan-detail?id=plan-1");
  });

  it("renders each plan with its owner and the rich default card", () => {
    const rendered = renderNative(<ActivityPlansListScreen />);

    const activityPlanCard = (rendered as unknown as UnsafeTypeQuery).UNSAFE_getByType(
      "ActivityPlanCard",
    );

    expect(activityPlanCard.props.activityPlan.owner).toEqual(
      expect.objectContaining({
        id: "owner-1",
        username: "Owner",
      }),
    );
    expect(activityPlanCard.props.variant).toBeUndefined();
  });
});
