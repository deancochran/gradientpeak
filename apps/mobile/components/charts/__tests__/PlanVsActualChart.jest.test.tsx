import React from "react";

import { renderNative, screen } from "../../../test/render-native";

import { PlanVsActualChart } from "../PlanVsActualChart";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: (props: any) => React.createElement("Pressable", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  DashPathEffect: (props: any) => React.createElement("DashPathEffect", props),
  useFont: () => ({ getTextWidth: () => 24 }),
  Line: (props: any) => React.createElement("SkiaLine", props),
  Text: (props: any) => React.createElement("SkiaText", props),
  vec: (x: number, y: number) => ({ x, y }),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
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

jest.mock("@/assets/fonts/SpaceMono-Regular.ttf", () => ({
  __esModule: true,
  default: "mock-font",
}));

describe("PlanVsActualChart", () => {
  it("renders the core series for a weekly timeline", () => {
    renderNative(
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

    const lines = (screen as any).UNSAFE_getAllByType("Line");
    const areas = (screen as any).UNSAFE_getAllByType("Area");
    const scatters = (screen as any).queryAllByType?.("Scatter") ?? [];

    expect(lines.length).toBe(2);
    expect(scatters.length).toBe(0);
    expect(areas.length).toBe(2);
  });

  it("renders multiple goal markers instead of only the first goal", () => {
    renderNative(
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

    const goalLines = (screen as any)
      .UNSAFE_getAllByType("SkiaLine")
      .filter((node: any) => node.props.color === "rgba(34, 197, 94, 0.6)");

    expect(goalLines).toHaveLength(2);
  });
});
