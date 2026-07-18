import React, { type ComponentProps, isValidElement, type ReactNode } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { HostProps } from "../../../../test/mock-components";

import { renderNative, screen } from "../../../../test/render-native";
import { CreationProjectionChart } from "../CreationProjectionChart";

type ChartDatum = { index: number };
type ProjectionChartFixture = NonNullable<
  ComponentProps<typeof CreationProjectionChart>["projectionChart"]
>;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: (props: HostProps) => React.createElement("Pressable", props, props.children),
  ScrollView: (props: HostProps) => React.createElement("ScrollView", props, props.children),
  View: (props: HostProps) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: HostProps) => React.createElement("Text", props, props.children),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  useFont: () => ({}),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
  CartesianChart: ({
    children,
    data,
    xAxis,
  }: {
    children: (context: {
      points: Record<string, ChartDatum[]>;
      chartBounds: HostProps;
    }) => ReactNode;
    data: ChartDatum[];
    xAxis: { formatXLabel: (index: number) => string };
  }) =>
    React.createElement(
      "CartesianChart",
      null,
      data.map((datum: ChartDatum) =>
        React.createElement(
          "Text",
          { key: `x-axis-${datum.index}` },
          xAxis.formatXLabel(datum.index),
        ),
      ),
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
  Line: (props: HostProps) => React.createElement("Line", props),
  useChartPressState: () => ({
    state: {
      isActive: { value: false },
      x: { value: { value: 0 } },
      y: {},
    },
  }),
}));

jest.mock("@/assets/fonts/SpaceMono-Regular.ttf", () => ({
  __esModule: true,
  default: "mock-font",
}));

function getHostNodes(type: string) {
  return screen.UNSAFE_root.findAll((node: ReactTestInstance) => String(node.type) === type);
}

const getNodeText = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(getNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(children))
    return getNodeText(children.props.children);
  return "";
};

const getTextNodes = () =>
  getHostNodes("Text").map((node: ReactTestInstance) => getNodeText(node.props.children));

function projectionFixture<T extends ProjectionChartFixture>(fixture: T): T {
  return fixture;
}

const baseProjectionDiagnostics: NonNullable<ProjectionChartFixture["projection_diagnostics"]> = {
  selected_path: "full_mpc",
  fallback_reason: null,
  candidate_counts: { full_mpc: 0, degraded_bounded_mpc: 0, legacy_optimizer: 0 },
  prune_counts: { full_mpc: 0, degraded_bounded_mpc: 0 },
  active_constraints: [],
  tie_break_chain: [],
  effective_optimizer_config: {
    weights: {
      preparedness_weight: 0,
      risk_penalty_weight: 0,
      volatility_penalty_weight: 0,
      churn_penalty_weight: 0,
    },
    caps: { max_weekly_tss_ramp_pct: 0, max_ctl_ramp_per_week: 0 },
    search: { lookahead_weeks: 0, candidate_steps: 0 },
    curvature: { target: 0, strength: 0, weight: 0 },
  },
  clamp_counts: { tss: 0, ctl: 0 },
  objective_contributions: {
    sampled_weeks: 0,
    objective_score: 0,
    weighted_terms: {
      goal: 0,
      readiness: 0,
      risk: 0,
      volatility: 0,
      churn: 0,
      monotony: 0,
      strain: 0,
      curve: 0,
    },
  },
  optimization_tradeoff_summary: {
    goal_utility: 0,
    risk_penalty: 0,
    volatility_penalty: 0,
    churn_penalty: 0,
    net_utility: 0,
  },
  convergence_guard: {
    max_solver_attempts: 0,
    solver_attempts: 0,
    non_finite_objective_rejections: 0,
    stability_assertions: [],
  },
};

describe("CreationProjectionChart metadata", () => {
  it("uses canonical display_points series without local synthetic points", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
        })}
      />,
    );

    const tabs = getHostNodes("Pressable").filter(
      (node: ReactTestInstance) =>
        node.props?.accessibilityRole === "tab" &&
        typeof node.props?.accessibilityLabel === "string" &&
        node.props.accessibilityLabel.startsWith("Point "),
    );

    expect(new Set(tabs.map((node: ReactTestInstance) => node.props.accessibilityLabel)).size).toBe(
      2,
    );
  });

  it("uses relative Week/Day labels instead of absolute dates for creation chart points", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
          start_date: "2026-07-06",
          end_date: "2026-07-20",
          points: [
            {
              date: "2026-07-06",
              predicted_load_tss: 420,
              predicted_fitness_ctl: 55,
              predicted_fatigue_atl: 62,
              predicted_form_tsb: -7,
              readiness_score: 74,
            },
            {
              date: "2026-07-13",
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
        })}
      />,
    );

    const textNodes = getTextNodes();
    expect(textNodes).toContain("W1 D1");
    expect(textNodes).toContain("W2 D1");
    expect(textNodes).toContain("Projection window: Week 1 Day 1 to Week 3 Day 1");
    expect(textNodes.some((text: string) => /Jul|07\/|2026/.test(text))).toBe(false);

    const tabs = getHostNodes("Pressable").filter(
      (node: ReactTestInstance) => node.props?.accessibilityRole === "tab",
    );
    expect(tabs.map((node: ReactTestInstance) => node.props.accessibilityLabel)).toEqual([
      "Point 1 of 2, W1 D1",
      "Point 2 of 2, W2 D1",
    ]);
  });

  it("keeps old readiness metadata card removed but shows confidence hint", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
          goal_markers: [{ id: "goal-1", name: "A race", target_date: "2026-03-14", priority: 1 }],
          periodization_phases: [],
          microcycles: [],
          readiness_score: 74,
          readiness_confidence: 68,
          risk_score: 52,
          no_history: {
            fitness_signal_0_1: 0.44,
            goal_demand_score_0_1: 0.71,
            projection_floor_confidence: "medium",
            projection_floor_applied: true,
            projection_floor_values: { start_ctl: 12, start_weekly_tss: 120 },
            fitness_level: "weak",
            floor_clamped_by_availability: false,
            fitness_inference_reasons: [],
          },
          capacity_envelope: {
            envelope_score: 61,
            envelope_state: "edge",
            limiting_factors: ["ramp_limit", "durability_signal_low"],
          },
        })}
      />,
    );

    const textNodes = getTextNodes();
    expect(
      textNodes.some((text: string) =>
        text.includes(
          "Confidence hint: model confidence 68%. Readiness remains the primary signal.",
        ),
      ),
    ).toBe(true);
    expect(textNodes.some((text: string) => text.includes("Capacity envelope:"))).toBe(false);
    expect(textNodes.some((text: string) => text.includes("limiter: ramp_limit"))).toBe(false);
    expect(textNodes).toContain("Risk score: 52%");
    expect(textNodes).toContain("Fitness signal: 44%");
    expect(textNodes).toContain("Goal demand: 71%");
  });

  it("shows non-blocking uncertainty hint when prediction uncertainty is available", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
              prediction_uncertainty: 0.22,
            },
          ],
          goal_markers: [],
          periodization_phases: [],
          microcycles: [],
        })}
      />,
    );

    expect(getTextNodes()).toContain(
      "Uncertainty hint: forecast spread 22%. Readiness remains the primary signal.",
    );
  });

  it("renders training-state labeling with non-suitability wording", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
        })}
      />,
    );

    const textNodes = getTextNodes();
    expect(textNodes).toContain("Training state");
    expect(textNodes).toContain(
      "CTL/ATL describe training load and fatigue trends only; they do not determine athlete suitability.",
    );
  });

  it("shows continuous projection diagnostics in existing guardrails panel", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
              learned_ramp_rate: {
                max_safe_ramp_rate: 40,
                confidence: "medium",
                source: "default",
              },
            },
            tss_ramp_clamp_weeks: 2,
            ctl_ramp_clamp_weeks: 1,
            recovery_weeks: 1,
          },
          projection_diagnostics: {
            ...baseProjectionDiagnostics,
            continuous_projection_diagnostics: {
              ...baseProjectionDiagnostics,
              effective_optimizer: { preparedness_weight: 15.4, risk_penalty_weight: 0.29 },
              active_constraints: ["tss_ramp_cap_pressure"],
              binding_constraints: ["availability_cap"],
              clamp_pressure: 0.41,
              objective_composition: { preparedness: 2.15, risk_penalty: -0.63 },
              curvature_contribution: 0.22,
            },
          },
        })}
      />,
    );

    const textNodes = getTextNodes();
    expect(textNodes).toContain(
      "Effective optimizer: preparedness weight 15.4, risk penalty weight 0.29.",
    );
    expect(textNodes).toContain("Active constraints: tss ramp cap pressure.");
    expect(textNodes).toContain("Binding constraints: availability cap | Clamp pressure 41%");
    expect(textNodes).toContain(
      "Objective mix: preparedness 2.15, risk penalty -0.63 | curvature 0.22.",
    );
  });

  it("surfaces canonical projection diagnostics for theoretical frontier runs", () => {
    renderNative(
      <CreationProjectionChart
        projectionChart={projectionFixture({
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
              learned_ramp_rate: {
                max_safe_ramp_rate: 40,
                confidence: "medium",
                source: "default",
              },
            },
            tss_ramp_clamp_weeks: 4,
            ctl_ramp_clamp_weeks: 3,
            recovery_weeks: 1,
          },
          projection_diagnostics: {
            ...baseProjectionDiagnostics,
            selected_path: "full_mpc",
            fallback_reason: null,
            candidate_counts: { full_mpc: 42, degraded_bounded_mpc: 0, legacy_optimizer: 0 },
            prune_counts: { full_mpc: 6, degraded_bounded_mpc: 0 },
            active_constraints: ["single_mode_safety_caps_enforced", "feasibility_caps_enforced"],
            tie_break_chain: ["objective", "readiness"],
            effective_optimizer_config: {
              weights: {
                preparedness_weight: 18.6,
                risk_penalty_weight: 0.18,
                volatility_penalty_weight: 0.2,
                churn_penalty_weight: 0.16,
              },
              caps: { max_weekly_tss_ramp_pct: 40, max_ctl_ramp_per_week: 12 },
              search: { lookahead_weeks: 8, candidate_steps: 15 },
              curvature: { target: 0, strength: 0, weight: 0 },
            },
            clamp_counts: { tss: 5, ctl: 3 },
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
        })}
      />,
    );

    const textNodes = getTextNodes();
    expect(
      textNodes.some((text: string) =>
        text.includes("Effective optimizer: preparedness weight 18.6"),
      ),
    ).toBe(true);
    expect(textNodes).toContain(
      "Active constraints: single mode safety caps enforced, feasibility caps enforced.",
    );
    expect(
      textNodes.some((text: string) =>
        text.includes("Binding constraints: none | Clamp pressure 100%"),
      ),
    ).toBe(true);
    expect(
      textNodes.some((text: string) =>
        text.includes("Objective mix: goal 2.40, readiness 1.90, risk -0.80"),
      ),
    ).toBe(true);
  });
});
