// biome-ignore-all lint/suspicious/noExplicitAny: Test-only host mocks accept arbitrary native props.
import React from "react";

import { renderNative, screen } from "../../../test/render-native";

import { ElevationProfileChart } from "./ElevationProfileChart";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: (props: any) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/chart", () => ({
  __esModule: true,
  ChartCard: (props: any) => React.createElement("ChartCard", props, props.children),
  ChartEmptyState: (props: any) => React.createElement("ChartEmptyState", props),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  LinearGradient: (props: any) => React.createElement("LinearGradient", props),
  useFont: () => ({}),
  vec: (x: number, y: number) => ({ x, y }),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
  Area: (props: any) => React.createElement("Area", props, props.children),
  CartesianChart: ({ children, ...props }: any) =>
    React.createElement(
      "CartesianChart",
      props,
      children({
        points: { elevation: props.data },
        chartBounds: { bottom: 100, top: 0 },
      }),
    ),
  useChartPressState: () => ({
    isActive: true,
    state: {
      x: { value: { value: 1 } },
      y: { elevation: { value: { value: 150 } } },
    },
  }),
  useChartTransformState: () => ({ state: {} }),
}));

jest.mock("@/components/charts/InteractiveChartValueTray", () => ({
  __esModule: true,
  InteractiveChartValueTray: (props: any) =>
    React.createElement("InteractiveChartValueTray", props),
}));

jest.mock("@/assets/fonts/SpaceMono-Regular.ttf", () => ({
  __esModule: true,
  default: "mock-font",
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const elevationStream = {
  timestamps: [0, 1_000, 2_000],
  values: [100, 200, 150],
} as any;

const distanceStream = {
  timestamps: [0, 1_000, 2_000],
  values: [0, 1_000, 2_000],
} as any;

describe("ElevationProfileChart", () => {
  it("defaults to metric labels without converting the plotted elevation data", () => {
    renderNative(
      <ElevationProfileChart elevationStream={elevationStream} distanceStream={distanceStream} />,
    );

    const chart = (screen as any).UNSAFE_getByType("CartesianChart");
    const card = (screen as any).UNSAFE_getByType("ChartCard");

    expect(chart.props.data).toEqual([
      { elevation: 100, x: 0 },
      { elevation: 200, x: 1 },
      { elevation: 150, x: 2 },
    ]);
    expect(chart.props.axisOptions.formatYLabel(100)).toBe("100 m");
    expect(chart.props.axisOptions.formatXLabel(1)).toBe("1.0 km");
    expect(card.props.summary).toEqual([
      { label: "Ascent", value: "100 m ↗" },
      { label: "Descent", value: "50 m ↘" },
      { label: "Range", value: "100 m - 200 m" },
    ]);
  });

  it("uses Core conversions for imperial labels, accessibility text, and active tray values", () => {
    renderNative(
      <ElevationProfileChart
        elevationStream={elevationStream}
        distanceStream={distanceStream}
        preferredUnitSystem="imperial"
      />,
    );

    const chart = (screen as any).UNSAFE_getByType("CartesianChart");
    const card = (screen as any).UNSAFE_getByType("ChartCard");
    const tray = (screen as any).UNSAFE_getByType("InteractiveChartValueTray");

    expect(chart.props.axisOptions.formatYLabel(100)).toBe("328 ft");
    expect(chart.props.axisOptions.formatXLabel(1)).toBe("0.6 mi");
    expect(card.props.summary).toEqual([
      { label: "Ascent", value: "328 ft ↗" },
      { label: "Descent", value: "164 ft ↘" },
      { label: "Range", value: "328 ft - 656 ft" },
    ]);
    expect(screen.getByLabelText(/Ascent 328 feet/)).toBeTruthy();
    expect(tray.props.items).toEqual([
      { key: "x", label: "Distance", value: "0.6 mi" },
      { key: "elevation", label: "Elevation", value: "492 ft", color: "#10b981" },
    ]);
  });
});
