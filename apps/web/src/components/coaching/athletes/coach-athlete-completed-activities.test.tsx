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
    vi.restoreAllMocks();
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
              completionOutcome: "full",
              completionSource: "recorded",
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

    expect(screen.getByText("Completed in full")).toBeTruthy();
    expect(screen.getByText(/planned 2026-11-10/i)).toBeTruthy();
    expect(screen.getByText("Activity")).toBeTruthy();
    expect(screen.getByText("Time")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("run")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
    expect(screen.getByText("5.0 km")).toBeTruthy();
    expect(screen.getByText("Recorded completion")).toBeTruthy();
    expect(screen.getByText(/does not mark anything reviewed/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeTruthy();
  });

  it("renders durable partial/manual labels and leaves unsupported source unavailable", () => {
    render(
      <CoachAthleteCompletedActivities
        {...props}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: "11111111-1111-4111-8111-111111111111",
              completionOutcome: "partial",
              completionSource: "manual",
              distanceMeters: null,
              evidenceVersion: "manual-partial-v1",
              elapsedMs: null,
              planningDate: "2026-11-09",
              sessionId: "22222222-2222-4222-8222-222222222220",
            },
            {
              activityCategory: null,
              activityId: "11111111-1111-4111-8111-111111111112",
              completionOutcome: "full",
              completionSource: "unavailable",
              distanceMeters: null,
              evidenceVersion: "unknown-source-v1",
              elapsedMs: null,
              planningDate: "2026-11-08",
              sessionId: "22222222-2222-4222-8222-222222222221",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Completed partially")).toBeTruthy();
    expect(screen.getByText("Manual completion")).toBeTruthy();
    expect(screen.getByText("Completion source unavailable")).toBeTruthy();
    expect(screen.queryByText("Recorded completion")).toBeNull();
  });

  it("does not render activity content when either consent scope is denied", () => {
    render(<CoachAthleteCompletedActivities {...props} result={{ status: "forbidden" }} />);
    expect(screen.getByText("Completed activities unavailable")).toBeTruthy();
    expect(screen.queryByText("Completed in full")).toBeNull();
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
              completionOutcome: "full",
              completionSource: "recorded",
              distanceMeters: null,
              evidenceVersion: "v1",
              elapsedMs: null,
              planningDate: "2026-11-10",
              sessionId: "22222222-2222-4222-8222-222222222222",
            },
            {
              activityCategory: "bike",
              activityId: props.athleteProfileId,
              completionOutcome: "full",
              completionSource: "recorded",
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
    expect(screen.getAllByText("Completed in full")).toHaveLength(2);
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
              completionOutcome: "full",
              completionSource: "recorded",
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
    expect(screen.getByText("Completed in full")).toBeTruthy();
  });

  it("keeps the queue visible when browser storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    render(
      <CoachAthleteCompletedActivities
        {...props}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              completionOutcome: "full",
              completionSource: "recorded",
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

    expect(screen.getByText("Completed in full")).toBeTruthy();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("keeps the queue visible when a stored notice cannot be removed", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(
      JSON.stringify({ message: "Marked reviewed.", recordedAt: Date.now() }),
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    render(
      <CoachAthleteCompletedActivities
        {...props}
        result={{
          status: "granted",
          items: [
            {
              activityCategory: "run",
              activityId: props.athleteProfileId,
              completionOutcome: "full",
              completionSource: "recorded",
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

    expect(screen.getByText("Completed in full")).toBeTruthy();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("still reconciles a confirmed review when browser-local notice storage fails", async () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
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
              completionOutcome: "full",
              completionSource: "recorded",
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
    expect(screen.getByRole("status").textContent).toContain("Marked reviewed");
    setItem.mockRestore();
  });

  it("reports a confirmed acknowledgement separately when the queue refresh fails", async () => {
    const retry = vi.fn().mockRejectedValue(new Error("reload failed"));
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
              completionOutcome: "full",
              completionSource: "recorded",
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

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Review was confirmed");
    expect(alert.textContent).not.toContain("could not be confirmed");
    expect(screen.getByText("Completed in full")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry queue refresh" }));
    await waitFor(() => expect(retry).toHaveBeenCalledTimes(2));
    expect(acknowledge).toHaveBeenCalledOnce();
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
              completionOutcome: "full",
              completionSource: "recorded",
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
    expect(screen.getByText("Completed in full")).toBeTruthy();
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
              completionOutcome: "full",
              completionSource: "recorded",
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
    expect(screen.queryByText("Completed in full")).toBeNull();
  });
});

vi.mock("../../../lib/coaching/athlete-completions-server-functions", () => ({
  acknowledgeCoachAthleteCompletedActivity: vi.fn(),
}));
