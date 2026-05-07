import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const navigateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: "goal-1" }),
  useRouter: () => ({ back: jest.fn(), navigate: navigateMock }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(() => ({ title: "Spring 5K" })),
  parseProfileGoalRecord: jest.fn((goal: any) => goal),
  buildGoalUpdatePayload: jest.fn(({ draft }: any) => ({
    target_date: draft.targetDate,
    title: draft.title,
    priority: draft.importance,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      target_time_s: 1450,
      distance_m: 5000,
    },
  })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalDistanceBadge: jest.fn(() => null),
  getGoalMetricSummary: jest.fn(() => null),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
      events: { list: { invalidate: jest.fn() } },
    }),
    goals: {
      getById: {
        useQuery: () => ({
          data: {
            id: "goal-1",
            profile_id: "22222222-2222-4222-8222-222222222222",
            target_date: "2026-06-01",
            title: "Spring 5K",
            priority: 8,
            activity_category: "run",
            target_payload: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 5000,
              target_time_s: 1500,
            },
          },
          isLoading: false,
          refetch: jest.fn(async () => undefined),
        }),
      },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
  },
}));

const GoalDetailScreen = require("../goal-detail").default;

describe("goal detail persistence", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("routes editing through the dedicated goal edit screen", async () => {
    renderNative(<GoalDetailScreen />);

    fireEvent.press(screen.getByTestId("goal-detail-options-edit"));

    expect(navigateMock).toHaveBeenCalledWith("/goal-edit?id=goal-1");
  });
});
