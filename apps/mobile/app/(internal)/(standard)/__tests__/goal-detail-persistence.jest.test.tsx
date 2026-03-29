import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const updateGoalMutateAsync = jest.fn().mockResolvedValue({ id: "goal-1" });
const updateEventMutateAsync = jest.fn().mockResolvedValue({ id: "event-1" });
const goalEditorModalPropsRef = { current: null as any };

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: jest.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ id: "goal-1" }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(() => ({ title: "Spring 5K" })),
  parseProfileGoalRecord: jest.fn((goal: any) => goal),
  buildGoalUpdatePayload: jest.fn(({ draft, milestoneEventId }: any) => ({
    title: draft.title,
    priority: draft.importance,
    milestone_event_id: milestoneEventId,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      target_time_s: 1450,
      distance_m: 5000,
    },
  })),
  buildMilestoneEventCreateInput: jest.fn(),
  buildMilestoneEventUpdatePatch: jest.fn(({ draft }: any) => ({
    starts_at: `${draft.targetDate}T12:00:00.000Z`,
    event_type: "race_target",
  })),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalDistanceBadge: jest.fn(() => null),
  getGoalMetricSummary: jest.fn(() => null),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
}));

jest.mock("@/components/goals/GoalEditorModal", () => ({
  __esModule: true,
  GoalEditorModal: (props: any) => {
    goalEditorModalPropsRef.current = props;
    return React.createElement("GoalEditorModal", props, props.children);
  },
}));

jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/lib/trpc", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
      events: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
    }),
    goals: {
      getById: {
        useQuery: () => ({
          data: {
            id: "goal-1",
            profile_id: "22222222-2222-4222-8222-222222222222",
            milestone_event_id: "33333333-3333-4333-8333-333333333333",
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
      update: { useMutation: () => ({ isPending: false, mutateAsync: updateGoalMutateAsync }) },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
    events: {
      getById: {
        useQuery: () => ({
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            starts_at: "2026-06-01T12:00:00.000Z",
          },
        }),
      },
      create: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: updateEventMutateAsync }) },
      delete: { useMutation: () => ({ isPending: false, mutate: jest.fn() }) },
    },
  },
}));

const GoalDetailScreen = require("../goal-detail").default;

describe("goal detail persistence", () => {
  beforeEach(() => {
    updateGoalMutateAsync.mockClear();
    updateEventMutateAsync.mockClear();
    goalEditorModalPropsRef.current = null;
  });

  it("serializes canonical updates when editing a goal", async () => {
    renderNative(<GoalDetailScreen />);

    fireEvent.press(screen.getByText("Edit Goal"));

    await goalEditorModalPropsRef.current.onSubmit({
      title: "Spring 5K",
      targetDate: "2026-06-15",
      importance: 9,
      goalType: "race_performance",
      activityCategory: "run",
      raceDistanceKm: 5,
      raceTargetMode: "time",
      targetDuration: "0:24:10",
      thresholdTestDuration: "0:20:00",
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
    });

    expect(updateEventMutateAsync).toHaveBeenCalledWith({
      id: "33333333-3333-4333-8333-333333333333",
      patch: expect.objectContaining({
        starts_at: "2026-06-15T12:00:00.000Z",
        event_type: "race_target",
      }),
    });
    expect(updateGoalMutateAsync).toHaveBeenCalledWith({
      id: "goal-1",
      data: expect.objectContaining({
        milestone_event_id: "33333333-3333-4333-8333-333333333333",
        title: "Spring 5K",
        priority: 9,
        activity_category: "run",
        target_payload: expect.objectContaining({
          type: "event_performance",
          target_time_s: 1450,
          distance_m: 5000,
        }),
      }),
    });
  });
});
