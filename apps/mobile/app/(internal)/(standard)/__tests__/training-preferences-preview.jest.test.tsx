import { act, waitFor } from "@testing-library/react-native";
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
    strength_integration_priority: 0.5,
  },
  recovery_preferences: {
    recovery_priority: 0.5,
    post_goal_recovery_days: 5,
    double_day_tolerance: 0.25,
    long_session_fatigue_tolerance: 0.5,
    systemic_fatigue_tolerance: 0.5,
  },
  adaptation_preferences: {
    recency_adaptation_preference: 0.5,
    plan_churn_tolerance: 0.4,
  },
  goal_strategy_preferences: {
    target_surplus_preference: 0.15,
    priority_tradeoff_preference: 0.5,
    taper_style_preference: 0.5,
  },
  baseline_fitness: {
    is_enabled: false,
    max_weekly_tss_ramp_pct: 10,
    max_ctl_ramp_per_week: 5,
  },
};

const upsertMock = jest.fn();
let activePlanData: { id: string } | undefined = { id: "plan-1" };
let activePlanIsLoading = false;
const previewGoalsFixture = [
  {
    id: "goal-1",
    profile_id: "profile-1",
    milestone_event_id: "event-1",
    title: "Spring Bike Test",
    activity_category: "bike",
    priority: 7,
    target_date: "2026-07-01",
    objective: {
      type: "threshold",
      metric: "power",
      value: 260,
      test_duration_s: 1200,
      activity_category: "bike",
    },
  },
];
let snapshotState = {
  plan: {
    id: "plan-1",
    created_at: "2026-02-01T00:00:00.000Z",
  },
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
  profileGoals: previewGoalsFixture,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@react-native-community/datetimepicker", () => {
  const MockDateTimePicker = createHost("DateTimePicker");

  return {
    __esModule: true,
    default: MockDateTimePicker,
    DateTimePickerAndroid: {
      open: jest.fn(),
    },
  };
});

jest.mock("@/components/charts/PlanVsActualChart", () => ({
  __esModule: true,
  PlanVsActualChart: createHost("PlanVsActualChart"),
}));

jest.mock("@/lib/training-plan-form/localPreview", () => ({
  __esModule: true,
  computeLocalCreationPreview: ({ profileSettings }: any) => {
    const pace = profileSettings?.training_style?.progression_pace ?? 0.5;
    const finalCtl = 44 + Math.round((pace - 0.5) * 100) / 5;

    return {
      projectionChart: {
        display_points: [
          { date: "2026-03-01", predicted_fitness_ctl: 40 },
          { date: "2026-03-02", predicted_fitness_ctl: 42 },
          { date: "2026-03-03", predicted_fitness_ctl: finalCtl },
        ],
      },
      previewSnapshotBaseline: {
        readiness_score: 72,
        predicted_load_tss: 310,
        predicted_fatigue_atl: 47,
        feasibility_state: "feasible",
        tss_ramp_clamp_weeks: 0,
        ctl_ramp_clamp_weeks: 0,
      },
    };
  },
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

jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: createHost("DateInput"),
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
          mutateAsync: async (input: unknown) => {
            upsertMock(input);
            return undefined;
          },
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

const getByTypeAndTestId = (type: string, testId: string) =>
  (screen as any).UNSAFE_getAllByType(type).find((node: any) => node.props.testId === testId);

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
      plan: {
        id: "plan-1",
        created_at: "2026-02-01T00:00:00.000Z",
      },
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
      profileGoals: previewGoalsFixture,
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

  it("renders planner-backed preference controls", () => {
    renderNative(<TrainingPreferencesScreen />);

    act(() => {
      getTab("Training style").props.onPress();
    });

    let textValues = getTextValues();
    expect(textValues).toContain("Strength integration priority");
    expect(textValues).not.toContain("Key session density");

    act(() => {
      getTab("Recovery").props.onPress();
    });

    textValues = getTextValues();
    expect(textValues).toContain("Systemic fatigue tolerance");
    expect(textValues).not.toContain("Double day tolerance");
    expect(textValues).not.toContain("Long session fatigue tolerance");

    act(() => {
      getTab("Goal strategy").props.onPress();
    });

    textValues = getTextValues();
    expect(textValues).toContain("Taper style");
    expect(textValues).not.toContain("Priority tradeoff");
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
    snapshotState = {
      ...snapshotState,
      plan: undefined,
      idealCurveData: {
        dataPoints: [],
        targetCTL: null,
        targetDate: null,
      },
    } as any;

    renderNative(<TrainingPreferencesScreen />);

    const textValues = getTextValues();

    expect(textValues.some((value: string) => value.includes("Draft preview"))).toBe(true);
    expect(textValues.some((value: string) => value.includes("Preview unavailable"))).toBe(false);
    expect(getAllByTypeOrEmpty("PlanVsActualChart")).toHaveLength(1);
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

    expect(textValues.some((value: string) => value.includes("Draft preview"))).toBe(true);
    expect(textValues.some((value: string) => value.includes("Preview unavailable"))).toBe(false);
  });

  it("blocks saving when schedule limits conflict", () => {
    renderNative(<TrainingPreferencesScreen />);

    const minSessionsStepper = getByTypeAndTestId("IntegerStepper", "preferences-min-sessions");

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

  it("resets back to fetched settings after form edits", async () => {
    renderNative(<TrainingPreferencesScreen />);

    act(() => {
      getTab("Goal strategy").props.onPress();
    });

    const surplusSlider = getByTypeAndId("PercentSliderInput", "preferences-target-surplus");

    act(() => {
      surplusSlider.props.onChange(60);
    });

    await waitFor(() => {
      expect(getButtonByLabel("Save Preferences").props.disabled).toBe(false);
    });

    act(() => {
      getButtonByLabel("Reset").props.onPress();
    });

    const resetSlider = getByTypeAndId("PercentSliderInput", "preferences-target-surplus");

    expect(resetSlider.props.value).toBe(15);
    expect(getButtonByLabel("Save Preferences").props.disabled).toBe(true);
  });

  it("saves canonical preference sections including target surplus", async () => {
    renderNative(<TrainingPreferencesScreen />);

    act(() => {
      getTab("Goal strategy").props.onPress();
    });

    const surplusSlider = getByTypeAndId("PercentSliderInput", "preferences-target-surplus");

    act(() => {
      surplusSlider.props.onChange(60);
    });

    await act(async () => {
      await getButtonByLabel("Save Preferences").props.onPress();
    });

    await waitFor(() => {
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

  it("saves baseline override dates as ISO values from date-only input", async () => {
    renderNative(<TrainingPreferencesScreen />);

    act(() => {
      getTab("Baseline fitness").props.onPress();
    });

    act(() => {
      getByTypeAndTestId("Switch", "preferences-baseline-enabled").props.onCheckedChange(true);
    });

    act(() => {
      getByTypeAndTestId("DateInput", "preferences-baseline-date").props.onChange("2026-04-03");
    });

    await act(async () => {
      await getButtonByLabel("Save Preferences").props.onPress();
    });

    await waitFor(() => {
      expect(upsertMock).toHaveBeenCalledWith({
        profile_id: "profile-1",
        settings: expect.objectContaining({
          baseline_fitness: expect.objectContaining({
            is_enabled: true,
            override_date: "2026-04-03T00:00:00.000Z",
          }),
        }),
      });
    });
  });
});
