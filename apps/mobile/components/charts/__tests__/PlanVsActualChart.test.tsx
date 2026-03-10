import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

import { PlanVsActualChart } from "../PlanVsActualChart";

vi.mock("react-native", () => ({
  Pressable: (props: any) =>
    React.createElement("Pressable", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@/components/ui/text", () => ({
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

vi.mock("@shopify/react-native-skia", () => ({
  DashPathEffect: (props: any) => React.createElement("DashPathEffect", props),
  useFont: () => ({}),
  Line: (props: any) => React.createElement("SkiaLine", props),
  vec: (x: number, y: number) => ({ x, y }),
}));

vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
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
  it("renders projection as area, planned as line and scatter, and actual as scatter only", () => {
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

    // 1 Line for planned
    expect(lines.length).toBe(1);
    // 1 Scatter for actual
    expect(scatters.length).toBe(1);
    // 1 Area for projection
    expect(areas.length).toBe(1);
  });
});
