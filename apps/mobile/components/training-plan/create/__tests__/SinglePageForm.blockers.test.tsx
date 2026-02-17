import React from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  SinglePageForm,
  type TrainingPlanConfigFormData,
  type TrainingPlanFormData,
} from "../SinglePageForm";

vi.mock("react-native", () => ({
  Modal: (props: any) => React.createElement("Modal", props, props.children),
  Pressable: (props: any) =>
    React.createElement("Pressable", props, props.children),
  ScrollView: (props: any) =>
    React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: any) => React.createElement("Button", props, props.children),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("Badge", props, props.children),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => React.createElement("Input", props),
}));

vi.mock("@/components/ui/label", () => ({
  Label: (props: any) => React.createElement("Label", props, props.children),
}));

vi.mock("@/components/ui/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: (props: any) => React.createElement("Switch", props),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: any) => React.createElement("Select", props, props.children),
  SelectContent: (props: any) =>
    React.createElement("SelectContent", props, props.children),
  SelectItem: (props: any) =>
    React.createElement("SelectItem", props, props.children),
  SelectTrigger: (props: any) =>
    React.createElement("SelectTrigger", props, props.children),
  SelectValue: (props: any) => React.createElement("SelectValue", props),
}));

vi.mock("../CreationProjectionChart", () => ({
  CreationProjectionChart: (props: any) =>
    React.createElement("CreationProjectionChart", props),
}));

vi.mock("../inputs/BoundedNumberInput", () => ({
  BoundedNumberInput: (props: any) =>
    React.createElement("BoundedNumberInput", props),
}));

vi.mock("../inputs/DateField", () => ({
  DateField: (props: any) => React.createElement("DateField", props),
}));

vi.mock("../inputs/DurationInput", () => ({
  DurationInput: (props: any) => React.createElement("DurationInput", props),
}));

vi.mock("../inputs/IntegerStepper", () => ({
  IntegerStepper: (props: any) => React.createElement("IntegerStepper", props),
}));

vi.mock("../inputs/PaceInput", () => ({
  PaceInput: (props: any) => React.createElement("PaceInput", props),
}));

vi.mock("../inputs/PercentSliderInput", () => ({
  PercentSliderInput: (props: any) =>
    React.createElement("PercentSliderInput", props),
}));

vi.mock("../inputs/NumberSliderInput", () => ({
  NumberSliderInput: (props: any) =>
    React.createElement("NumberSliderInput", props),
}));

vi.mock("lucide-react-native", () => {
  const icon = (props: any) => React.createElement("Icon", props);
  return {
    Flag: icon,
    Gauge: icon,
    Heart: icon,
    Trophy: icon,
    Zap: icon,
    ChevronDown: icon,
    ChevronUp: icon,
    Lock: icon,
    LockOpen: icon,
    Pencil: icon,
    Plus: icon,
    ShieldAlert: icon,
    Trash2: icon,
  };
});

const getNodeText = (children: any): string => {
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
};

const findMockNodes = (renderer: ReactTestRenderer, type: string) =>
  renderer.root.findAll((node: any) => node.type === type);

const baseFormData: TrainingPlanFormData = {
  planStartDate: "2026-02-14",
  goals: [
    {
      id: "goal-1",
      name: "Spring race",
      targetDate: "2026-06-01",
      priority: 1,
      targets: [
        {
          id: "target-1",
          targetType: "race_performance",
          activityCategory: "run",
        },
      ],
    },
  ],
};

const baseConfigData = {
  availabilityConfig: {
    template: "moderate",
    days: [
      { day: "monday", windows: [], max_sessions: 0 },
      { day: "tuesday", windows: [], max_sessions: 0 },
      { day: "wednesday", windows: [], max_sessions: 0 },
      { day: "thursday", windows: [], max_sessions: 0 },
      { day: "friday", windows: [], max_sessions: 0 },
      { day: "saturday", windows: [], max_sessions: 0 },
      { day: "sunday", windows: [], max_sessions: 0 },
    ],
  },
  availabilityProvenance: {
    source: "default",
    updated_at: "2026-02-13T00:00:00.000Z",
  },
  recentInfluenceScore: 0,
  recentInfluenceAction: "accepted",
  recentInfluenceProvenance: {
    source: "default",
    updated_at: "2026-02-13T00:00:00.000Z",
  },
  constraints: {
    hard_rest_days: [],
    min_sessions_per_week: 3,
    max_sessions_per_week: 5,
  },
  optimizationProfile: "balanced",
  postGoalRecoveryDays: 5,
  maxWeeklyTssRampPct: 8,
  maxCtlRampPerWeek: 4,
  projectionControlV2: {
    mode: "advanced",
    ambition: 0.5,
    risk_tolerance: 0.4,
    curvature: 0,
    curvature_strength: 0.35,
    user_owned: {
      mode: false,
      ambition: false,
      risk_tolerance: false,
      curvature: false,
      curvature_strength: false,
    },
  },
  calibration: {
    version: 1,
    readiness_composite: {
      target_attainment_weight: 0.45,
      envelope_weight: 0.3,
      durability_weight: 0.15,
      evidence_weight: 0.1,
    },
    readiness_timeline: {
      target_tsb: 8,
      form_tolerance: 20,
      fatigue_overflow_scale: 0.4,
      feasibility_blend_weight: 0.15,
      smoothing_iterations: 24,
      smoothing_lambda: 0.28,
      max_step_delta: 9,
    },
    envelope_penalties: {
      over_high_weight: 0.55,
      under_low_weight: 0.2,
      over_ramp_weight: 0.25,
    },
    durability_penalties: {
      monotony_threshold: 2,
      monotony_scale: 2,
      strain_threshold: 900,
      strain_scale: 900,
      deload_debt_scale: 6,
    },
    no_history: {
      reliability_horizon_days: 42,
      confidence_floor_high: 0.75,
      confidence_floor_mid: 0.6,
      confidence_floor_low: 0.45,
      demand_tier_time_pressure_scale: 1,
    },
    optimizer: {
      preparedness_weight: 14,
      risk_penalty_weight: 0.35,
      volatility_penalty_weight: 0.22,
      churn_penalty_weight: 0.2,
      lookahead_weeks: 5,
      candidate_steps: 7,
    },
  },
  calibrationCompositeLocks: {
    target_attainment_weight: false,
    envelope_weight: false,
    durability_weight: false,
    evidence_weight: false,
  },
  constraintsSource: "default",
  locks: {
    availability_config: { locked: false },
    recent_influence: { locked: false },
    constraints: { locked: false },
  },
} as unknown as TrainingPlanConfigFormData;

describe("SinglePageForm blocker surfacing", () => {
  it("marks projection controls as user-owned when edited", () => {
    const handleConfigChange = vi.fn();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={handleConfigChange}
        />,
      );
    });

    const tuningTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Tuning tab",
    );

    act(() => {
      tuningTab.props.onPress();
    });

    const sliderNodes = findMockNodes(renderer!, "NumberSliderInput");
    const ambitionSlider = sliderNodes.find(
      (node: any) => node.props.id === "proj-ambition",
    );

    act(() => {
      ambitionSlider?.props.onChange(0.78);
    });

    const firstConfig = handleConfigChange.mock.calls.at(-1)?.[0];
    expect(firstConfig?.projectionControlV2.ambition).toBe(0.78);
    expect(firstConfig?.projectionControlV2.user_owned.ambition).toBe(true);

    const curvatureStrengthSlider = sliderNodes.find(
      (node: any) => node.props.id === "proj-curvature-strength",
    );
    act(() => {
      curvatureStrengthSlider?.props.onChange(0.91);
    });

    const secondConfig = handleConfigChange.mock.calls.at(-1)?.[0];
    expect(secondConfig?.projectionControlV2.curvature_strength).toBe(0.91);
    expect(
      secondConfig?.projectionControlV2.user_owned.curvature_strength,
    ).toBe(true);
  });

  it("shows technical multipliers inline without mode switching", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={{
            ...baseConfigData,
            projectionControlV2: {
              ...baseConfigData.projectionControlV2,
              mode: "simple",
            },
          }}
          onConfigChange={vi.fn()}
        />,
      );
    });

    const tuningTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Tuning tab",
    );
    act(() => {
      tuningTab.props.onPress();
    });

    const sliderNodes = findMockNodes(renderer!, "NumberSliderInput");
    expect(
      sliderNodes.some(
        (node: any) => node.props.id === "cal-preparedness-weight",
      ),
    ).toBe(true);

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );
    expect(
      textNodes.some((text) => text.includes("Switch mode to Advanced")),
    ).toBe(false);
  });

  it("wires single projection reset action to tuning header", () => {
    const onResetProjectionAll = vi.fn();

    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          onResetProjectionAll={onResetProjectionAll}
        />,
      );
    });

    const tuningTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Tuning tab",
    );
    act(() => {
      tuningTab.props.onPress();
    });

    const buttons = findMockNodes(renderer!, "Button");
    const resetButtons = buttons.filter(
      (node: any) => getNodeText(node.props.children) === "Reset",
    );
    expect(resetButtons).toHaveLength(1);
    const reset = resetButtons[0];

    act(() => {
      reset?.props.onPress();
    });

    expect(onResetProjectionAll).toHaveBeenCalledTimes(1);
  });

  it("uses frontier-aligned limits slider ranges", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
        />,
      );
    });

    const limitsTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Limits tab",
    );
    act(() => {
      limitsTab.props.onPress();
    });

    const numberSliders = findMockNodes(renderer!, "NumberSliderInput");
    const percentSliders = findMockNodes(renderer!, "PercentSliderInput");

    const weeklyRamp = percentSliders.find(
      (node: any) => node.props.id === "max-weekly-load-ramp",
    )?.props;
    const ctlRamp = numberSliders.find(
      (node: any) => node.props.id === "max-weekly-ctl-ramp",
    )?.props;

    expect(weeklyRamp).toMatchObject({
      min: 0,
      max: 40,
      step: 0.25,
    });
    expect(ctlRamp).toMatchObject({
      min: 0,
      max: 12,
      step: 0.1,
      decimals: 2,
      unitLabel: "CTL/wk",
    });
  });

  it("uses multiplier slider ranges for optimizer tuning", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
        />,
      );
    });

    const tuningTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Tuning tab",
    );

    act(() => {
      tuningTab.props.onPress();
    });

    const sliderNodes = findMockNodes(renderer!, "NumberSliderInput");
    const byId = (id: string) =>
      sliderNodes.find((node: any) => node.props.id === id)?.props;

    expect(byId("cal-preparedness-weight")).toMatchObject({
      min: 0,
      max: 30,
      step: 0.1,
      decimals: 1,
      label: "Push fitness multiplier",
    });
    expect(byId("cal-risk-penalty")).toMatchObject({
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      label: "Overload risk multiplier",
    });
    expect(byId("cal-volatility-penalty")).toMatchObject({
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      label: "Volatility multiplier",
    });
    expect(byId("cal-churn-penalty")).toMatchObject({
      min: 0,
      max: 2,
      step: 0.05,
      decimals: 2,
      label: "Schedule stability multiplier",
    });
  });

  it("shows review observations without fix CTAs on review tab", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          blockingIssues={[
            {
              code: "required_tss_ramp_exceeds_cap",
              message: "Required weekly load exceeds cap",
              suggestions: ["Lower target ramp"],
            },
            {
              code: "min_sessions_exceeds_max",
              message: "Min sessions exceeds max sessions",
              suggestions: ["Raise max sessions"],
            },
          ]}
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );

    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(textNodes).toContain(
      "Optional guidance only. This check explains plan fit, risk, and trend changes in plain language. It never blocks create.",
    );
    expect(textNodes).toContain("Observations based on known standards");
    expect(textNodes).toContain("Required weekly load exceeds cap");
    expect(textNodes).toContain("Min sessions exceeds max sessions");

    const buttonText = findMockNodes(renderer!, "Button").map((node: any) =>
      getNodeText(node.props.children),
    );
    expect(
      buttonText.some((text) => text.includes("Apply suggested fix")),
    ).toBe(false);
    expect(buttonText.some((text) => text.includes("Apply quick fix"))).toBe(
      false,
    );
  });

  it("renders goal assessment metadata on review tab when present", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-06-01",
              points: [],
              goal_markers: [
                {
                  id: "goal-1",
                  name: "Spring race",
                  target_date: "2026-06-01",
                  priority: 1,
                },
              ],
              periodization_phases: [],
              microcycles: [],
              goal_assessments: [
                {
                  goal_id: "goal-1",
                  priority: 1,
                  feasibility_band: "aggressive",
                  target_scores: [
                    {
                      kind: "finish_time",
                      score_0_100: 67,
                      unmet_gap: 210,
                      rationale_codes: ["gap_high"],
                    },
                  ],
                  conflict_notes: ["priority_precedence"],
                },
              ],
            } as any
          }
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );
    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(textNodes).toContain("Goal-by-goal check");
    expect(textNodes).toContain("Plan note: priority precedence");
    expect(textNodes).toContain(
      "Finish time confidence: 67 / 100 | shortfall 210",
    );
  });

  it("shows safety-first default planning policy in review diagnostics", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          feasibilitySafetySummary={
            {
              feasibility_band: "on-track",
              safety_band: "safe",
              blockers: [],
              top_drivers: [],
            } as any
          }
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );
    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(textNodes).toContain(
      "The planner always prefers a safer progression that still moves you toward your goals.",
    );
  });

  it("renders readiness-delta diagnostics panel for latest movement", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          readinessDeltaDiagnostics={
            {
              readiness: {
                direction: "down",
                delta: -3.25,
                previous_score: 71.4,
                current_score: 68.15,
              },
              impacts: {
                load: {
                  key: "load",
                  direction: "up",
                  delta: 12,
                  effect: "supports_readiness",
                  previous_value: 405,
                  current_value: 417,
                  reason_codes: ["impact_load_tss_delta"],
                },
                fatigue: {
                  key: "fatigue",
                  direction: "up",
                  delta: 5.5,
                  effect: "suppresses_readiness",
                  previous_value: 61,
                  current_value: 66.5,
                  reason_codes: ["impact_fatigue_atl_delta"],
                },
                feasibility: {
                  key: "feasibility",
                  direction: "up",
                  delta: 1,
                  effect: "suppresses_readiness",
                  previous_value: 0,
                  current_value: 1,
                  reason_codes: ["impact_feasibility_pressure_delta"],
                },
              },
              dominant_driver: "fatigue",
              summary_codes: ["readiness_delta_diagnostics_v1"],
            } as any
          }
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );
    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(textNodes).toContain("What changed most recently");
    expect(
      textNodes.some((text) =>
        text.includes("Readiness decreased by 3.25 points"),
      ),
    ).toBe(true);
    expect(textNodes).toContain("Main reason: fatigue.");
    expect(
      textNodes.some((text) =>
        text.includes("Timeline pressure increased by 1.00"),
      ),
    ).toBe(true);
  });

  it("surfaces continuous projection diagnostics in review panel when available", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          feasibilitySafetySummary={
            {
              feasibility_band: "on-track",
              safety_band: "safe",
              blockers: [],
              top_drivers: [],
            } as any
          }
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-06-01",
              points: [],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
              projection_diagnostics: {
                continuous_projection_diagnostics: {
                  effective_optimizer: {
                    preparedness_weight: 17.2,
                    risk_penalty_weight: 0.31,
                  },
                  active_constraints: ["tss_ramp_cap_pressure"],
                  binding_constraints: ["availability_cap"],
                  clamp_pressure: 0.38,
                  objective_composition: {
                    preparedness: 2.41,
                    risk_penalty: -0.52,
                  },
                  curvature_contribution: 0.18,
                },
              },
            } as any
          }
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );
    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(
      textNodes.some((text) =>
        text.includes("Effective optimizer: preparedness weight 17.2"),
      ),
    ).toBe(true);
    expect(textNodes).toContain("Active constraints: tss ramp cap pressure.");
    expect(
      textNodes.some((text) =>
        text.includes(
          "Binding constraints: availability cap | clamp pressure 38%",
        ),
      ),
    ).toBe(true);
    expect(
      textNodes.some((text) =>
        text.includes(
          "Objective mix: preparedness 2.41, risk penalty -0.52 | curvature 0.18.",
        ),
      ),
    ).toBe(true);
  });

  it("shows canonical projection diagnostics for theoretical frontier review", () => {
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <SinglePageForm
          formData={baseFormData}
          onFormDataChange={vi.fn()}
          configData={baseConfigData}
          onConfigChange={vi.fn()}
          feasibilitySafetySummary={
            {
              feasibility_band: "on-track",
              safety_band: "safe",
              blockers: [],
              top_drivers: [],
            } as any
          }
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-06-01",
              points: [],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
              projection_diagnostics: {
                selected_path: "full_mpc",
                fallback_reason: null,
                candidate_counts: {
                  full_mpc: 50,
                  degraded_bounded_mpc: 0,
                  legacy_optimizer: 0,
                },
                prune_counts: {
                  full_mpc: 4,
                  degraded_bounded_mpc: 0,
                },
                active_constraints: [
                  "single_mode_safety_caps_enforced",
                  "feasibility_caps_enforced",
                ],
                tie_break_chain: ["objective", "readiness"],
                effective_optimizer_config: {
                  weights: {
                    preparedness_weight: 19.1,
                    risk_penalty_weight: 0.16,
                    volatility_penalty_weight: 0.2,
                    churn_penalty_weight: 0.18,
                  },
                  caps: {
                    max_weekly_tss_ramp_pct: 40,
                    max_ctl_ramp_per_week: 12,
                  },
                  search: {
                    lookahead_weeks: 8,
                    candidate_steps: 15,
                  },
                  curvature: {
                    target: 0,
                    strength: 0,
                    weight: 0,
                  },
                },
                clamp_counts: {
                  tss: 4,
                  ctl: 2,
                },
                objective_contributions: {
                  sampled_weeks: 6,
                  objective_score: 2.3,
                  weighted_terms: {
                    goal: 2.2,
                    readiness: 1.5,
                    risk: -0.7,
                    volatility: -0.2,
                    churn: -0.1,
                    monotony: -0.03,
                    strain: -0.02,
                    curve: 0.21,
                  },
                },
              },
            } as any
          }
        />,
      );
    });

    const reviewTab = renderer!.root.find(
      (node: any) => node.props.accessibilityLabel === "Review tab",
    );
    act(() => {
      reviewTab.props.onPress();
    });

    const textNodes = findMockNodes(renderer!, "Text").map((node: any) =>
      getNodeText(node.props.children),
    );

    expect(
      textNodes.some((text) =>
        text.includes("Effective optimizer: preparedness weight 19.1"),
      ),
    ).toBe(true);
    expect(textNodes).toContain(
      "Active constraints: single mode safety caps enforced, feasibility caps enforced.",
    );
    expect(
      textNodes.some((text) =>
        text.includes("Binding constraints: none | clamp pressure 100%"),
      ),
    ).toBe(true);
    expect(
      textNodes.some((text) =>
        text.includes("Objective mix: goal 2.20, readiness 1.50, risk -0.70"),
      ),
    ).toBe(true);
  });
});
