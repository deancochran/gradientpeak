import React from "react";

import { renderNative } from "../../../../test/render-native";

const createGoalMutateAsync = jest.fn().mockResolvedValue({ id: "goal-new" });
const goalsFixture: any[] = [];
const goalEditorModalPropsRef = { current: null as any };

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  buildGoalCreatePayload: jest.fn(({ draft, profileId }: any) => ({
    profile_id: profileId,
    target_date: draft.targetDate,
    title: draft.title,
    priority: draft.importance,
    activity_category: draft.activityCategory,
    target_payload: {
      type: "event_performance",
      distance_m: 5000,
      target_time_s: 1500,
    },
  })),
  createEmptyGoalDraft: jest.fn(() => ({ title: "", objective: null })),
  buildGoalDraftFromGoal: jest.fn(),
  buildGoalUpdatePayload: jest.fn(),
  formatGoalTypeLabel: jest.fn(() => "Race"),
  getGoalObjectiveSummary: jest.fn(() => "5K target"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/shared", () => ({ __esModule: true, AppHeader: createHost("AppHeader") }));
jest.mock("@/components/goals", () => ({
  __esModule: true,
  GoalEditorModal: (props: any) => {
    goalEditorModalPropsRef.current = props;
    return React.createElement("GoalEditorModal", props, props.children);
  },
}));
jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));
jest.mock("@repo/ui/components/button", () => ({ __esModule: true, Button: createHost("Button") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({ __esModule: true, Settings: createHost("Settings") }));

jest.mock("@/lib/hooks/useProfileGoals", () => ({
  __esModule: true,
  useProfileGoals: () => ({
    profileId: "11111111-1111-4111-8111-111111111111",
    goals: goalsFixture,
    goalsCount: goalsFixture.length,
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => ({
    idealCurveData: {
      startCTL: 40,
      targetCTL: 50,
      targetDate: "2026-08-01",
      dataPoints: [
        { date: "2026-04-01", ctl: 45 },
        { date: "2026-08-01", ctl: 55 },
      ],
    },
    insightTimeline: {
      load_guidance: { mode: "goal_driven", goal_count: 0, dated_goal_count: 0 },
      timeline: [],
    },
    refetchAll: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      goals: { list: { invalidate: jest.fn() } },
      events: { list: { invalidate: jest.fn() }, getById: { invalidate: jest.fn() } },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: () => ({
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            training_plan: { name: "Current Plan" },
          },
          refetch: jest.fn(async () => undefined),
        }),
      },
      list: {
        useQuery: () => ({ data: [] }),
        useInfiniteQuery: () => ({ data: { pages: [{ items: [], total: 0 }] } }),
      },
    },
    events: {
      list: { useQuery: () => ({ data: { items: [] }, refetch: jest.fn() }) },
    },
    goals: {
      create: { useMutation: () => ({ isPending: false, mutateAsync: createGoalMutateAsync }) },
      update: { useMutation: () => ({ isPending: false, mutateAsync: jest.fn() }) },
    },
  },
}));

const PlanScreenWithErrorBoundary = require("../plan").default;

describe("plan goal persistence", () => {
  beforeEach(() => {
    createGoalMutateAsync.mockClear();
    goalEditorModalPropsRef.current = null;
    goalsFixture.splice(0, goalsFixture.length);
  });

  it("serializes canonical goal payloads when creating a goal", async () => {
    renderNative(<PlanScreenWithErrorBoundary />);

    await goalEditorModalPropsRef.current.onSubmit({
      title: "Spring 5K",
      targetDate: "2026-06-01",
      importance: 8,
      goalType: "race_performance",
      activityCategory: "run",
      raceDistanceKm: 5,
      raceTargetMode: "time",
      targetDuration: "0:25:00",
      thresholdTestDuration: "0:20:00",
      consistencySessionsPerWeek: 4,
      consistencyWeeks: 8,
    });

    expect(createGoalMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        profile_id: "11111111-1111-4111-8111-111111111111",
        target_date: "2026-06-01",
        title: "Spring 5K",
        priority: 8,
        activity_category: "run",
        target_payload: expect.objectContaining({
          type: "event_performance",
          distance_m: 5000,
          target_time_s: 1500,
        }),
      }),
    );
  });
});
