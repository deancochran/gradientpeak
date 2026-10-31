import type { SemanticMetric } from "@repo/core";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityPlanSummary } from "../ActivityPlanSummary";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

function objective(overrides: Record<string, unknown> = {}): SemanticMetric {
  return {
    key: "objective_intensity",
    label: "Intensity",
    status: "available",
    value: 2_439 / 3_500,
    unit: "ratio",
    reason: null,
    provenance: "estimated",
    ...overrides,
  } as SemanticMetric;
}

describe("ActivityPlanSummary", () => {
  it("renders the canonical four labels exactly once", async () => {
    await renderNative(
      <ActivityPlanSummary projectionMetrics={[]} showAttribution={false} title="Metric plan" />,
    );

    expect(screen.getAllByText("Distance")).toHaveLength(1);
    expect(screen.getAllByText("Duration")).toHaveLength(1);
    expect(screen.getAllByText("Load")).toHaveLength(1);
    expect(screen.getAllByText("Intensity")).toHaveLength(1);
  });

  it("keeps Option 1 partial duration, load, and normalized intensity unavailable", async () => {
    await renderNative(
      <ActivityPlanSummary
        projectionMetrics={[
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "partial",
            value: 180,
            unit: "seconds",
            reason: "incomplete_members",
          },
          {
            key: "common_load",
            label: "Load",
            status: "partial",
            value: 1.5,
            unit: "score",
            reason: "incomplete_members",
          },
          {
            key: "normalized_intensity",
            label: "Normalized intensity",
            status: "partial",
            value: 0.55,
            unit: "ratio",
            reason: "incomplete_members",
          },
          objective({
            status: "unavailable",
            value: null,
            reason: "incomplete_objective_coverage",
            provenance: null,
          }),
        ]}
        showAttribution={false}
        title="Option 1"
      />,
    );

    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0.70")).toBeNull();
    expect(screen.queryByText("3m")).toBeNull();
    expect(screen.queryByText("1.5")).toBeNull();
    expect(screen.queryByText("0.55")).toBeNull();
  });

  it("marks the complete calculated objective intensity ratio", async () => {
    await renderNative(
      <ActivityPlanSummary
        projectionMetrics={[objective()]}
        showAttribution={false}
        title="Personalized Core and Stability"
      />,
    );
    expect(screen.getByText("~0.70")).toBeTruthy();
  });

  it("renders complete authored values without an estimate marker", async () => {
    await renderNative(
      <ActivityPlanSummary
        projectionMetrics={[
          {
            key: "elapsed_duration",
            label: "Duration",
            status: "available",
            value: 3_600,
            unit: "seconds",
            reason: null,
            provenance: "authored",
          },
        ]}
        showAttribution={false}
        title="Exact plan"
      />,
    );
    expect(screen.getByText("1h")).toBeTruthy();
    expect(screen.queryByText("~1h")).toBeNull();
  });

  it("does not use normalized intensity as the plan-card intensity", async () => {
    await renderNative(
      <ActivityPlanSummary
        projectionMetrics={[
          {
            key: "normalized_intensity",
            label: "Normalized intensity",
            status: "available",
            value: 0.82,
            unit: "ratio",
            reason: null,
            provenance: "personalized",
          },
        ]}
        showAttribution={false}
        title="Easy Swim"
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.82")).toBeNull();
  });

  it("does not use RPE-labelled metrics as the plan-card intensity", async () => {
    await renderNative(
      <ActivityPlanSummary
        projectionMetrics={[
          {
            key: "average_power",
            label: "RPE",
            status: "available",
            value: 7,
            unit: "rpe_0_10",
            reason: null,
          },
        ]}
        showAttribution={false}
        title="Range swim"
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText("7/10 RPE")).toBeNull();
  });
});
