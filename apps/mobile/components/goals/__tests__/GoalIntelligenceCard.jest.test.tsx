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

const available = {
  state: "estimated",
  uncertainty: 0.2,
  contributingSourceIds: ["activity:one"],
  reasonCodes: ["source_data_available", "recent_history_missing"],
};
const unavailable = {
  state: "unsupported",
  uncertainty: 1,
  contributingSourceIds: [],
  reasonCodes: ["timezone_missing_or_unsupported", "required_training_minutes_missing"],
};

function intelligence() {
  return {
    goalCoverage: [
      {
        dimensions: [
          {
            dimension: "duration",
            requirement: available,
            capability: available,
            coverage: available,
            physicalGap: unavailable,
          },
          {
            dimension: "speed",
            requirement: unavailable,
            capability: unavailable,
            coverage: unavailable,
            physicalGap: unavailable,
          },
        ],
      },
    ],
    capability: { sportSpecificity: available },
    readiness: {
      volumeTrend: {
        state: "insufficient_evidence",
        uncertainty: 1,
        contributingSourceIds: [],
        reasonCodes: ["recent_history_missing"],
      },
    },
    feasibility: { scheduleCoverage: unavailable },
    opportunities: {
      evidence: [
        {
          dimension: "duration",
          reasonCodes: ["required_training_minutes_missing", "recent_history_missing"],
        },
      ],
    },
    decisionGuidance: {
      state: "adjust",
      recommendedActions: ["Add calendar availability."],
      reasonCodes: ["required_training_minutes_missing"],
    },
  };
}

describe("GoalIntelligenceCard", () => {
  it("explains unavailable calendar context without a timezone", () => {
    renderNative(
      <GoalIntelligenceCard
        deviceTimezone={null}
        onUseDeviceTimezone={jest.fn()}
        planningTimezone={null}
      />,
    );

    expect(screen.getByText(/Calendar context is unavailable/)).toBeTruthy();
    expect(screen.queryByText("Use device timezone")).toBeNull();
  });

  it("renders canonical guidance without legacy prediction content", () => {
    renderNative(
      <GoalIntelligenceCard
        deviceTimezone="America/Los_Angeles"
        intelligence={intelligence()}
        onUseDeviceTimezone={jest.fn()}
        planningTimezone="America/Los_Angeles"
      />,
    );

    expect(screen.getByText("Adjust your plan before pushing ahead")).toBeTruthy();
    expect(screen.getByText("Add calendar availability.")).toBeTruthy();
    expect(screen.getByText("What this goal asks of you")).toBeTruthy();
    expect(screen.getByText("duration requirement")).toBeTruthy();
    expect(screen.getByText("duration coverage")).toBeTruthy();
    expect(screen.getByText("speed requirement")).toBeTruthy();
    expect(screen.getByText("Why this guidance")).toBeTruthy();
    expect(screen.getByText("Sport-specific capability")).toBeTruthy();
    expect(screen.getByText("Recent training readiness")).toBeTruthy();
    expect(screen.getByText("Calendar fit")).toBeTruthy();
    expect(screen.getByText("Improve this guidance")).toBeTruthy();
    expect(screen.getAllByText(/Reason: required training minutes missing/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Reason: source data available/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reason: recent history missing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Reason: timezone missing or unsupported/).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/Evidence uncertainty: 20% · 1 source/).length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/score|percent|forecast|prediction|likelihood|medical|risk/i),
    ).toBeNull();
  });

  it("keeps cached guidance visible and offers retry when the latest request fails", () => {
    const onRetry = jest.fn();
    renderNative(
      <GoalIntelligenceCard
        deviceTimezone="America/Los_Angeles"
        intelligence={intelligence()}
        isError
        onRetry={onRetry}
        onUseDeviceTimezone={jest.fn()}
        planningTimezone="America/Los_Angeles"
      />,
    );

    expect(screen.getByText("Adjust your plan before pushing ahead")).toBeTruthy();
    expect(screen.getByText(/Goal guidance may be stale/)).toBeTruthy();

    fireEvent.press(screen.getByTestId("goal-intelligence-retry"));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
