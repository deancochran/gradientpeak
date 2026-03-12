import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrainingPreferencesScreen from "../training-preferences";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

const settingsFixture = {
  availability: {
    weekly_windows: [],
    hard_rest_days: [],
  },
  dose_limits: {
    min_sessions_per_week: 2,
    max_sessions_per_week: 6,
    max_single_session_duration_minutes: 180,
    max_weekly_duration_minutes: 420,
  },
  training_style: {
    progression_pace: 0.5,
    week_pattern_preference: 0.5,
    key_session_density_preference: 0.5,
  },
  recovery_preferences: {
    recovery_priority: 0.5,
    post_goal_recovery_days: 5,
    double_day_tolerance: 0.25,
    long_session_fatigue_tolerance: 0.5,
  },
  adaptation_preferences: {
    recency_adaptation_preference: 0.5,
    plan_churn_tolerance: 0.4,
  },
  goal_strategy_preferences: {
    target_surplus_preference: 0.15,
    priority_tradeoff_preference: 0.5,
  },
};

const upsertMock = vi.fn();
let activePlanData: { id: string } | undefined = { id: "plan-1" };
let activePlanIsLoading = false;
let snapshotState = {
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
  loading: {
    plan: false,
    idealCurve: false,
  },
  errors: {
    idealCurve: null,
  },
  profileGoals: [{ id: "goal-1" }],
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
  useTrainingPlanSnapshot: () => snapshotState,
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
          data: activePlanData,
          isLoading: activePlanIsLoading,
        }),
      },
    },
    profileSettings: {
      upsert: {
        useMutation: () => ({
          isPending: false,
          mutate: upsertMock,
        }),
      },
    },
  },
}));

describe("training preferences projection preview", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    activePlanData = { id: "plan-1" };
    activePlanIsLoading = false;
    snapshotState = {
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
      loading: {
        plan: false,
        idealCurve: false,
      },
      errors: {
        idealCurve: null,
      },
      profileGoals: [{ id: "goal-1" }],
    };
  });

  it("renders canonical preference tabs", () => {
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

    expect(tabLabels).toContain("Schedule");
    expect(tabLabels).toContain("Training style");
    expect(tabLabels).toContain("Recovery");
    expect(tabLabels).toContain("Goal strategy");
    expect(tabLabels).not.toContain("Hide advanced");
  });

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

    expect(tabLabels).toContain("Schedule");
    expect(tabLabels).toContain("Training style");
    expect(tabLabels).toContain("Recovery");
    expect(tabLabels).toContain("Goal strategy");
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
      initialChart.props.projectedData[
        initialChart.props.projectedData.length - 1
      ].ctl;

    const behaviorTab = renderer.root.findAll(
      (node: any) =>
        node.type === "Pressable" &&
        node.findAll((child: any) => child.type === "Text")[0]?.props
          ?.children === "Training style",
    )[0];

    act(() => {
      behaviorTab.props.onPress();
    });

    const aggressivenessSlider = renderer.root.findAll(
      (node: any) =>
        node.type === "PercentSliderInput" &&
        node.props.id === "preferences-progression-pace",
    )[0];

    act(() => {
      aggressivenessSlider.props.onChange(80);
    });

    const updatedChart = renderer.root.findAll(
      (node: any) => node.type === "PlanVsActualChart",
    )[0];
    const updatedLastCtl =
      updatedChart.props.projectedData[
        updatedChart.props.projectedData.length - 1
      ].ctl;

    expect(updatedLastCtl).not.toEqual(initialLastCtl);
  });

  it("shows a clear empty state when there is no active plan", () => {
    activePlanData = undefined;

    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        return typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.join("")
            : "";
      });

    expect(
      textValues.some((value: string) => value.includes("Preview unavailable")),
    ).toBe(true);
    expect(
      textValues.some((value: string) =>
        value.includes("Start or activate a training plan"),
      ),
    ).toBe(true);
    expect(
      renderer.root.findAll((node: any) => node.type === "PlanVsActualChart"),
    ).toHaveLength(0);
  });

  it("shows a baseline-curve message when projection data is missing", () => {
    snapshotState = {
      ...snapshotState,
      idealCurveData: {
        dataPoints: [],
        targetCTL: 60,
        targetDate: "2026-07-01",
      },
    };

    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        return typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.join("")
            : "";
      });

    expect(
      textValues.some((value: string) =>
        value.includes("Baseline curve not ready"),
      ),
    ).toBe(true);
    expect(
      textValues.some((value: string) =>
        value.includes("baseline-vs-draft comparison"),
      ),
    ).toBe(true);
  });

  it("blocks saving when schedule limits conflict", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const minSessionsStepper = renderer.root.findAll(
      (node: any) =>
        node.type === "IntegerStepper" &&
        node.props.id === "preferences-min-sessions",
    )[0];

    act(() => {
      minSessionsStepper.props.onChange(8);
    });

    const saveButton = renderer.root
      .findAll((node: any) => node.type === "Button")
      .find((node: any) => {
        const textNode = node.findAll((child: any) => child.type === "Text")[0];
        return textNode?.props?.children === "Save Preferences";
      });

    const textValues = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => {
        const value = node.props.children;
        return typeof value === "string"
          ? value
          : Array.isArray(value)
            ? value.join("")
            : "";
      });

    expect(saveButton?.props.disabled).toBe(true);
    expect(
      textValues.some((value: string) =>
        value.includes("Fix these schedule conflicts before saving."),
      ),
    ).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves canonical preference sections including target surplus", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<TrainingPreferencesScreen />);
    });

    const goalStrategyTab = renderer.root.findAll(
      (node: any) =>
        node.type === "Pressable" &&
        node.findAll((child: any) => child.type === "Text")[0]?.props
          ?.children === "Goal strategy",
    )[0];

    act(() => {
      goalStrategyTab.props.onPress();
    });

    const surplusSlider = renderer.root.findAll(
      (node: any) =>
        node.type === "PercentSliderInput" &&
        node.props.id === "preferences-target-surplus",
    )[0];

    act(() => {
      surplusSlider.props.onChange(60);
    });

    const saveButton = renderer.root
      .findAll((node: any) => node.type === "Button")
      .find((node: any) => {
        const textNode = node.findAll((child: any) => child.type === "Text")[0];
        return textNode?.props?.children === "Save Preferences";
      });

    act(() => {
      saveButton!.props.onPress();
    });

    expect(upsertMock).toHaveBeenCalledWith({
      profile_id: "profile-1",
      settings: expect.objectContaining({
        availability: expect.any(Object),
        dose_limits: expect.any(Object),
        training_style: expect.any(Object),
        recovery_preferences: expect.any(Object),
        adaptation_preferences: expect.any(Object),
        goal_strategy_preferences: expect.objectContaining({
          target_surplus_preference: 0.6,
        }),
      }),
    });
  });
});
