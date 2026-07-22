import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { CalendarEventCard } from "../CalendarEventCard";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: mockCreateHost("CalendarDays"),
  Lock: mockCreateHost("Lock"),
  Play: mockCreateHost("Play"),
  Target: mockCreateHost("Target"),
  Zap: mockCreateHost("Zap"),
}));
jest.mock("@/lib/utils/plan/colors", () => ({
  __esModule: true,
  getActivityColor: () => ({ bg: "bg-primary", text: "text-primary" }),
}));
jest.mock("@/lib/utils/plan/dateGrouping", () => ({
  __esModule: true,
  isActivityCompleted: () => false,
}));

const provenance = {
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  sport: "run" as const,
  method: "run_pace_threshold" as const,
  quality: {
    source: "validated_test" as const,
    observed_at: "2026-03-22T12:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "threshold-v1",
    evidence_fingerprint: "card-quality",
  },
  thresholdEvidence: {
    type: "threshold_speed_mps" as const,
    value: 4,
    unit: "meters_per_second" as const,
    source: "validated_test" as const,
    observedAt: "2026-03-22T12:00:00.000Z",
    validAt: "2026-03-22T12:00:00.000Z",
    freshness: "current" as const,
    calculationVersion: "threshold-v1",
    sourceFingerprint: "card-threshold",
  },
  evidenceFingerprint: "card-activity",
  computedAsOf: "2026-03-23T12:00:00.000Z",
};

function renderCard(commonLoad: unknown) {
  return renderNative(
    <CalendarEventCard
      canStart
      event={
        {
          id: "event-load",
          event_type: "planned",
          title: "Tempo builder",
          activity_plan: {
            id: "plan-load",
            name: "Tempo builder",
            activity_category: "run",
            estimated_tss: 88,
            intensity_factor: 0.9,
            common_load: commonLoad,
          },
        } as never
      }
      onPress={jest.fn()}
    />,
  );
}

describe("CalendarEventCard common Load", () => {
  it("renders canonical Load and qualitative Intensity without TSS or IF", () => {
    renderCard({
      status: "available",
      ...provenance,
      load: 64,
      intensity: 0.8,
      contributingDurationSeconds: 3600,
      estimated: false,
    });

    expect(screen.getAllByText("Load 64").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intensity Tempo · 0.80").length).toBeGreaterThan(0);
    expect(screen.queryByText(/TSS|\bIF\b|88|0\.9/)).toBeNull();
  });

  it("marks partial canonical metrics incomplete", () => {
    renderCard({
      status: "partial",
      ...provenance,
      load: 32,
      intensity: 0.8,
      contributingDurationSeconds: 1800,
      eligibleDurationSeconds: 3600,
      sourceTimeCoverage: 0.5,
      reason: "activity_data_partial",
    });

    expect(screen.getAllByText("Load 32 · Incomplete").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intensity Tempo · 0.80 · Incomplete").length).toBeGreaterThan(0);
  });

  it("renders private canonical Load explicitly", () => {
    renderCard({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      sport: "run",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-03-23T12:00:00.000Z",
      contributingDurationSeconds: null,
      reason: "private_data",
    });

    expect(screen.getAllByText("Load Private").length).toBeGreaterThan(0);
  });

  it("omits unsupported and noncanonical load instead of falling back to legacy estimates", () => {
    const rendered = renderCard({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      sport: "other",
      method: null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf: "2026-03-23T12:00:00.000Z",
      contributingDurationSeconds: null,
      reason: "unsupported_modality",
    });

    expect(JSON.stringify(rendered.toJSON())).not.toMatch(/Load|Intensity|TSS|\bIF\b|88|0\.9/);
  });
});
