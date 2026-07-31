// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "./$eventId";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  event: undefined as unknown,
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useParams: () => ({ eventId: "event-1" }),
    useSearch: () => ({}),
  }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../../components/route-flash-toast", () => ({ RouteFlashToast: () => null }));
vi.mock("../../../lib/planning/server-actions", () => ({
  attachCalendarActivityPlanAction: { url: "/actions/attach" },
  deleteCalendarEventAction: { url: "/actions/delete" },
  updateCalendarEventAction: { url: "/actions/update" },
}));
vi.mock("../../../lib/api/client", () => ({
  api: {
    useUtils: () => ({ events: { invalidate: mocks.invalidate } }),
    activityPlans: {
      list: {
        useQuery: () => ({
          data: { items: [{ id: "plan-2", name: "Replacement plan" }] },
          isError: false,
        }),
      },
    },
    events: {
      getById: { useQuery: () => ({ data: mocks.event, isLoading: false, isError: false }) },
    },
  },
}));

beforeEach(() => {
  mocks.action.mockReset();
  mocks.invalidate.mockReset();
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

  it("announces failed attach once and retains the selected plan", async () => {
    mocks.action.mockRejectedValueOnce(new Error("attach failed"));
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);
    const select = screen.getByRole("combobox", { name: "Activity plan" });
    fireEvent.change(select, { target: { value: "plan-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach activity plan" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent?.includes("attach failed")).toBe(true),
    );
    expect((select as HTMLSelectElement).value).toBe("plan-2");
    expect(mocks.action).toHaveBeenCalledTimes(1);
  });

  it("invalidates event data after a successful plan mutation", async () => {
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity plan" }), {
      target: { value: "plan-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach activity plan" }));
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1));
  });

  it("announces a failed plan removal", async () => {
    mocks.action.mockRejectedValueOnce(new Error("remove failed"));
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove activity plan" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent?.includes("remove failed")).toBe(true),
    );
  });

  it("keeps operation labels distinct while a plan mutation is pending", () => {
    let resolveAction: (() => void) | undefined;
    mocks.action.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity plan" }), {
      target: { value: "plan-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach activity plan" }));
    expect(screen.getByRole("button", { name: "Attaching..." })).toBeTruthy();
    const remove = screen.getByRole("button", {
      name: "Remove activity plan",
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    resolveAction?.();
  });

  it("retains the reschedule date and remove scope after failed actions", async () => {
    mocks.event = {
      activity_plan_id: "run-plan",
      activity_plan: { name: "Tempo run", activity_category: "run" },
      id: "event-1",
      scheduled_date: "2026-07-27",
      title: "Brick day",
      recurrence_rule: "FREQ=WEEKLY",
      series_id: "series-1",
    };
    mocks.action.mockRejectedValueOnce(new Error("reschedule failed"));
    const ScheduledActivityDetailPage = (Route as unknown as { component: React.ComponentType })
      .component;
    render(<ScheduledActivityDetailPage />);
    const date = screen.getByLabelText("New date");
    fireEvent.change(date, { target: { value: "2026-08-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Reschedule occurrence" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("reschedule failed"),
    );
    expect((date as HTMLInputElement).value).toBe("2026-08-01");

    mocks.action.mockRejectedValueOnce(new Error("delete failed"));
    const scope = screen.getByLabelText("Remove scope");
    fireEvent.change(scope, { target: { value: "future" } });
    fireEvent.click(screen.getByRole("button", { name: "Remove from schedule" }));
    await waitFor(() =>
      expect(screen.getAllByRole("alert").at(-1)?.textContent).toContain("delete failed"),
    );
    expect((scope as HTMLSelectElement).value).toBe("future");
  });
});
