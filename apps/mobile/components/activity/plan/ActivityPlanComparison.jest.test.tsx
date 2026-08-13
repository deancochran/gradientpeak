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
  it("uses canonical Common Load and normalized intensity", () => {
    const rendered = renderNative(
      <ActivityPlanComparison
        activityPlan={{
          id: "plan-1",
          name: "Threshold Builder",
          structure: createActivityPlanStructure(),
          metrics: [
            {
              key: "common_load",
              label: "Common Load",
              value: 64,
              unit: "load",
              status: "available",
              reason: null,
            },
            {
              key: "normalized_intensity",
              label: "Normalized intensity",
              value: 0.8,
              unit: "ratio",
              status: "available",
              reason: null,
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
    expect(screen.getByText("Plan: ~64")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getByText("0.80")).toBeTruthy();
    expect(screen.getByText("Plan: ~0.80")).toBeTruthy();
    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/TSS|\bIF\b|intensityFactor/);
    expect(JSON.stringify(rendered.toJSON())).toContain("Plan comparison");
    expect(screen.queryByText(/adherence/)).toBeNull();
  });
});
