import { simulateTrainingPlan } from "@repo/core";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { BuilderPublishedProjectionCard } from "../BuilderPublishedProjectionCard";

const baseline = {
  contractVersion: "athlete-state-projection-v1" as const,
  athleteId: "athlete-1",
  stateRevision: 4,
  asOf: "2026-08-01T00:00:00.000Z",
  longTermLoad: 40,
  recentLoad: 30,
  loadBalance: 10,
  evidenceConfidence: 0.8,
  capabilities: [],
  athleteAgeYears: 35,
};

describe("BuilderPublishedProjectionCard", () => {
  it("announces loading and retryable error states", () => {
    const onRetry = jest.fn();
    const view = render(
      <BuilderPublishedProjectionCard onRetry={onRetry} projection={{ status: "loading" }} />,
    );
    expect(screen.getByLabelText("Loading athlete baseline projection")).toBeTruthy();

    view.rerender(
      <BuilderPublishedProjectionCard onRetry={onRetry} projection={{ status: "error" }} />,
    );
    expect(screen.getByText("Projection could not be loaded.")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Retry athlete baseline projection"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders stale projected metrics and explicit unavailable readiness", () => {
    const simulation = simulateTrainingPlan({
      baseline,
      plannedSessions: [
        {
          kind: "projected",
          sourceId: "plan:sessions.0",
          scheduledAt: "2026-08-02T00:00:00.000Z",
          activityCategory: "run",
          commonLoad: 80,
        },
      ],
      simulationAt: "2026-08-02T00:00:00.000Z",
      planningTimezone: "UTC",
      goal: null,
    });

    render(
      <BuilderPublishedProjectionCard
        onRetry={jest.fn()}
        projection={{ status: "stale", importStatus: "active", simulation }}
      />,
    );

    expect(screen.getByText(/while activity history imports/)).toBeTruthy();
    expect(screen.getByLabelText(/Fitness:/)).toBeTruthy();
    expect(screen.getByLabelText(/Fatigue:/)).toBeTruthy();
    expect(screen.getByLabelText(/Form:/)).toBeTruthy();
    expect(screen.getByLabelText("Readiness: Unavailable")).toBeTruthy();
  });
});
