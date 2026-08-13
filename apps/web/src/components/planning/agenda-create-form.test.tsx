// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaCreateForm } from "./agenda-create-form";

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
  activityPlansQuery: {
    data: { items: [] as Array<{ id: string; name: string }> },
    isError: false,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../lib/api/client", () => ({
  api: { activityPlans: { list: { useQuery: () => mocks.activityPlansQuery } } },
}));
vi.mock("../../lib/planning/server-actions", () => ({
  createCalendarEventAction: { url: "/actions/calendar/create" },
}));

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
  mocks.activityPlansQuery.data = { items: [] };
  mocks.activityPlansQuery.isError = false;
  mocks.activityPlansQuery.isLoading = false;
  mocks.activityPlansQuery.refetch.mockReset();
});

function getForm() {
  const form = screen.getByRole("button", { name: /create|creating/i }).closest("form");
  if (!(form instanceof HTMLFormElement))
    throw new Error("Expected the create button to be inside a form.");
  return form;
}

describe("AgendaCreateForm", () => {
  it("keeps the create draft and announces a rejected server submission", async () => {
    mocks.action.mockRejectedValueOnce(new Error("Create request failed"));
    render(<AgendaCreateForm initialDate="2026-10-26" />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning ride" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Bring bottles" } });
    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toContain("Create request failed");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Morning ride");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Bring bottles");
  });

  it("prevents duplicate create submissions while the request is pending", async () => {
    let resolve!: () => void;
    mocks.action.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<AgendaCreateForm initialDate="2026-10-26" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning ride" } });
    const form = getForm();

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect(
      (screen.getByRole("button", { name: "Creating..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    resolve();
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it("submits the selected activity plan when creating planned work", async () => {
    mocks.activityPlansQuery.data = { items: [{ id: "plan-1", name: "Tempo ride" }] };
    render(<AgendaCreateForm initialDate="2026-10-26" initialType="planned" />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Tempo ride" } });
    fireEvent.change(screen.getByLabelText("Activity plan"), { target: { value: "plan-1" } });
    fireEvent.submit(getForm());

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    const request = mocks.action.mock.calls[0]?.[0] as { data: FormData };
    expect(request.data.get("event_type")).toBe("planned");
    expect(request.data.get("activity_plan_id")).toBe("plan-1");
    expect(request.data.get("scheduled_date")).toBe("2026-10-26");
  });

  it("lets users retry loading activity plans", () => {
    mocks.activityPlansQuery.isError = true;
    render(<AgendaCreateForm initialType="planned" />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.activityPlansQuery.refetch).toHaveBeenCalledOnce();
  });
});
