import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
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
jest.mock("@/components/activity-plan/workout/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

function commonLoad(load: number, intensity: number, estimated: boolean) {
  return {
    status: "available" as const,
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    sport: "bike" as const,
    method: "power_threshold" as const,
    load,
    intensity,
    contributingDurationSeconds: 3600,
    estimated,
    quality: {
      source: "validated_test" as const,
      observed_at: "2026-07-01T00:00:00.000Z",
      valid_at: "2026-07-01T00:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: false,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-fingerprint",
    },
    thresholdEvidence: {
      type: "ftp_watts" as const,
      value: 300,
      unit: "watts" as const,
      source: "validated_test" as const,
      observedAt: "2026-07-01T00:00:00.000Z",
      validAt: "2026-07-01T00:00:00.000Z",
      freshness: "current" as const,
      calculationVersion: "threshold-v1",
      sourceFingerprint: "threshold-fingerprint",
    },
    sessionRpeEvidence: null,
    evidenceFingerprint: "activity-fingerprint",
    computedAsOf: "2026-07-02T00:00:00.000Z",
  };
}

describe("ActivityPlanComparison", () => {
  it("uses canonical Load and Intensity instead of legacy TSS and IF", () => {
    renderNative(
      <ActivityPlanComparison
        activityPlan={{
          id: "plan-1",
          name: "Threshold Builder",
          structure: { version: 3, segments: [] },
          common_load: commonLoad(72.25, 0.85, true),
        }}
        actualMetrics={{ duration: 3600, common_load: commonLoad(81, 0.9, false) }}
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("81")).toBeTruthy();
    expect(screen.getByText("Plan: ~72")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("Threshold · 0.90")).toBeTruthy();
    expect(screen.getByText("Plan: ~Threshold · 0.85")).toBeTruthy();
    expect(screen.queryByText("TSS")).toBeNull();
    expect(screen.queryByText("IF")).toBeNull();
  });
});
