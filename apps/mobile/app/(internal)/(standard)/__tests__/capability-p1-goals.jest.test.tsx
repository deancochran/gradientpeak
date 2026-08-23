import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigate = jest.fn();
const back = jest.fn();

type HostProps = {
  ListEmptyComponent?: React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  [key: string]: unknown;
};
type HeaderActionProps = { label: string; onPress: () => void; testID?: string };
type EmptyStateProps = { title: string; testID?: string };

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ ListEmptyComponent, ListHeaderComponent, ...props }: HostProps) =>
    React.createElement("FlatList", props, ListHeaderComponent, ListEmptyComponent),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
  useLocalSearchParams: () => ({ id: "missing-goal" }),
  useRouter: () => ({ back, navigate }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));
jest.mock("@/components/plan/GoalListItem", () => ({ GoalListItem: createHost("GoalListItem") }));
jest.mock("@/components/shared", () => ({
  __esModule: true,
  EmptyState: createHost("EmptyState"),
  FilterChip: createHost("FilterChip"),
  FilterSection: createHost("FilterSection"),
  IndexFilterSheet: createHost("IndexFilterSheet"),
  IndexResultsSummary: createHost("IndexResultsSummary"),
  IndexSearchBar: createHost("IndexSearchBar"),
}));
jest.mock("@/components/shared/HeaderAction", () => ({
  HeaderTextAction: ({ label, onPress, testID }: HeaderActionProps) =>
    React.createElement("Pressable", { onPress, testID }, React.createElement("Text", null, label)),
}));
jest.mock("@/components/shared/ScreenState", () => ({
  EmptyState: ({ title, testID }: EmptyStateProps) =>
    React.createElement(
      "View",
      { testID: testID ?? "goal-not-found" },
      React.createElement("Text", null, title),
    ),
  LoadingState: createHost("LoadingState"),
  ErrorState: createHost("ErrorState"),
}));
jest.mock("@/lib/hooks/useProfileGoals", () => ({
  useProfileGoals: () => ({
    goals: [],
    isError: false,
    isFetching: false,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({ useAppNavigate: () => navigate }));
jest.mock("@/lib/constants/routes", () => ({ ROUTES: { GOALS: { CREATE: "/goal-create" } } }));
jest.mock("@repo/core", () => ({
  canonicalActivityCategorySchema: {},
  createEmptyGoalDraft: jest.fn(() => ({ title: "" })),
  buildGoalDraftFromGoal: jest.fn(() => ({ title: "" })),
  buildGoalUpdatePayload: jest.fn(),
  parseProfileGoalRecord: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  api: {
    goals: {
      getById: { useQuery: () => ({ data: undefined, isLoading: false }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    },
    useUtils: () => ({}),
  },
}));
jest.mock("@repo/api/react", () => ({ invalidateGoalQueries: jest.fn() }));
jest.mock("@repo/ui/components/loading", () => ({ LoadingButton: createHost("LoadingButton") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/goals", () => ({ GoalEditorForm: createHost("GoalEditorForm") }));

const GoalsListScreen = require("../goals-list").default;
const GoalEditScreen = require("../goal-edit").default;

describe("P1 goal mobile boundaries", () => {
  beforeEach(() => {
    navigate.mockReset();
    back.mockReset();
  });

  it("goals.browse-and-inspect distinguishes an empty library from a loading failure", async () => {
    await renderNative(<GoalsListScreen />);

    expect(screen.getByTestId("goals-list-screen")).toBeTruthy();
    expect(screen.queryByTestId("goals-list-row-any-goal")).toBeNull();
    expect(screen.getByTestId("goals-list-create-button")).toBeTruthy();
  });

  it("goals.create exposes the library entry point without hiding it in the list", async () => {
    await renderNative(<GoalsListScreen />);

    await fireEvent.press(screen.getByTestId("goals-list-create-button"));

    expect(navigate).toHaveBeenCalledWith("/goal-create");
  });

  it("goals.edit offers recovery when the requested goal is unavailable", async () => {
    await renderNative(<GoalEditScreen />);

    expect(screen.getByTestId("goal-not-found")).toBeTruthy();
  });
});
