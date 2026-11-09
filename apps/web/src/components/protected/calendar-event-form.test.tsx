// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarEventForm } from "./calendar-event-form";

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: (fn: () => void) => fn(),
    markSaveFailed: vi.fn(),
    markSaved: vi.fn(),
  }),
}));

const mocks = vi.hoisted(() => ({ action: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/calendar">{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../lib/planning/server-actions", () => ({
  updateCalendarEventAction: { url: "/actions/calendar/update" },
}));

const event = {
  all_day: false,
  id: "00000000-0000-4000-8000-000000000001",
  notes: "Original notes",
  scheduled_date: "2026-10-26",
  starts_at: "2026-10-26T09:00:00.000Z",
  timezone: "UTC",
  title: "Original title",
};

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
});

function getForm() {
  const form = screen.getByRole("button", { name: /save changes|saving/i }).closest("form");
  if (!(form instanceof HTMLFormElement))
    throw new Error("Expected the save button to be inside a form.");
  return form;
}

describe("CalendarEventForm", () => {
  it("keeps the edit draft and announces a rejected server submission", async () => {
    mocks.action.mockRejectedValueOnce(new Error("Update request failed"));
    render(<CalendarEventForm event={event} month="2026-10" view="month" />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated title" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Updated notes" } });
    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toContain("Update request failed");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Updated title");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Updated notes");
  });

  it("prevents duplicate edit submissions while the request is pending", async () => {
    let resolve!: () => void;
    mocks.action.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    render(<CalendarEventForm event={event} month="2026-10" view="month" />);
    const form = getForm();

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    expect((screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    resolve();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it("blocks date/time changes from expanding to future or series scope and keeps single valid", async () => {
    const recurringEvent = { ...event, recurrence_rule: "FREQ=WEEKLY;COUNT=4" };
    render(<CalendarEventForm event={recurringEvent} month="2026-10" view="month" />);
    const scope = screen.getByLabelText("Apply changes to") as HTMLSelectElement;

    fireEvent.change(screen.getByLabelText("Time"), { target: { value: "10:00" } });

    await waitFor(() => expect(scope.value).toBe("single"));
    expect(
      (screen.getByRole("option", { name: /this and future events/i }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("option", { name: /entire series/i }) as HTMLOptionElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText(/Date, time, and all-day changes apply only to this event/i),
    ).toBeTruthy();

    fireEvent.change(scope, { target: { value: "future" } });
    await waitFor(() => expect(scope.value).toBe("single"));

    fireEvent.submit(getForm());
    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    const formData = mocks.action.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.get("scope")).toBe("single");
  });

  it("does not request an update for an invalid civil date", async () => {
    render(<CalendarEventForm event={event} month="2026-10" view="month" />);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "not-a-date" } });
    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toContain("Enter a valid event date.");
    expect(mocks.action).not.toHaveBeenCalled();
  });
});
