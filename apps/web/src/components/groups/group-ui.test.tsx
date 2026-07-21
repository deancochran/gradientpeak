// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GroupCard,
  GroupEventCard,
  type GroupEventSummary,
  QueryState,
  type WebGroupSummary,
} from "./group-ui";

afterEach(cleanup);

const group: WebGroupSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Sunday Riders",
  slug: "sunday-riders",
  description: "A weekly ride group.",
  avatar_url: null,
  cover_url: null,
  access_level: "members_only",
  join_policy: "invite_only",
  viewerMembershipRole: "owner",
};

describe("group web presentation", () => {
  it("renders group identity, access, relationship, and an operable detail action", () => {
    const onOpen = vi.fn();
    render(<GroupCard group={group} onOpen={onOpen} />);

    expect(screen.getByText("Sunday Riders")).toBeTruthy();
    expect(screen.getByText("@sunday-riders")).toBeTruthy();
    expect(screen.getByText("Members only")).toBeTruthy();
    expect(screen.getByText("Invite only")).toBeTruthy();
    expect(screen.getByText("owner")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View group" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("renders cancelled event state and accepted count", () => {
    const event: GroupEventSummary = {
      id: "22222222-2222-4222-8222-222222222222",
      group_id: group.id,
      title: "Long ride",
      description: null,
      starts_at: "2026-08-01T09:00:00.000Z",
      ends_at: null,
      timezone: "UTC",
      location_name: "Clubhouse",
      route_id: null,
      activity_plan_id: null,
      cancelled_at: "2026-07-30T09:00:00.000Z",
      series_id: null,
      recurrence_rule: null,
      is_recurring_occurrence: false,
      is_recurring_series: false,
      acceptedRsvpCount: 4,
      viewerRsvp: null,
      viewerSeriesRsvp: null,
    };
    render(<GroupEventCard event={event} onOpen={vi.fn()} />);

    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("4 going")).toBeTruthy();
    expect(screen.getByText("Clubhouse")).toBeTruthy();
  });

  it("does not collapse query errors into empty content", () => {
    render(
      <QueryState error={new Error("failed")} isLoading={false}>
        Empty
      </QueryState>,
    );

    expect(screen.getByRole("alert").textContent).toContain("Unable to load");
    expect(screen.queryByText("Empty")).toBeNull();
  });
});
