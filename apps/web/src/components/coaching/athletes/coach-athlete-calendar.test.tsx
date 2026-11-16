// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.load }));
vi.mock("../../../lib/coaching/athlete-calendar-server-functions", () => ({
  loadCoachAthleteCalendar: {},
  shiftCalendarWeek: (
    _range: { startDate: string; endDateExclusive: string },
    direction: number,
  ) => ({
    startDate: direction > 0 ? "2026-03-15" : "2026-03-01",
    endDateExclusive: direction > 0 ? "2026-03-22" : "2026-03-08",
  }),
}));

import { CoachAthleteCalendar } from "./coach-athlete-calendar";

afterEach(() => {
  cleanup();
  mocks.load.mockReset();
});

const ids = {
  actorProfileId: "actor-a",
  athlete: "22222222-2222-4222-8222-222222222222",
  organization: "11111111-1111-4111-8111-111111111111",
};
const range = { startDate: "2026-03-08", endDateExclusive: "2026-03-15" };
const granted = (events = [event("e1", "2026-03-08")]) => ({
  status: "granted" as const,
  source: "planned_sessions" as const,
  truncated: false,
  nextCursor: null,
  projection: { events },
});
function event(eventId: string, planningDate: string) {
  return {
    eventId,
    planningDate,
    activityCategory: "run",
    status: "scheduled",
    activityPlanId: null,
  };
}
function calendar(overrides: Partial<React.ComponentProps<typeof CoachAthleteCalendar>> = {}) {
  return (
    <CoachAthleteCalendar
      actorProfileId={ids.actorProfileId}
      athleteId={ids.athlete}
      initialRange={range}
      organizationId={ids.organization}
      result={granted()}
      {...overrides}
    />
  );
}

describe("CoachAthleteCalendar", () => {
  it("renders date-only records literally and never calls an empty range available", () => {
    render(calendar());
    expect(screen.getByRole("heading", { name: "Planned sessions", level: 2 })).toBeTruthy();
    expect(screen.getByText("2026-03-08")).toBeTruthy();
    expect(screen.queryByText(/available/i)).toBeNull();
  });

  it("uses semantic level-two titles for loaded, denied, and error calendar states", () => {
    const view = render(calendar());
    expect(screen.getByRole("heading", { name: "Planned sessions", level: 2 })).toBeTruthy();
    view.rerender(calendar({ result: { status: "forbidden" } }));
    expect(
      screen.getByRole("heading", { name: "Planned sessions unavailable", level: 2 }),
    ).toBeTruthy();
    view.rerender(calendar({ result: { status: "error" } }));
    expect(
      screen.getByRole("heading", { name: "Planned sessions could not be loaded", level: 2 }),
    ).toBeTruthy();
  });

  it("continues only the displayed range and retains deduplicated rows", async () => {
    mocks.load.mockResolvedValueOnce({
      ...granted([event("e1", "2026-03-08"), event("e2", "2026-03-09")]),
      truncated: false,
      nextCursor: null,
    });
    render(
      calendar({
        result: {
          ...granted(),
          truncated: true,
          nextCursor: { eventId: "e1", planningDate: "2026-03-08" },
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more planned sessions" }));
    await waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
    expect(mocks.load.mock.calls[0]?.[0]).toEqual({
      data: {
        athleteProfileId: ids.athlete,
        cursor: { eventId: "e1", planningDate: "2026-03-08" },
        endDateExclusive: range.endDateExclusive,
        organizationId: ids.organization,
        startDate: range.startDate,
      },
    });
    await screen.findByText("2026-03-09");
    expect(screen.getAllByText("2026-03-08")).toHaveLength(1);
  });

  it("discards a deferred completion through an actor A-B-A scope transition", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(calendar());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    view.rerender(
      calendar({ actorProfileId: "actor-b", result: granted([event("b", "2026-03-09")]) }),
    );
    view.rerender(
      calendar({ actorProfileId: "actor-a", result: granted([event("fresh", "2026-03-10")]) }),
    );
    resolve(granted([event("old", "2026-03-15")]));
    await waitFor(() => expect(screen.queryByText("2026-03-15")).toBeNull());
    expect(screen.getByText("2026-03-10")).toBeTruthy();
    expect(screen.queryByText("2026-03-08")).toBeNull();
  });

  it("does not render old rows when the initial range transitions A-B-A before an effect", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(calendar());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const later = { startDate: "2026-03-15", endDateExclusive: "2026-03-22" };
    view.rerender(calendar({ initialRange: later, result: granted([event("b", "2026-03-16")]) }));
    view.rerender(
      calendar({ initialRange: range, result: granted([event("fresh", "2026-03-10")]) }),
    );
    resolve(granted([event("old", "2026-03-15")]));
    await waitFor(() => expect(screen.getByText("2026-03-10")).toBeTruthy());
    expect(screen.queryByText("2026-03-15")).toBeNull();
    expect(screen.queryByText("2026-03-08")).toBeNull();
  });

  it("distinguishes a retryable error from terminal calendar denial", async () => {
    mocks.load.mockRejectedValueOnce(new Error("network"));
    const view = render(calendar());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    await screen.findByRole("alert");
    expect(screen.getByText("2026-03-08")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();

    mocks.load.mockResolvedValueOnce({ status: "forbidden" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Planned sessions unavailable");
    expect(screen.queryByText("2026-03-08")).toBeNull();

    view.unmount();
  });

  it("clears retained rows when a forbidden continuation is returned", async () => {
    mocks.load.mockResolvedValueOnce({ status: "forbidden" });
    render(
      calendar({
        result: {
          ...granted(),
          truncated: true,
          nextCursor: { eventId: "e1", planningDate: "2026-03-08" },
        },
      }),
    );
    expect(screen.getByText("2026-03-08")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more planned sessions" }));
    await screen.findByText("Planned sessions unavailable");
    expect(screen.queryByText("2026-03-08")).toBeNull();
  });

  it("treats a same-scope forbidden loader snapshot as authoritative over a deferred continuation", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(
      calendar({
        result: {
          ...granted(),
          truncated: true,
          nextCursor: { eventId: "e1", planningDate: "2026-03-08" },
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more planned sessions" }));
    view.rerender(calendar({ result: { status: "forbidden" } }));
    expect(screen.getByText("Planned sessions unavailable")).toBeTruthy();
    expect(screen.queryByText("2026-03-08")).toBeNull();
    resolve(granted([event("old", "2026-03-09")]));
    await waitFor(() => expect(screen.getByText("Planned sessions unavailable")).toBeTruthy());
    expect(screen.queryByText("2026-03-09")).toBeNull();
  });

  it("supersedes a deferred request with fresh granted and error snapshots in the same scope", async () => {
    let resolve!: (value: ReturnType<typeof granted>) => void;
    mocks.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = render(calendar());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    view.rerender(calendar({ result: granted([event("fresh", "2026-03-10")]) }));
    expect(screen.getByText("2026-03-10")).toBeTruthy();
    view.rerender(calendar({ result: { status: "error" } }));
    expect(screen.getByText("Planned sessions could not be loaded")).toBeTruthy();
    resolve(granted([event("old", "2026-03-15")]));
    await waitFor(() =>
      expect(screen.getByText("Planned sessions could not be loaded")).toBeTruthy(),
    );
    expect(screen.queryByText("2026-03-15")).toBeNull();
  });

  it("offers section-local recovery when the initial calendar request failed", async () => {
    mocks.load.mockResolvedValueOnce(granted([event("recovered", "2026-03-10")]));
    render(calendar({ result: { status: "error" } }));
    expect(
      screen.getByText("The athlete overview is still available. Retry this calendar section."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry calendar" }));
    await screen.findByText("2026-03-10");
  });
});
