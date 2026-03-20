import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { PlanVsActualChart } from "../PlanVsActualChart";

vi.mock("react-native", () => ({
  Pressable: (props: any) =>
    React.createElement("Pressable", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@repo/ui/components/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@shopify/react-native-skia", () => ({
  DashPathEffect: (props: any) => React.createElement("DashPathEffect", props),
  useFont: () => ({ getTextWidth: () => 24 }),
  Line: (props: any) => React.createElement("SkiaLine", props),
  Text: (props: any) => React.createElement("SkiaText", props),
  vec: (x: number, y: number) => ({ x, y }),
}));

vi.mock("victory-native", () => ({
  CartesianChart: ({ children, data }: any) =>
    React.createElement(
      "CartesianChart",
      { data },
      children({
        points: {
          projection: data,
          planned: data,
          actual: data,
          goal: data,
        },
        chartBounds: { left: 0, right: 100, top: 0, bottom: 100 },
      }),
    ),
  Area: (props: any) => React.createElement("Area", props),
  Line: (props: any) => React.createElement("Line", props),
  Scatter: (props: any) => React.createElement("Scatter", props),
}));

vi.mock("../../../assets/fonts/SpaceMono-Regular.ttf", () => ({
  default: "mock-font",
}));

describe("PlanVsActualChart", () => {
  it("renders the core series for a weekly timeline", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <PlanVsActualChart
          timeline={[
            {
              date: "2026-03-02",
              ideal_tss: 320,
              scheduled_tss: 300,
              actual_tss: 280,
              adherence_score: 0.9,
            },
            {
              date: "2026-03-09",
              ideal_tss: 340,
              scheduled_tss: 330,
              actual_tss: 310,
              adherence_score: 0.92,
            },
          ]}
          actualData={[]}
          projectedData={[]}
        />,
      );
    });

    const lines = renderer.root.findAll(
      (node) => (node.type as any) === "Line",
    );
    const scatters = renderer.root.findAll(
      (node) => (node.type as any) === "Scatter",
    );
    const areas = renderer.root.findAll(
      (node) => (node.type as any) === "Area",
    );

    // 1 Line for planned, 1 Line for actual
    expect(lines.length).toBe(2);
    expect(scatters.length).toBe(0);
    // 1 Area for projection, 1 Area for planned
    expect(areas.length).toBe(2);
  });

  it("renders multiple goal markers instead of only the first goal", () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <PlanVsActualChart
          timeline={[
            {
              date: "2026-03-02",
              ideal_tss: 320,
              scheduled_tss: 300,
              actual_tss: 280,
              adherence_score: 0.9,
            },
            {
              date: "2026-03-09",
              ideal_tss: 340,
              scheduled_tss: 330,
              actual_tss: 310,
              adherence_score: 0.92,
            },
            {
              date: "2026-03-16",
              ideal_tss: 350,
              scheduled_tss: 345,
              actual_tss: 320,
              adherence_score: 0.94,
            },
          ]}
          actualData={[]}
          projectedData={[]}
          goalMarkers={[
            { id: "goal-1", targetDate: "2026-03-03", label: "Race A" },
            { id: "goal-2", targetDate: "2026-03-18", label: "Race B" },
          ]}
        />,
      );
    });

    const goalLines = renderer.root.findAll(
      (node) =>
        (node.type as any) === "SkiaLine" &&
        node.props.color === "rgba(34, 197, 94, 0.6)",
    );

    expect(goalLines).toHaveLength(2);
  });
});
