import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityPlanSummary } from "../ActivityPlanSummary";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const commonLoadProvenance = {
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  sport: "run" as const,
  method: "run_pace_threshold" as const,
  quality: {
    source: "validated_test" as const,
    observed_at: "2026-07-20T12:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "threshold-v1",
    evidence_fingerprint: "quality-run",
  },
  thresholdEvidence: {
    type: "threshold_speed_mps" as const,
    value: 4,
    unit: "meters_per_second" as const,
    source: "validated_test" as const,
    observedAt: "2026-07-20T12:00:00.000Z",
    validAt: "2026-07-20T12:00:00.000Z",
    freshness: "current" as const,
    calculationVersion: "threshold-v1",
    sourceFingerprint: "threshold-run",
  },
  evidenceFingerprint: "activity-run",
  computedAsOf: "2026-07-21T12:00:00.000Z",
};

describe("ActivityPlanSummary", () => {
  it("labels expanded activity steps as plan volume", () => {
    renderNative(
      <ActivityPlanSummary
        estimatedDuration={900}
        showAttribution={false}
        structure={{
          version: 3,
          segments: [
            {
              id: id(4),
              role: "rest",
              name: "Prepare",
              duration: { type: "time", seconds: 60 },
            },
            {
              id: id(1),
              role: "activity",
              category: "run",
              name: "Run",
              intervals: [
                {
                  id: id(2),
                  name: "Work",
                  repetitions: 2,
                  steps: [
                    {
                      id: id(3),
                      name: "Tempo",
                      duration: { type: "time", seconds: 450 },
                      targets: [{ type: "RPE", intensity: 6 }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        title="Tempo repeats"
      />,
    );

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("ignores compatibility TSS and IF when common Load is unavailable", () => {
    renderNative(
      <ActivityPlanSummary
        activityCategory="run"
        estimatedTss={100}
        intensityFactor={0.9}
        showAttribution={false}
        structure={null}
        title="Brick session"
      />,
    );

    expect(screen.queryByText("TSS")).toBeNull();
    expect(screen.queryByText("Intensity")).toBeNull();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows available common Load and qualitative Intensity", () => {
    renderNative(
      <ActivityPlanSummary
        commonLoad={{
          status: "available",
          ...commonLoadProvenance,
          load: 64,
          intensity: 0.8,
          contributingDurationSeconds: 3600,
          estimated: false,
        }}
        showAttribution={false}
        title="Tempo run"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("64")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getByText("Tempo · 0.80")).toBeTruthy();
    expect(screen.queryByText(/TSS|IF/)).toBeNull();
  });

  it("marks partial common Load incomplete", () => {
    renderNative(
      <ActivityPlanSummary
        commonLoad={{
          status: "partial",
          ...commonLoadProvenance,
          load: 32,
          intensity: 0.8,
          contributingDurationSeconds: 1800,
          eligibleDurationSeconds: 3600,
          sourceTimeCoverage: 0.5,
          reason: "activity_data_partial",
        }}
        showAttribution={false}
        title="Partial tempo run"
      />,
    );

    expect(screen.getByText("32 · Incomplete")).toBeTruthy();
    expect(screen.getByText("Tempo · 0.80 · Incomplete")).toBeTruthy();
  });

  it("shows private planned Load without falling back to compatibility metrics", () => {
    renderNative(
      <ActivityPlanSummary
        commonLoad={{
          status: "unavailable",
          model: "gradientpeak_relative_load",
          version: "1",
          sport: "other",
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          computedAsOf: "2026-07-21T12:00:00.000Z",
          contributingDurationSeconds: null,
          reason: "private_data",
        }}
        estimatedTss={100}
        intensityFactor={0.9}
        showAttribution={false}
        title="Private plan"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(screen.queryByText(/TSS|IF/)).toBeNull();
  });

  it("shows an incomplete state when partial common Load has no numeric values", () => {
    const {
      method: _method,
      quality: _quality,
      thresholdEvidence: _thresholdEvidence,
      evidenceFingerprint: _evidenceFingerprint,
      ...provenanceWithoutEvidence
    } = commonLoadProvenance;

    renderNative(
      <ActivityPlanSummary
        commonLoad={{
          status: "partial",
          ...provenanceWithoutEvidence,
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          load: null,
          intensity: null,
          contributingDurationSeconds: 0,
          eligibleDurationSeconds: 3600,
          sourceTimeCoverage: 0,
          reason: "insufficient_coverage",
        }}
        showAttribution={false}
        title="Incomplete run"
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Incomplete")).toBeTruthy();
    expect(screen.queryByText("Intensity")).toBeNull();
  });
});
