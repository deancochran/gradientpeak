import React from "react";
import { ROUTES } from "@/lib/constants/routes";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

describe("goals list route", () => {
  it("uses the flat goals-list route", () => {
    expect(ROUTES.GOALS.LIST).toBe("/goals-list");
  });
});

const navigateToMock = jest.fn();
const captureProductAnalytics = jest.fn();

type Goal = {
  id: string;
  title: string;
  target_date: string;
  activity_category: string;
};

type GoalCardProps = {
  goal: {
    id: string;
    objectiveSummary?: string;
    title: string;
    compactReadiness?: { status: "ready" | "watch" | "not_ready"; value: number } | null;
  };
  onPress: () => void;
  testID?: string;
};

type FlatListProps = {
  data: Goal[];
  renderItem: ({ item }: { item: Goal }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  [key: string]: unknown;
};

const goalCardPropsMock = jest.fn<void, [GoalCardProps]>();
const assessmentBatchUseQueryMock = jest.fn();

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
let renderedGoals = goals;

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

jest.mock("@/components/shared/GoalCard", () => ({
  __esModule: true,
  GoalCard: (props: GoalCardProps) => {
    goalCardPropsMock(props);
    return React.createElement(
      "TouchableOpacity",
      { onPress: props.onPress, testID: props.testID },
      React.createElement("Text", null, props.goal.title),
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
    goals: renderedGoals,
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    athleteIntelligence: {
      getGoalAssessmentBatch: { useQuery: assessmentBatchUseQueryMock },
      getGoalPortfolio: {
        useQuery: () => ({ data: { activeGoalCount: 1, totalGoalCount: 2 } }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));
jest.mock("@/lib/analytics/productAnalytics", () => ({
  useProductAnalytics: () => ({ capture: captureProductAnalytics }),
}));

const GoalsListScreen = require("../goals-list").default;

describe("goals list screen", () => {
  beforeEach(() => {
    renderedGoals = goals;
    navigateToMock.mockClear();
    goalCardPropsMock.mockClear();
    assessmentBatchUseQueryMock.mockReturnValue({
      data: {
        entries: [
          {
            goalId: "upcoming-goal",
            readiness: { status: "watch", value: 72 },
            freshness: "fresh",
            confidence: 0.8,
            revision: 4,
            computedAt: "2026-07-10T12:00:00.000Z",
          },
          {
            goalId: "past-goal",
            readiness: null,
            freshness: "unavailable",
            confidence: 0,
            revision: null,
            computedAt: "2026-07-10T12:00:00.000Z",
          },
        ],
      },
    });
  });

  it("uses lifecycle labels without deprecated goal intelligence props", async () => {
    await renderNative(<GoalsListScreen />);

    const propsByGoalId = new Map(
      goalCardPropsMock.mock.calls.map(([props]) => [props.goal.id, props]),
    );
    expect(propsByGoalId.get("upcoming-goal")).toEqual(
      expect.objectContaining({ goal: expect.objectContaining({ objectiveSummary: "Upcoming" }) }),
    );
    expect(propsByGoalId.get("past-goal")).toEqual(
      expect.objectContaining({ goal: expect.objectContaining({ objectiveSummary: "Goal" }) }),
    );
    for (const props of propsByGoalId.values()) {
      expect(props.goal).not.toHaveProperty("readinessPercent");
      expect(props.goal).not.toHaveProperty("readinessTarget");
      expect(props.goal).not.toHaveProperty("status");
    }
    expect(assessmentBatchUseQueryMock).toHaveBeenCalledTimes(1);
    expect(assessmentBatchUseQueryMock).toHaveBeenCalledWith(
      { goalIds: ["upcoming-goal", "past-goal"] },
      { enabled: true },
    );
    expect(propsByGoalId.get("upcoming-goal")?.goal.compactReadiness).toEqual({
      status: "watch",
      value: 72,
    });
    expect(propsByGoalId.get("past-goal")?.goal.compactReadiness).toBeNull();
    expect(screen.getByText("1 active of 2 goals")).toBeTruthy();
  });

  it("opens canonical goal detail when a goal is tapped", async () => {
    await renderNative(<GoalsListScreen />);

    await fireEvent.press(screen.getByTestId("goals-list-row-upcoming-goal"));

    expect(navigateToMock).toHaveBeenCalledWith("/goal-detail?id=upcoming-goal");
    expect(captureProductAnalytics).toHaveBeenCalledTimes(1);
    expect(captureProductAnalytics).toHaveBeenCalledWith("goal.detail_opened", {
      source: "goals_list",
    });
  });

  it("caps the compact readiness request while retaining the paginated list", async () => {
    renderedGoals = Array.from({ length: 101 }, (_, index) => ({
      activity_category: "run",
      id: `goal-${index}`,
      target_date: "2099-10-01",
      title: `Goal ${index}`,
    }));
    await renderNative(<GoalsListScreen />);

    expect(assessmentBatchUseQueryMock).toHaveBeenCalledWith(
      { goalIds: renderedGoals.slice(0, 100).map((goal) => goal.id) },
      { enabled: true },
    );
  });
});
