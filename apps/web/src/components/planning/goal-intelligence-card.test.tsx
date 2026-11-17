// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GoalIntelligenceCard } from "./goal-intelligence-card";

afterEach(() => cleanup());

describe("GoalIntelligenceCard", () => {
  it("offers an observable retry when intelligence loading fails", () => {
    const onRetry = vi.fn();

    render(<GoalIntelligenceCard isError isLoading={false} onRetry={onRetry} />);

    expect(screen.getByTestId("goal-intelligence")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/could not be refreshed/i);
    fireEvent.click(screen.getByTestId("goal-intelligence-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps stale readiness visible with confidence and reasons", () => {
    render(
      <GoalIntelligenceCard
        assessment={{
          stateRevision: 4,
          computedAt: "2026-07-10T12:00:00.000Z",
          freshness: "stale",
          assessmentConfidence: 0.42,
          rebuildStatus: "pending",
          assessment: {
            goalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            assessedAt: "2026-07-10T12:00:00.000Z",
            readiness: 48,
            status: "watch",
            fitnessScore: 56,
            fatiguePenalty: 12,
            specificityScore: 45,
            assessmentConfidence: 0.42,
            reasonCodes: ["fitness_below_goal_demand", "assessment_evidence_low_confidence"],
          },
        }}
        isError
        isLoading={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(/as of 2026-07-10/i)).toBeTruthy();
    expect(screen.getByText(/stale state/i)).toBeTruthy();
    expect(screen.getByText(/42% confidence/i)).toBeTruthy();
    expect(screen.getByText(/fitness below goal demand/i)).toBeTruthy();
  });
});
