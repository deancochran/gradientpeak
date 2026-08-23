import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: mockCreateHost("Button"),
}));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

const GoalIntelligenceCard = require("../GoalIntelligenceCard").GoalIntelligenceCard;

function intelligence() {
  return {
    stateRevision: 4,
    computedAt: "2026-07-15T12:00:00.000Z",
    freshness: "stale",
    assessmentConfidence: 0.42,
    rebuildStatus: "pending",
    assessment: {
      goalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assessedAt: "2026-07-15T12:00:00.000Z",
      readiness: 48,
      status: "watch",
      fitnessScore: 56,
      fatiguePenalty: 12,
      specificityScore: 45,
      assessmentConfidence: 0.42,
      reasonCodes: ["fitness_below_goal_demand", "assessment_evidence_low_confidence"],
    },
  };
}

describe("GoalIntelligenceCard", () => {
  it("renders readiness and reasons without internal assessment detail", async () => {
    await renderNative(<GoalIntelligenceCard assessment={intelligence()} />);

    expect(screen.getByText("Goal readiness")).toBeTruthy();
    expect(screen.getByText("watch · readiness 48")).toBeTruthy();
    expect(screen.getByText("fitness below goal demand")).toBeTruthy();
    expect(screen.queryByText("stale state · 42% confidence")).toBeNull();
    expect(screen.queryByText("Fitness 56 · specificity 45")).toBeNull();
  });

  it("does not render forbidden action language", async () => {
    await renderNative(<GoalIntelligenceCard assessment={intelligence()} />);

    expect(
      screen.queryByText(/recommend|training|schedule|prediction|forecast|medical|risk/i),
    ).toBeNull();
  });

  it("keeps cached assessment visible and offers retry when the latest request fails", async () => {
    const onRetry = jest.fn();
    await renderNative(
      <GoalIntelligenceCard assessment={intelligence()} isError onRetry={onRetry} />,
    );

    expect(screen.getByText(/displayed assessment may be stale/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId("goal-intelligence-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
