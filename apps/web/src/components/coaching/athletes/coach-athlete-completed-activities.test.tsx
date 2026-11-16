// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acknowledgeCoachAthleteCompletedActivity } from "../../../lib/coaching/athlete-completions-server-functions";
import { CoachAthleteCompletedActivities } from "./coach-athlete-completed-activities";

const props = {
  actorProfileId: "00000000-0000-4000-8000-000000000000",
  athleteProfileId: "11111111-1111-4111-8111-111111111111",
  organizationId: "22222222-2222-4222-8222-222222222222",
};

describe("CoachAthleteCompletedActivities", () => {
  const acknowledge = vi.mocked(acknowledgeCoachAthleteCompletedActivity);
  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
    acknowledge.mockReset();
  });
  it("distinguishes a loading failure from denied consent and offers retry", () => {
    const retry = vi.fn();
    render(
      <CoachAthleteCompletedActivities {...props} result={{ status: "error" }} onRetry={retry} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("loading error");
    expect(screen.queryByText("Completed activities unavailable")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry completed activities" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("keeps a linked completion read-only without rendering private activity content", () => {
    render(
      <CoachAthleteCompletedActivities
        {...props}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: "11111111-1111-4111-8111-111111111111",
              distanceMeters: 5000,
              evidenceVersion: "evidence-v1",
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
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeTruthy();
  });

  it("does not render activity content when either consent scope is denied", () => {
    render(<CoachAthleteCompletedActivities {...props} result={{ status: "forbidden" }} />);
    expect(screen.getByText("Completed activities unavailable")).toBeTruthy();
    expect(screen.queryByText("Completed session")).toBeNull();
  });

  it("acknowledges one of two items then reloads the authoritative queue", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    acknowledge.mockResolvedValue({ outcome: "acknowledged" });
    render(
      <CoachAthleteCompletedActivities
        {...props}
        onRetry={retry}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              distanceMeters: null,
              evidenceVersion: "v1",
              elapsedMs: null,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
            {
              activityCategory: "bike",
              activityId: props.athleteProfileId,
              distanceMeters: null,
              evidenceVersion: "v2",
              elapsedMs: null,
              planningDate: "2026-11-09",
              sessionId: "33333333-3333-4333-8333-333333333333",
            },
          ],
        }}
      />,
    );

    const [firstReview] = screen.getAllByRole("button", { name: "Mark reviewed" });
    if (!firstReview) throw new Error("Expected the first completion review control.");
    fireEvent.click(firstReview);
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(acknowledge).toHaveBeenCalledWith({
      data: expect.objectContaining({ evidenceVersion: "v1" }),
    });
    // The old queue stays visible until the route reload supplies an authoritative result.
    expect(screen.getAllByText("Completed session")).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("Marked reviewed");
  });

  it("does not call a stale acknowledgement reviewed and refreshes the authoritative queue", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    acknowledge.mockResolvedValue({ outcome: "stale" });
    render(
      <CoachAthleteCompletedActivities
        {...props}
        onRetry={retry}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              distanceMeters: null,
              evidenceVersion: "v1",
              elapsedMs: null,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));

    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toContain("changed since it was loaded");
    expect(screen.getByText("Completed session")).toBeTruthy();
  });

  it("describes an empty queue without claiming all activity history is reviewed", () => {
    render(
      <CoachAthleteCompletedActivities {...props} result={{ status: "granted", items: [] }} />,
    );

    expect(screen.getByText("No completions waiting for review.")).toBeTruthy();
    expect(screen.queryByText(/all activities reviewed/i)).toBeNull();
  });

  it("retains the queue for a retry when acknowledgement delivery is unknown", async () => {
    acknowledge.mockRejectedValue(new Error("network interrupted"));
    render(
      <CoachAthleteCompletedActivities
        {...props}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              distanceMeters: null,
              evidenceVersion: "v1",
              elapsedMs: null,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    expect((await screen.findByRole("alert")).textContent).toContain("could not be confirmed");
    expect(screen.getByText("Completed session")).toBeTruthy();
  });

  it("hides the previous private projection and reloads when access is revoked", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    acknowledge.mockResolvedValue({ outcome: "forbidden" });
    render(
      <CoachAthleteCompletedActivities
        {...props}
        onRetry={retry}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              distanceMeters: null,
              evidenceVersion: "v1",
              elapsedMs: null,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }));
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
    expect(screen.getByText("Completed activities unavailable")).toBeTruthy();
    expect(screen.queryByText("Completed session")).toBeNull();
  });
});

vi.mock("../../../lib/coaching/athlete-completions-server-functions", () => ({
  acknowledgeCoachAthleteCompletedActivity: vi.fn(),
}));
