// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$eventId";

const mocks = vi.hoisted(() => ({ event: undefined as unknown }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ eventId: "event-1" }),
    useSearch: () => ({}),
  }),
}));
vi.mock("../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../lib/planning/server-actions", () => ({
  attachCalendarActivityPlanAction: { url: "/actions/attach" },
  deleteCalendarEventAction: { url: "/actions/delete" },
  updateCalendarEventAction: { url: "/actions/update" },
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    activityPlans: { list: { useQuery: () => ({ data: { items: [] }, isError: false }) } },
    events: {
      getById: { useQuery: () => ({ data: mocks.event, isLoading: false, isError: false }) },
    },
  },
}));

beforeEach(() => {
  mocks.event = {
    activity_plan_id: "run-plan",
    activity_plan: {
      name: "Tempo run",
      activity_category: "run",
    },
    id: "event-1",
    scheduled_date: "2026-07-27T09:00:00.000Z",
    title: "Brick day",
  };
});
afterEach(cleanup);

describe("ScheduledActivityDetailPage linked plan boundaries", () => {
  it("keeps canonical linked-plan controls available", () => {
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);

    expect(screen.getByRole("combobox", { name: "Activity plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove activity plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reschedule occurrence" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from schedule" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to scheduled activities" }).getAttribute("href"),
    ).toBe("/scheduled-activities");
  });

  it("fail-closes a nonnull relationship ID whose plan is unavailable", () => {
    mocks.event = {
      activity_plan: null,
      activity_plan_id: "missing-plan",
      id: "event-1",
      scheduled_date: "2026-07-27T09:00:00.000Z",
      title: "Brick day",
    };
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);

    expect(screen.getByRole("alert").textContent).toContain("linked activity plan is unavailable");
    expect(screen.queryByRole("combobox", { name: "Activity plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Attach activity plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove activity plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reschedule occurrence" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove from schedule" })).toBeTruthy();
  });

  it("retains attach replacement and detach controls for a canonical plan", () => {
    mocks.event = {
      activity_plan: {
        name: "Tempo run",
        activity_category: "run",
      },
      activity_plan_id: "run-plan",
      id: "event-1",
      scheduled_date: "2026-07-27T09:00:00.000Z",
      title: "Brick day",
    };
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);

    expect(screen.getByRole("combobox", { name: "Activity plan" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Attach activity plan" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Remove activity plan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reschedule occurrence" })).toBeTruthy();
  });
});
