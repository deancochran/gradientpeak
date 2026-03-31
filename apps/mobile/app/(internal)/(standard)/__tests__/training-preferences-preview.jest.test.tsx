import { act } from "@testing-library/react-native";
import React from "react";

import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

function getNodeText(children: any): string {
  if (typeof children === "string") {
    return children;
  }

  if (typeof children === "number") {
    return String(children);
  }

  if (Array.isArray(children)) {
    return children.map((child) => getNodeText(child)).join("");
  }

  if (children?.props?.children !== undefined) {
    return getNodeText(children.props.children);
  }

  return "";
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

const upsertMock = jest.fn();
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

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));

jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: createHost("Input"),
}));

jest.mock("@repo/ui/components/integer-stepper", () => ({
  __esModule: true,
  IntegerStepper: createHost("IntegerStepper"),
}));

jest.mock("@repo/ui/components/percent-slider-input", () => ({
  __esModule: true,
  PercentSliderInput: createHost("PercentSliderInput"),
}));

jest.mock("@repo/ui/components/switch", () => ({
  __esModule: true,
  Switch: createHost("Switch"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/hooks/useProfileSettings", () => ({
  __esModule: true,
  useProfileSettings: () => ({
    profileId: "profile-1",
    settings: settingsFixture,
    isLoading: false,
    refetch: jest.fn(async () => undefined),
  }),
}));

jest.mock("@/lib/hooks/useTrainingPlanSnapshot", () => ({
  __esModule: true,
  useTrainingPlanSnapshot: () => snapshotState,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      profileSettings: {
        getForProfile: {
          invalidate: jest.fn(),
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

const TrainingPreferencesScreen = require("../training-preferences").default;

const getTextValues = () =>
  (screen as any).UNSAFE_getAllByType("Text").map((node: any) => getNodeText(node.props.children));

const getChart = () => (screen as any).UNSAFE_getAllByType("PlanVsActualChart")[0];

const getAllByTypeOrEmpty = (type: string) => {
  try {
    return (screen as any).UNSAFE_getAllByType(type);
  } catch {
    return [];
  }
};

const getTab = (label: string) =>
  (screen as any).UNSAFE_getAllByType("Pressable").find((node: any) => {
    if (node.props?.accessibilityRole !== "tab") {
      return false;
    }

    return node
      .findAll((child: any) => child.type === "Text")
      .some((child: any) => {
        return getNodeText(child.props.children) === label;
      });
  });

const getByTypeAndId = (type: string, id: string) =>
  (screen as any).UNSAFE_getAllByType(type).find((node: any) => node.props.id === id);

const getButtonByLabel = (label: string) =>
  (screen as any).UNSAFE_getAllByType("Button").find((node: any) => {
    return node
      .findAll((child: any) => child.type === "Text")
      .some((child: any) => {
        return getNodeText(child.props.children) === label;
      });
  });

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
    renderNative(<TrainingPreferencesScreen />);

    const tabLabels = getTextValues();

    expect(tabLabels).toContain("Schedule");
    expect(tabLabels).toContain("Training style");
    expect(tabLabels).toContain("Recovery");
    expect(tabLabels).toContain("Goal strategy");
    expect(tabLabels).not.toContain("Hide advanced");
  });

  it("renders updated preference tabs", () => {
    renderNative(<TrainingPreferencesScreen />);

    const tabLabels = getTextValues();

    expect(tabLabels).toContain("Schedule");
    expect(tabLabels).toContain("Training style");
    expect(tabLabels).toContain("Recovery");
    expect(tabLabels).toContain("Goal strategy");
  });

  it("updates preview chart data when draft sliders change", () => {
    renderNative(<TrainingPreferencesScreen />);

    const initialChart = getChart();
    const initialLastCtl =
      initialChart.props.projectedData[initialChart.props.projectedData.length - 1].ctl;

    act(() => {
      getTab("Training style").props.onPress();
    });

    const aggressivenessSlider = getByTypeAndId(
      "PercentSliderInput",
      "preferences-progression-pace",
    );

    act(() => {
      aggressivenessSlider.props.onChange(80);
    });

    const updatedChart = getChart();
    const updatedLastCtl =
      updatedChart.props.projectedData[updatedChart.props.projectedData.length - 1].ctl;

    expect(updatedLastCtl).not.toEqual(initialLastCtl);
  });

  it("shows a clear empty state when there is no active plan", () => {
    activePlanData = undefined;

    renderNative(<TrainingPreferencesScreen />);

    const textValues = getTextValues();

    expect(textValues.some((value: string) => value.includes("Preview unavailable"))).toBe(true);
    expect(
      textValues.some((value: string) => value.includes("Start or activate a training plan")),
    ).toBe(true);
    expect(getAllByTypeOrEmpty("PlanVsActualChart")).toHaveLength(0);
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

    renderNative(<TrainingPreferencesScreen />);

    const textValues = getTextValues();

    expect(textValues.some((value: string) => value.includes("Baseline curve not ready"))).toBe(
      true,
    );
    expect(textValues.some((value: string) => value.includes("baseline-vs-draft comparison"))).toBe(
      true,
    );
  });

  it("blocks saving when schedule limits conflict", () => {
    renderNative(<TrainingPreferencesScreen />);

    const minSessionsStepper = getByTypeAndId("IntegerStepper", "preferences-min-sessions");

    act(() => {
      minSessionsStepper.props.onChange(8);
    });

    const saveButton = getButtonByLabel("Save Preferences");
    const textValues = getTextValues();

    expect(saveButton.props.disabled).toBe(true);
    expect(
      textValues.some((value: string) =>
        value.includes("Fix these schedule conflicts before saving."),
      ),
    ).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves canonical preference sections including target surplus", () => {
    renderNative(<TrainingPreferencesScreen />);

    act(() => {
      getTab("Goal strategy").props.onPress();
    });

    const surplusSlider = getByTypeAndId("PercentSliderInput", "preferences-target-surplus");

    act(() => {
      surplusSlider.props.onChange(60);
    });

    act(() => {
      getButtonByLabel("Save Preferences").props.onPress();
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
