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
      "CTL/ATL/TSB describe training load and freshness trends only; they do not determine athlete suitability.",
    );
  });
});
