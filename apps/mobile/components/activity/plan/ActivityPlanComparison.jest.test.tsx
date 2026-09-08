import { createActivityPlanStructure } from "../../../test/activity-plan-projection-fixture";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { createObservationQuantificationBundleFixture } from "../../shared/__tests__/activityQuantificationFixture";
import { ActivityPlanComparison } from "./ActivityPlanComparison";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardHeader: createHost("CardHeader"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CheckCircle: createHost("CheckCircle"),
  XCircle: createHost("XCircle"),
}));
jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

describe("ActivityPlanComparison", () => {
  it("uses canonical Common Load and objective intensity", async () => {
    const rendered = await renderNative(
      <ActivityPlanComparison
        activityPlan={{
          id: "plan-1",
          name: "Threshold Builder",
          structure: createActivityPlanStructure(),
          metrics: [
            {
              key: "elapsed_duration",
              label: "Duration",
              value: 300,
              unit: "seconds",
              status: "available",
              reason: null,
              provenance: "authored",
            },
            {
              key: "common_load",
              label: "Common Load",
              value: 64,
              unit: "score",
              status: "available",
              reason: null,
              provenance: "estimated",
            },
            {
              key: "objective_intensity",
              label: "Intensity",
              value: 0.8,
              unit: "ratio",
              status: "available",
              reason: null,
              provenance: "estimated",
            },
          ],
        }}
        actualMetrics={{
          duration: 3600,
          observationQuantification: createObservationQuantificationBundleFixture({
            estimated: false,
          }),
        }}
      />,
    );

    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Plan: 5m")).toBeTruthy();
    expect(screen.getByText("Plan: ~64")).toBeTruthy();
    expect(screen.getByText("Actual normalized intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(screen.getByText("Plan objective intensity: ~0.80")).toBeTruthy();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/TSS|\bIF\b|intensityFactor/);
    expect(JSON.stringify(rendered.toJSON())).toContain("Plan comparison");
    expect(screen.queryByText(/adherence/)).toBeNull();
  });

  it("renders unavailable planned objective intensity as an em dash", async () => {
    await renderNative(
      <ActivityPlanComparison
        activityPlan={{
          id: "plan-1",
          name: "Active Recovery Ride",
          structure: createActivityPlanStructure(),
          metrics: [
            {
              key: "common_load",
              label: "Common Load",
              value: null,
              unit: "load",
              status: "unavailable",
              reason: "incomplete_members",
              provenance: null,
            },
            {
              key: "objective_intensity",
              label: "Intensity",
              value: null,
              unit: "ratio",
              status: "unavailable",
              reason: "incomplete_objective_coverage",
              provenance: null,
            },
          ],
        }}
        actualMetrics={{
          duration: 2_700,
          observationQuantification: createObservationQuantificationBundleFixture({
            estimated: false,
          }),
        }}
      />,
    );

    expect(screen.queryByText("Plan: ~12")).toBeNull();
    expect(screen.getByText("Plan objective intensity: —")).toBeTruthy();
  });
});
