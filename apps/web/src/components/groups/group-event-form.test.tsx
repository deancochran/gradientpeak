// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupEventForm } from "./group-event-form";
import type { GroupEventSummary } from "./group-ui";

vi.mock("../../lib/api/client", () => ({
  api: {
    routes: { list: { useQuery: () => ({ data: { items: [] } }) } },
    activityPlans: { list: { useQuery: () => ({ data: { items: [] } }) } },
  },
}));

afterEach(cleanup);

describe("GroupEventForm organizer timezone", () => {
  it("renders and resolves edits in the event zone instead of the device zone", async () => {
    const onSubmit = vi.fn(async () => undefined);
    const event: GroupEventSummary = {
      id: "22222222-2222-4222-8222-222222222222",
      group_id: "11111111-1111-4111-8111-111111111111",
      title: "Dateline ride",
      description: null,
      starts_at: "2026-06-01T10:30:00.000Z",
      ends_at: "2026-06-01T11:30:00.000Z",
      timezone: "Pacific/Kiritimati",
      location_name: null,
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
    };

    render(
      <GroupEventForm
        event={event}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
        submitLabel="Save"
      />,
    );

    expect((screen.getByLabelText("Starts") as HTMLInputElement).value).toBe("2026-06-02T00:30");
    expect((screen.getByLabelText("Ends") as HTMLInputElement).value).toBe("2026-06-02T01:30");
    expect(screen.getByText("Times use Pacific/Kiritimati.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Starts"), {
      target: { value: "2026-06-02T02:00" },
    });
    fireEvent.change(screen.getByLabelText("Ends"), {
      target: { value: "2026-06-02T03:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          startsAt: "2026-06-01T12:00:00.000Z",
          endsAt: "2026-06-01T13:00:00.000Z",
          timezone: "Pacific/Kiritimati",
        }),
      ),
    );
  });
});
