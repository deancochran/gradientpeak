import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import GoalDetailScreen from "../goal-detail";

const { updateGoalMutateAsync, updateEventMutateAsync } = vi.hoisted(() => ({
  updateGoalMutateAsync: vi.fn().mockResolvedValue({ id: "goal-1" }),
  updateEventMutateAsync: vi.fn().mockResolvedValue({ id: "event-1" }),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Alert: { alert: vi.fn() },
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "goal-1" }),
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/components/goals/GoalEditorModal", () => ({
  GoalEditorModal: createHost("GoalEditorModal"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      goals: {
        list: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
      events: {
        list: { invalidate: vi.fn() },
        getById: { invalidate: vi.fn() },
      },
    }),
    goals: {
      getById: {
        useQuery: () => ({
          data: {
            id: "11111111-1111-4111-8111-111111111111",
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
          refetch: vi.fn(async () => undefined),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: updateGoalMutateAsync,
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
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
      create: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutateAsync: updateEventMutateAsync,
        }),
      },
      delete: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
    },
  },
}));

describe("goal detail persistence", () => {
  it("serializes canonical updates when editing a goal", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<GoalDetailScreen />);
    });

    const modal = renderer.root.findAll(
      (node: any) => node.type === "GoalEditorModal",
    )[0];

    await act(async () => {
      await modal.props.onSubmit({
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
    });

    expect(updateEventMutateAsync).toHaveBeenCalledWith({
      id: "33333333-3333-4333-8333-333333333333",
      patch: expect.objectContaining({
        starts_at: "2026-06-15T12:00:00.000Z",
        event_type: "race_target",
      }),
    });
    expect(updateGoalMutateAsync).toHaveBeenCalledWith({
      id: "11111111-1111-4111-8111-111111111111",
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
