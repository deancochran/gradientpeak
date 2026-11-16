// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachAthleteCompletedActivities } from "./coach-athlete-completed-activities";

describe("CoachAthleteCompletedActivities", () => {
  afterEach(cleanup);
  it("distinguishes a loading failure from denied consent and offers retry", () => {
    const retry = vi.fn();
    render(<CoachAthleteCompletedActivities result={{ status: "error" }} onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toContain("loading error");
    expect(screen.queryByText("Completed activities unavailable")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry completed activities" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("keeps a linked completion read-only without rendering private activity content", () => {
    render(
      <CoachAthleteCompletedActivities
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: "11111111-1111-4111-8111-111111111111",
              distanceMeters: 5000,
              elapsedMs: 1_800_000,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Completed session")).toBeTruthy();
    expect(screen.getByText(/planned 2026-11-10/i)).toBeTruthy();
    expect(screen.getByText(/does not mark anything reviewed/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /review/i })).toBeNull();
  });

  it("does not render activity content when either consent scope is denied", () => {
    render(<CoachAthleteCompletedActivities result={{ status: "forbidden" }} />);
    expect(screen.getByText("Completed activities unavailable")).toBeTruthy();
    expect(screen.queryByText("Completed session")).toBeNull();
  });
});
