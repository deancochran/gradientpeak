import type { SemanticMetric } from "@repo/core";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";
import { ActivityPlanEstimatePresentation } from "./ActivityPlanEstimatePresentation";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

const metrics: SemanticMetric[] = [
  {
    key: "elapsed_duration",
    label: "Duration",
    status: "available",
    value: 0,
    unit: "seconds",
    provenance: "authored",
    reason: null,
  },
  {
    key: "common_load",
    label: "Load",
    status: "unavailable",
    value: null,
    unit: "score",
    provenance: null,
    reason: "open_completion",
  },
];

describe("ActivityPlanEstimatePresentation", () => {
  it("shows only available inline estimates, retaining a true zero", async () => {
    await renderNative(<ActivityPlanEstimatePresentation metrics={metrics} />);

    expect(screen.getByLabelText("Plan estimates: Duration 0s")).toBeTruthy();
    expect(screen.getByText("Duration 0s")).toBeTruthy();
    expect(screen.queryByText("Load")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("Steps")).toBeNull();
  });

  it("renders nothing when every estimate is unavailable", async () => {
    await renderNative(
      <ActivityPlanEstimatePresentation
        metrics={metrics.filter((metric) => metric.status === "unavailable")}
      />,
    );

    expect(screen.queryByLabelText(/Plan estimates/)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });
});
