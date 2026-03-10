import { ROUTES } from "@/lib/constants/routes";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import PlanScreenWithErrorBoundary from "../plan";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
}));

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

vi.mock("react-native", () => ({
  RefreshControl: createHost("RefreshControl"),
  ScrollView: createHost("ScrollView"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

vi.mock("@/components/shared", () => ({
  AppHeader: createHost("AppHeader"),
}));

vi.mock("@/components/goals", () => ({
  GoalEditorModal: createHost("GoalEditorModal"),
}));

vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: createHost("Button"),
}));

vi.mock("@/components/ui/card", () => ({
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));

vi.mock("@/components/ui/icon", () => ({
  Icon: createHost("Icon"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("lucide-react-native", () => ({
  Settings: createHost("Settings"),
}));

vi.mock("@/lib/hooks/useProfileGoals", () => ({
  useProfileGoals: () => ({
    profileId: "profile-1",
    goals: [
      {
        id: "goal-1",
        title: "Race A",
        goal_type: "race_performance",
        importance: 8,
        target_date: "2026-08-01",
      },
    ],
    goalsCount: 1,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/hooks/useProfileSettings", () => ({
  useProfileSettings: () => ({
    settings: {
      availability_config: { days: [] },
      behavior_controls_v1: {
        aggressiveness: 0.5,
        recovery_priority: 0.5,
        variability: 0.5,
      },
      constraints: { hard_rest_days: [] },
      locks: {
        volume_by_day: false,
        intensity_distribution: false,
      },
      post_goal_recovery_days: 5,
      microcycle_pattern: {
        hard_days: [],
        medium_days: [],
        easy_days: [],
      },
      progression_preferences: {
        weekly_progression_cap: 0.08,
      },
      diagnostics: { include_readiness_codes: true },
    },
    settingsRecord: null,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
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
      load_guidance: {
        mode: "goal_driven",
        goal_count: 1,
        dated_goal_count: 1,
        interpretation:
          "Recommended load is anchored to your dated goals and current plan context.",
      },
      readiness_summary: {
        score: 68,
        interpretation:
          "Projection confidence is improving with better adherence.",
      },
      timeline: [
        {
          date: "2026-04-01",
          ideal_tss: 42,
          scheduled_tss: 38,
          actual_tss: 0,
        },
      ],
    },
    refetchAll: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profileSettings: { getForProfile: { invalidate: vi.fn() } },
      goals: { list: { invalidate: vi.fn() } },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: () => ({
          data: {
            id: "active-1",
            next_event_at: "2026-04-05T00:00:00.000Z",
            training_plan: { name: "Current Plan" },
          },
          refetch: vi.fn(async () => undefined),
        }),
      },
      list: {
        useQuery: () => ({
          data: [{ id: "active-1", name: "Current Plan" }],
        }),
      },
    },
    events: {
      list: {
        useQuery: (input: any) => ({
          data:
            input?.date_from && input?.date_to
              ? {
                  items: [
                    {
                      id: "event-1",
                      training_plan_id: "active-1",
                      starts_at: "2026-04-05T00:00:00.000Z",
                    },
                  ],
                }
              : { items: [] },
          refetch: vi.fn(async () => undefined),
        }),
      },
    },
    profileSettings: {
      upsert: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
    },
    goals: {
      create: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
        }),
      },
      update: {
        useMutation: () => ({
          isPending: false,
          mutate: vi.fn(),
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

describe("plan dashboard navigation", () => {
  it("renders dashboard sections", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const cardTitles = renderer.root
      .findAll((node: any) => node.type === "CardTitle")
      .map((node: any) => node.props.children);

    expect(cardTitles).toContain("Forecasted Projection");
    expect(cardTitles).toContain("Goals");
    expect(cardTitles).toContain("Current Plan");
    expect(
      renderer.root.findAll((node: any) => node.type === "PlanVsActualChart"),
    ).toHaveLength(1);
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("150%");
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("Physiological readiness");
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("Planning confidence");
    expect(
      renderer.root
        .findAll((node: any) => node.type === "Text")
        .map((node) => {
          const value = node.props.children;
          if (Array.isArray(value)) {
            return value.join("");
          }
          return typeof value === "string" ? value : "";
        }),
    ).toContain("This week's load");
  });

  it("opens calendar from dashboard action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttons = renderer.root.findAll(
      (node: any) => node.type === "Button",
    );
    const calendarButton = buttons.find((node: any) => {
      const textNode = node.findAll((child: any) => child.type === "Text")[0];
      return textNode?.props?.children === "Open Calendar";
    });
    expect(calendarButton).toBeDefined();

    act(() => {
      calendarButton!.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.CALENDAR);
  });

  it("opens training plans list from management action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttons = renderer.root.findAll(
      (node: any) => node.type === "Button",
    );
    const manageButton = buttons.find((node: any) => {
      const textNode = node.findAll((child: any) => child.type === "Text")[0];
      return textNode?.props?.children === "Manage Plans";
    });
    expect(manageButton).toBeDefined();

    act(() => {
      manageButton!.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PLAN.LIST);
  });

  it("navigates to goal detail when a goal card is pressed", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const goalCard = renderer.root.findAll((node: any) => {
      if (
        node.type !== "TouchableOpacity" ||
        typeof node.props.onPress !== "function"
      ) {
        return false;
      }

      const texts = node
        .findAll((child: any) => child.type === "Text")
        .map((child: any) => child.props.children);

      return texts.includes("Race A");
    })[0];

    expect(goalCard).toBeDefined();

    act(() => {
      goalCard.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.GOAL_DETAIL("goal-1"));
  });

  it("opens training preferences from projection settings icon", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const settingsButton = renderer.root.findByProps({
      testID: "projection-settings-button",
    });

    act(() => {
      settingsButton.props.onPress();
    });

    expect(pushMock).toHaveBeenCalledWith(ROUTES.PLAN.TRAINING_PREFERENCES);
  });

  it("does not render active-plan navigation action", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<PlanScreenWithErrorBoundary />);
    });

    const buttonLabels = renderer.root
      .findAll((node: any) => node.type === "Button")
      .map((node: any) => {
        const textNode = node.findAll((child: any) => child.type === "Text")[0];
        return textNode?.props?.children;
      });

    expect(buttonLabels).not.toContain("Open Detailed Projection");
  });
});
