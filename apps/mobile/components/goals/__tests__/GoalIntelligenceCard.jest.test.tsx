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
    explainability: {
      assessment: {
        at: "2026-07-15T12:00:00.000Z",
        state: "insufficient_evidence",
        uncertainty: "high",
      },
      evidence: [
        {
          label: "Activity record",
          type: "activity",
          observedAt: "2026-07-14T12:00:00.000Z",
        },
      ],
      limits: [
        {
          id: "limit-1",
          label: "Some activity history could not be read",
          state: "insufficient_evidence",
          reasons: ["Some activity history could not be read"],
        },
        {
          id: "limit-2",
          label: "Some activity history could not be read",
          state: "insufficient_evidence",
          reasons: ["Some activity history could not be read"],
        },
      ],
      coverage: [
        { label: "Recorded activities", state: "complete" },
        { label: "Availability data", state: "truncated" },
      ],
      collectionPrompts: [
        { label: "Add a profile metric", destination: "profile_metrics" },
        { label: "Import activities", destination: "activity_import" },
      ],
    },
  };
}

describe("GoalIntelligenceCard", () => {
  it("renders assessment state, curated evidence, duplicate limits, and explicit coverage", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    renderNative(
      <GoalIntelligenceCard intelligence={intelligence()} onCollectionPrompt={jest.fn()} />,
    );

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("same key"));
    consoleError.mockRestore();
    expect(screen.getByText("Evidence & limits")).toBeTruthy();
    expect(screen.getByText("Assessed: 2026-07-15T12:00:00.000Z")).toBeTruthy();
    expect(screen.getByText("Result state: insufficient evidence")).toBeTruthy();
    expect(screen.getByText("Decision uncertainty: high")).toBeTruthy();
    expect(screen.getByText(/Activity record · activity · 2026-07-14/)).toBeTruthy();
    expect(
      screen.getAllByText(/Some activity history could not be read · insufficient evidence/),
    ).toHaveLength(2);
    expect(screen.getByText("Recorded activities: complete")).toBeTruthy();
    expect(screen.getByText("Availability data: truncated")).toBeTruthy();
  });

  it("uses only collection prompts with existing destination callbacks", () => {
    const onCollectionPrompt = jest.fn();
    renderNative(
      <GoalIntelligenceCard
        intelligence={intelligence()}
        onCollectionPrompt={onCollectionPrompt}
      />,
    );

    fireEvent.press(screen.getByTestId("goal-intelligence-collect-profile_metrics"));
    fireEvent.press(screen.getByTestId("goal-intelligence-collect-activity_import"));

    expect(onCollectionPrompt).toHaveBeenNthCalledWith(1, "profile_metrics");
    expect(onCollectionPrompt).toHaveBeenNthCalledWith(2, "activity_import");
  });

  it("does not render forbidden action language", () => {
    renderNative(
      <GoalIntelligenceCard intelligence={intelligence()} onCollectionPrompt={jest.fn()} />,
    );

    expect(
      screen.queryByText(/recommend|training|schedule|prediction|forecast|medical|risk/i),
    ).toBeNull();
  });

  it("keeps cached assessment visible and offers retry when the latest request fails", () => {
    const onRetry = jest.fn();
    renderNative(
      <GoalIntelligenceCard
        intelligence={intelligence()}
        isError
        onCollectionPrompt={jest.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText(/displayed assessment may be stale/)).toBeTruthy();
    fireEvent.press(screen.getByTestId("goal-intelligence-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
