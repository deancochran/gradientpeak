// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupEventForm } from "./group-event-form";
import type { GroupEventSummary } from "./group-ui";

const guard = vi.hoisted(() => ({ drafts: [] as Array<Record<string, unknown>> }));

vi.mock("../../lib/use-unsaved-changes-guard", () => ({
  useUnsavedChangesGuard: (options: { draft: Record<string, unknown> }) => {
    guard.drafts.push(options.draft);
    return {
      guardedCancel: (fn: () => void) => fn(),
      markSaveFailed: vi.fn(),
      markSaved: vi.fn(),
    };
  },
}));

vi.mock("../../lib/api/client", () => ({
  api: {
    routes: { list: { useQuery: () => ({ data: { items: [] } }) } },
    activityPlans: { list: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));

afterEach(() => {
  cleanup();
  guard.drafts.length = 0;
});

function eventFixture(overrides: Partial<GroupEventSummary> = {}): GroupEventSummary {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    group_id: "11111111-1111-4111-8111-111111111111",
    title: "Morning run",
    description: "Easy pace",
    starts_at: "2026-06-01T10:30:00.000Z",
    ends_at: null,
    timezone: "Pacific/Kiritimati",
    location_name: "Harbor",
    route_id: null,
    activity_plan_id: null,
    cancelled_at: null,
    series_id: null,
    recurrence_rule: null,
    is_recurring_occurrence: false,
    is_recurring_series: false,
    acceptedRsvpCount: 0,
    viewerRsvp: null,
    viewerSeriesRsvp: null,
    ...overrides,
  };
}

describe("GroupEventForm organizer timezone", () => {
  it("leaves new schedule values and timezone explicit", () => {
    render(
      <GroupEventForm
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
        submitLabel="Create"
      />,
    );

    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Event time zone")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("keeps an invalid schedule local and does not call the server", async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(
      <GroupEventForm
        event={eventFixture({ description: null, location_name: null })}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    );

    fireEvent.change(screen.getByLabelText("Starts"), { target: { value: "" } });
    const form = screen.getByLabelText("Starts").closest("form");
    if (!form) throw new Error("Expected group event form.");
    fireEvent.submit(form);

    await waitFor(() =>
      expect(document.getElementById("group-event-schedule-error")?.textContent).toContain(
        "Choose a start date and time.",
      ),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("round-trips an overnight end in the event zone instead of the device zone", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const event = eventFixture({
      title: "Dateline ride",
      description: null,
      starts_at: "2026-06-01T09:00:00.000Z",
      ends_at: "2026-06-01T11:00:00.000Z",
      timezone: "Pacific/Kiritimati",
      location_name: null,
    });

    render(
      <GroupEventForm
        event={event}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    );

    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("2026-06-01T23:00");
    expect((screen.getByLabelText("Ends") as HTMLInputElement).value).toBe("2026-06-02T01:00");
    expect(screen.getByText("Event time zone")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: "2026-06-01T09:00:00.000Z",
          endsAt: "2026-06-01T11:00:00.000Z",
          timezone: "Pacific/Kiritimati",
        }),
      ),
    );
  });

  it("keeps shared text-field edits, clears, limits, and dirty drafts equivalent", () => {
    render(
      <GroupEventForm
        event={eventFixture()}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn(async () => undefined)}
        submitLabel="Save"
      />,
    );

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    const location = screen.getByLabelText("Location") as HTMLInputElement;
    expect(title.maxLength).toBe(160);
    expect(description.maxLength).toBe(4000);
    expect(title.required).toBe(true);

    fireEvent.change(title, { target: { value: "Evening run" } });
    fireEvent.change(description, { target: { value: "" } });
    fireEvent.change(location, { target: { value: "" } });

    expect(title.value).toBe("Evening run");
    expect(description.value).toBe("");
    expect(location.value).toBe("");
    expect(guard.drafts.at(-1)).toMatchObject({
      description: "",
      locationName: "",
      title: "Evening run",
    });
  });

  it("prevents double submission and retains shared-field drafts after a submit error", async () => {
    let rejectSubmit: ((reason?: unknown) => void) | undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSubmit = reject;
        }),
    );
    render(
      <GroupEventForm
        event={eventFixture()}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Retained title" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Retained notes" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Retained place" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    rejectSubmit?.(new Error("Save failed"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Save failed"));

    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Retained title");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe(
      "Retained notes",
    );
    expect((screen.getByLabelText("Location") as HTMLInputElement).value).toBe("Retained place");
  });
});
