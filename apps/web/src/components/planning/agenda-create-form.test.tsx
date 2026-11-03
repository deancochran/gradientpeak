// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgendaCreateForm } from "./agenda-create-form";

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: () => ({
    guardedCancel: (fn: () => void) => fn(),
    markSaveFailed: vi.fn(),
    markSaved: vi.fn(),
  }),
}));

const mocks = vi.hoisted(() => ({
  action: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.action }));
vi.mock("../../lib/planning/server-actions", () => ({
  createCalendarEventAction: { url: "/actions/calendar/create" },
}));

afterEach(() => {
  cleanup();
  mocks.action.mockReset();
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
        true,
      ),
    );
  });

  it("always submits an event without an activity-plan link", async () => {
    render(<AgendaCreateForm initialDate="2026-10-26" />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Morning ride" } });
    fireEvent.submit(getForm());

    await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(1));
    const formData = mocks.action.mock.calls[0]?.[0]?.data as FormData;
    expect(formData.get("event_type")).toBe("custom");
    expect(formData.has("activity_plan_id")).toBe(false);
  });
});
