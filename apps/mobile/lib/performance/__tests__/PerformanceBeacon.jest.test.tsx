import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { PerformanceBeacon } from "../PerformanceBeacon";

const mockMetrics = [
  { durationMs: 12, id: "route-home", measuredAt: 1 },
  { durationMs: 34, id: "route-plan", measuredAt: 2 },
];

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));

jest.mock("../performance-monitor", () => ({
  getPerformanceMetricsSnapshot: () => mockMetrics,
  isPerformanceTestingEnabled: () => true,
  subscribeToPerformanceMetrics: () => () => undefined,
}));

describe("PerformanceBeacon", () => {
  it("keeps every metric inside the one-pixel accessibility beacon", async () => {
    await renderNative(<PerformanceBeacon />);

    expect(screen.getByTestId("perf-metric-route-home").props.style).toMatchObject({
      bottom: 0,
      height: 1,
      position: "absolute",
      width: 1,
    });
    expect(screen.getByTestId("perf-metric-route-plan").props.style).toMatchObject({
      bottom: 0,
      height: 1,
      position: "absolute",
      width: 1,
    });
  });
});
