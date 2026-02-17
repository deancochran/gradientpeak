import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { CreationProjectionChart } from "../CreationProjectionChart";

vi.mock("react-native", () => ({
  Pressable: (props: any) =>
    React.createElement("Pressable", props, props.children),
  ScrollView: (props: any) =>
    React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@/components/ui/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@shopify/react-native-skia", () => ({
  useFont: () => ({}),
}));

vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));

vi.mock("victory-native", () => ({
  CartesianChart: ({ children, data }: any) =>
    React.createElement(
      "CartesianChart",
      null,
      children({
        points: {
          loadTss: data,
          fitnessCtl: data,
          fatigueAtl: data,
          formTsb: data,
          readinessScore: data,
        },
        chartBounds: { left: 0, right: 100, top: 0, bottom: 100 },
      }),
    ),
  Line: (props: any) => React.createElement("Line", props),
}));

vi.mock("../../../assets/fonts/SpaceMono-Regular.ttf", () => ({
  default: "mock-font",
}));

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

describe("CreationProjectionChart metadata", () => {
  it("uses canonical display_points series without local synthetic points", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreationProjectionChart
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-03-14",
              points: [
                {
                  date: "2026-02-14",
                  predicted_load_tss: 420,
                  predicted_fitness_ctl: 55,
                  predicted_fatigue_atl: 62,
                  predicted_form_tsb: -7,
                  readiness_score: 74,
                },
              ],
              display_points: [
                {
                  date: "2026-02-20",
                  predicted_load_tss: 430,
                  predicted_fitness_ctl: 56,
                  predicted_fatigue_atl: 63,
                  predicted_form_tsb: -7,
                  readiness_score: 75,
                },
                {
                  date: "2026-02-27",
                  predicted_load_tss: 440,
                  predicted_fitness_ctl: 57,
                  predicted_fatigue_atl: 64,
                  predicted_form_tsb: -7,
                  readiness_score: 76,
                },
              ],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
            } as any
          }
        />,
      );
    });

    const tabs = renderer!.root.findAll(
      (node: any) =>
        node.props?.accessibilityRole === "tab" &&
        typeof node.props?.accessibilityLabel === "string" &&
        node.props.accessibilityLabel.startsWith("Point "),
    );

    const uniquePointTabLabels = new Set(
      tabs.map((node: any) => node.props?.accessibilityLabel),
    );

    expect(uniquePointTabLabels.size).toBe(2);
  });

  it("does not render a separate readiness metadata card", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreationProjectionChart
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-03-14",
              points: [
                {
                  date: "2026-02-14",
                  predicted_load_tss: 420,
                  predicted_fitness_ctl: 55,
                  predicted_fatigue_atl: 62,
                  predicted_form_tsb: -7,
                  readiness_score: 74,
                },
              ],
              goal_markers: [
                {
                  id: "goal-1",
                  name: "A race",
                  target_date: "2026-03-14",
                  priority: 1,
                },
              ],
              periodization_phases: [],
              microcycles: [],
              readiness_score: 74,
              readiness_confidence: 68,
              capacity_envelope: {
                envelope_score: 61,
                envelope_state: "edge",
                limiting_factors: ["ramp_limit", "durability_signal_low"],
              },
            } as any
          }
        />,
      );
    });

    const textNodes = renderer!.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getNodeText(node.props.children));

    expect(textNodes.some((text) => text.includes("Confidence:"))).toBe(false);
    expect(textNodes.some((text) => text.includes("Capacity envelope:"))).toBe(
      false,
    );
    expect(textNodes.some((text) => text.includes("limiter: ramp_limit"))).toBe(
      false,
    );
  });

  it("renders training-state labeling with non-suitability wording", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreationProjectionChart
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-03-14",
              points: [
                {
                  date: "2026-02-14",
                  predicted_load_tss: 420,
                  predicted_fitness_ctl: 55,
                  predicted_fatigue_atl: 62,
                  predicted_form_tsb: -7,
                  readiness_score: 74,
                },
              ],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
              readiness_score: 74,
              readiness_confidence: 60,
              capacity_envelope: {
                envelope_score: 88,
                envelope_state: "inside",
                limiting_factors: [],
              },
            } as any
          }
        />,
      );
    });

    const textNodes = renderer!.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getNodeText(node.props.children));

    expect(textNodes).toContain("Training state");
    expect(textNodes).toContain(
      "CTL/ATL describe training load and fatigue trends only; they do not determine athlete suitability.",
    );
  });

  it("shows continuous projection diagnostics in existing guardrails panel", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreationProjectionChart
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-03-14",
              points: [
                {
                  date: "2026-02-14",
                  predicted_load_tss: 420,
                  predicted_fitness_ctl: 55,
                  predicted_fatigue_atl: 62,
                  predicted_form_tsb: -7,
                  readiness_score: 74,
                },
              ],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
              constraint_summary: {
                normalized_creation_config: {
                  optimization_profile: "balanced",
                  post_goal_recovery_days: 5,
                  max_weekly_tss_ramp_pct: 8,
                  max_ctl_ramp_per_week: 4,
                },
                tss_ramp_clamp_weeks: 2,
                ctl_ramp_clamp_weeks: 1,
                recovery_weeks: 1,
              },
              projection_diagnostics: {
                continuous_projection_diagnostics: {
                  effective_optimizer: {
                    preparedness_weight: 15.4,
                    risk_penalty_weight: 0.29,
                  },
                  active_constraints: ["tss_ramp_cap_pressure"],
                  binding_constraints: ["availability_cap"],
                  clamp_pressure: 0.41,
                  objective_composition: {
                    preparedness: 2.15,
                    risk_penalty: -0.63,
                  },
                  curvature_contribution: 0.22,
                },
              },
            } as any
          }
        />,
      );
    });

    const textNodes = renderer!.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getNodeText(node.props.children));

    expect(textNodes).toContain(
      "Effective optimizer: preparedness weight 15.4, risk penalty weight 0.29.",
    );
    expect(textNodes).toContain("Active constraints: tss ramp cap pressure.");
    expect(textNodes).toContain(
      "Binding constraints: availability cap | Clamp pressure 41%",
    );
    expect(textNodes).toContain(
      "Objective mix: preparedness 2.15, risk penalty -0.63 | curvature 0.22.",
    );
  });

  it("surfaces canonical projection diagnostics for theoretical frontier runs", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CreationProjectionChart
          projectionChart={
            {
              start_date: "2026-02-14",
              end_date: "2026-03-14",
              points: [
                {
                  date: "2026-02-14",
                  predicted_load_tss: 420,
                  predicted_fitness_ctl: 55,
                  predicted_fatigue_atl: 62,
                  predicted_form_tsb: -7,
                  readiness_score: 74,
                },
              ],
              goal_markers: [],
              periodization_phases: [],
              microcycles: [],
              constraint_summary: {
                normalized_creation_config: {
                  optimization_profile: "outcome_first",
                  post_goal_recovery_days: 3,
                  max_weekly_tss_ramp_pct: 40,
                  max_ctl_ramp_per_week: 12,
                },
                tss_ramp_clamp_weeks: 4,
                ctl_ramp_clamp_weeks: 3,
                recovery_weeks: 1,
              },
              projection_diagnostics: {
                selected_path: "full_mpc",
                fallback_reason: null,
                candidate_counts: {
                  full_mpc: 42,
                  degraded_bounded_mpc: 0,
                  legacy_optimizer: 0,
                },
                prune_counts: {
                  full_mpc: 6,
                  degraded_bounded_mpc: 0,
                },
                active_constraints: [
                  "single_mode_safety_caps_enforced",
                  "feasibility_caps_enforced",
                ],
                tie_break_chain: ["objective", "readiness"],
                effective_optimizer_config: {
                  weights: {
                    preparedness_weight: 18.6,
                    risk_penalty_weight: 0.18,
                    volatility_penalty_weight: 0.2,
                    churn_penalty_weight: 0.16,
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
                  tss: 5,
                  ctl: 3,
                },
                objective_contributions: {
                  sampled_weeks: 8,
                  objective_score: 3.14,
                  weighted_terms: {
                    goal: 2.4,
                    readiness: 1.9,
                    risk: -0.8,
                    volatility: -0.2,
                    churn: -0.1,
                    monotony: -0.05,
                    strain: -0.04,
                    curve: 0.27,
                  },
                },
              },
            } as any
          }
        />,
      );
    });

    const textNodes = renderer!.root
      .findAll((node: any) => node.type === "Text")
      .map((node: any) => getNodeText(node.props.children));

    expect(
      textNodes.some((text) =>
        text.includes("Effective optimizer: preparedness weight 18.6"),
      ),
    ).toBe(true);
    expect(textNodes).toContain(
      "Active constraints: single mode safety caps enforced, feasibility caps enforced.",
    );
    expect(
      textNodes.some((text) =>
        text.includes("Binding constraints: none | Clamp pressure 100%"),
      ),
    ).toBe(true);
    expect(
      textNodes.some((text) =>
        text.includes("Objective mix: goal 2.40, readiness 1.90, risk -0.80"),
      ),
    ).toBe(true);
  });
});
