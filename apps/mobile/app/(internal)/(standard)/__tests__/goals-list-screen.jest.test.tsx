import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateToMock = jest.fn();

type Goal = {
  id: string;
  title: string;
  target_date: string;
  activity_category: string;
};

type GoalListItemProps = {
  goal: Goal;
  label?: string;
  onPress: () => void;
  testID?: string;
};

type FlatListProps = {
  data: Goal[];
  renderItem: ({ item }: { item: Goal }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  [key: string]: unknown;
};

const goalListItemPropsMock = jest.fn<void, [GoalListItemProps]>();

const goals: Goal[] = [
  {
    id: "upcoming-goal",
    title: "Autumn 10K",
    target_date: "2099-10-01",
    activity_category: "run",
  },
  {
    id: "past-goal",
    title: "Spring 5K",
    target_date: "2000-04-01",
    activity_category: "run",
  },
];

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListHeaderComponent, ...props }: FlatListProps) =>
    React.createElement(
      "FlatList",
      props,
      ListHeaderComponent,
      data.map((item) => renderItem({ item })),
    ),
  RefreshControl: createHost("RefreshControl"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/plan/GoalListItem", () => ({
  __esModule: true,
  GoalListItem: (props: GoalListItemProps) => {
    goalListItemPropsMock(props);
    return React.createElement(
      "TouchableOpacity",
      { onPress: props.onPress, testID: props.testID },
      props.goal.title,
    );
  },
}));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  FilterChip: createHost("FilterChip"),
  FilterSection: createHost("FilterSection"),
  IndexFilterSheet: createHost("IndexFilterSheet"),
  IndexResultsSummary: createHost("IndexResultsSummary"),
  IndexSearchBar: createHost("IndexSearchBar"),
}));

jest.mock("@/components/shared/HeaderAction", () => ({
  __esModule: true,
  HeaderTextAction: createHost("HeaderTextAction"),
}));

jest.mock("@/components/shared/ScreenState", () => ({
  __esModule: true,
  EmptyState: createHost("EmptyState"),
  ErrorState: createHost("ErrorState"),
  LoadingState: createHost("LoadingState"),
}));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({
    goals,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

const GoalsListScreen = require("../goals-list").default;

describe("goals list screen", () => {
  beforeEach(() => {
    navigateToMock.mockClear();
    goalListItemPropsMock.mockClear();
  });

  it("uses lifecycle labels without deprecated goal intelligence props", () => {
    renderNative(<GoalsListScreen />);

    const propsByGoalId = new Map(
      goalListItemPropsMock.mock.calls.map(([props]) => [props.goal.id, props]),
    );
    expect(propsByGoalId.get("upcoming-goal")).toEqual(
      expect.objectContaining({ label: "Upcoming" }),
    );
    expect(propsByGoalId.get("past-goal")).toEqual(expect.objectContaining({ label: "Goal" }));
    for (const props of propsByGoalId.values()) {
      expect(props).not.toHaveProperty("readinessPercent");
      expect(props).not.toHaveProperty("readinessTarget");
      expect(props).not.toHaveProperty("status");
    }
  });

  it("opens canonical goal detail when a goal is tapped", () => {
    renderNative(<GoalsListScreen />);

    fireEvent.press(screen.getByTestId("goals-list-row-upcoming-goal"));

    expect(navigateToMock).toHaveBeenCalledWith("/goal-detail?id=upcoming-goal");
  });
});
