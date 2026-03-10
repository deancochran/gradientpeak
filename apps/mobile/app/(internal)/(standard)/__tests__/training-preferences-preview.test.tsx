import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import TrainingPreferencesScreen from "../training-preferences";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const settingsFixture = {
  availability_config: { days: [] },
  behavior_controls_v1: {
    aggressiveness: 0.5,
    recovery_priority: 0.5,
    variability: 0.5,
  },
  constraints: {
    min_sessions_per_week: 2,
    max_sessions_per_week: 6,
    max_single_session_duration_minutes: 180,
  },
  locks: {
    behavior_controls_v1: { locked: false },
    post_goal_recovery_days: { locked: false },
  },
  post_goal_recovery_days: 5,
};

vi.mock("react-native", () => ({
  ActivityIndicator: createHost("ActivityIndicator"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

vi.mock("@/components/charts/PlanVsActualChart", () => ({
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

vi.mock("@/components/training-plan/create/inputs/IntegerStepper", () => ({
  IntegerStepper: createHost("IntegerStepper"),
}));

vi.mock("@/components/training-plan/create/inputs/PercentSliderInput", () => ({
  PercentSliderInput: createHost("PercentSliderInput"),
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

vi.mock("@/components/ui/switch", () => ({
  Switch: createHost("Switch"),
}));

vi.mock("@/components/ui/text", () => ({
  Text: createHost("Text"),
}));

vi.mock("@/lib/hooks/useProfileSettings", () => ({
  useProfileSettings: () => ({
    profileId: "profile-1",
    settings: settingsFixture,
    isLoading: false,
    refetch: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  useTrainingPlanSnapshot: () => ({
    actualCurveData: {
      dataPoints: [
        { date: "2026-03-01", ctl: 40 },
        { date: "2026-03-02", ctl: 41 },
      ],
    },
    idealCurveData: {
      dataPoints: [
        { date: "2026-03-01", ctl: 40 },
        { date: "2026-03-02", ctl: 42 },
        { date: "2026-03-03", ctl: 44 },
      ],
      targetCTL: 60,
      targetDate: "2026-07-01",
    },
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profileSettings: {
        getForProfile: {
          invalidate: vi.fn(),
        },
      },
    }),
    trainingPlans: {
      getActivePlan: {
        useQuery: () => ({
          data: { id: "plan-1" },
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
  },
}));

vi.mock("@repo/core", () => ({
  normalizeCreationConfig: (input: any) => input.defaults,
}));

describe("training preferences projection preview", () => {
  it("renders updated preference tabs", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const tabLabels = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        return typeof value === "string" ? value : "";
      });

    expect(tabLabels).toContain("Recovery");
    expect(tabLabels).toContain("Style");
    expect(tabLabels).toContain("Schedule");
    expect(tabLabels).toContain("Session Size");
  });

  it("updates preview chart data when draft sliders change", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const initialChart = renderer.root.findAll(
      (node: any) => node.type === "PlanVsActualChart",
    )[0];
    const initialLastCtl =
      initialChart.props.idealData[initialChart.props.idealData.length - 1].ctl;

    const behaviorTab = renderer.root.findAll(
      (node: any) =>
        node.type === "Pressable" &&
        node.findAll((child: any) => child.type === "Text")[0]?.props
          ?.children === "Style",
    )[0];

    act(() => {
      behaviorTab.props.onPress();
    });

    const aggressivenessSlider = renderer.root.findAll(
      (node: any) =>
        node.type === "PercentSliderInput" &&
        node.props.id === "preferences-aggressiveness",
    )[0];

    act(() => {
      aggressivenessSlider.props.onChange(80);
    });

    const updatedChart = renderer.root.findAll(
      (node: any) => node.type === "PlanVsActualChart",
    )[0];
    const updatedLastCtl =
      updatedChart.props.idealData[updatedChart.props.idealData.length - 1].ctl;

    expect(updatedLastCtl).not.toEqual(initialLastCtl);
  });
});
