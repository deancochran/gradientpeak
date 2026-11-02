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
  it("uses the canonical four-metric row, retaining true zero and unavailable values", async () => {
    await renderNative(<ActivityPlanEstimatePresentation metrics={metrics} />);

    expect(screen.getByTestId("activity-plan-estimates")).toBeTruthy();
    expect(screen.getAllByText("Distance")).toHaveLength(1);
    expect(screen.getAllByText("Duration")).toHaveLength(1);
    expect(screen.getAllByText("Load")).toHaveLength(1);
    expect(screen.getAllByText("Intensity")).toHaveLength(1);
    expect(screen.getByText("0s")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("Steps")).toBeNull();
  });

  it("does not render a second metric row for estimate details", async () => {
    await renderNative(<ActivityPlanEstimatePresentation metrics={metrics} />);

    expect(screen.queryByLabelText("Estimated details")).toBeNull();
    expect(screen.queryByTestId("activity-plan-estimate-details")).toBeNull();
  });
});
