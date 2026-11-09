import {
  type AthletePerformanceOverview,
  projectAthletePerformanceOverview,
} from "@repo/core/performance-model";
import {
  buildPerformanceOverviewFixture,
  buildPerformanceTargetFactsFixture,
} from "@repo/core/testing/performance-model";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";
import { PerformanceModelSummary } from "./PerformanceModelSummary";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

function overviewFixture(): AthletePerformanceOverview {
  return buildPerformanceOverviewFixture();
}

describe("PerformanceModelSummary", () => {
  it("renders the shared canonical summary through native accessibility", async () => {
    await renderNative(<PerformanceModelSummary overview={overviewFixture()} />);

    expect(
      screen.getByLabelText(
        "Bike Threshold Power: 250 W, Available. Confidence: High. Freshness: Current. Training impact: Sets cycling power zones and cycling power targets.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Run Threshold Pace: 4:10 min/km, Available. Confidence: High. Freshness: Current. Training impact: Sets running pace targets.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Swim Threshold Pace: 1:20 min/100m, Available. Confidence: High. Freshness: Current. Training impact: Sets swimming pace targets.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/canonical|as-of|protocol|progressive|max-HR/i)).toBeNull();
  });

  it("preserves the canonical stale guidance from the shared projection", async () => {
    const overview = projectAthletePerformanceOverview(
      buildPerformanceTargetFactsFixture({
        asOf: "2026-07-31T12:00:00.000Z",
        thresholdEffectiveAt: "2025-01-01T12:00:00.000Z",
        runThresholdMetersPerSecond: 4,
      }),
    );

    await renderNative(<PerformanceModelSummary overview={overview} />);

    expect(
      screen.getByLabelText(
        "Run Threshold Pace: 4:10 min/km, Available. Confidence: High. Freshness: Out of date. Training impact: Sets running pace targets. Record more recent activity data.",
      ),
    ).toBeTruthy();
  });
});
