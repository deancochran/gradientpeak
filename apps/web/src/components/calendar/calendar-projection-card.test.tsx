// @vitest-environment jsdom
vi.mock("../app-href-link", () => ({
  AppHrefLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import type { CalendarProjectionItem } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarProjectionCard } from "./calendar-projection-card";

vi.mock("../protected/activity-route-primitives", () => ({
  ActivityListCard: ({ activity, href }: { activity: { id: string }; href: string }) => (
    <a data-testid={`canonical-activity-${activity.id}`} href={href}>
      Activity
    </a>
  ),
}));
vi.mock("../activity-plan/planned-activity-card", () => ({
  PlannedActivityCard: ({ item }: { item: { id: string; navigation: { href: string } } }) => (
    <a data-testid={`canonical-planned-${item.id}`} href={item.navigation.href}>
      Planned
    </a>
  ),
}));
vi.mock("../planning/goal-card", () => ({
  GoalCard: ({ goal, href }: { goal: { id: string; targetDate: string }; href: string }) => (
    <a data-target-date={goal.targetDate} data-testid={`canonical-goal-${goal.id}`} href={href}>
      Goal
    </a>
  ),
}));

function item(
  kind: CalendarProjectionItem["kind"],
  overrides: Partial<CalendarProjectionItem> = {},
) {
  return {
    id: `${kind}-1`,
    calendarDate: "2026-08-20",
    timing: { startsAt: null, endsAt: null, allDay: true, timezone: "UTC" },
    kind,
    title: kind,
    subtitle: null,
    status: kind === "completed_activity" ? "completed" : "scheduled",
    navigation: { target: "event", href: `/open/${kind}-1` },
    metrics: [],
    estimated: false,
    partial: false,
    plan: null,
    activity: null,
    event: null,
    groupEvent: null,
    goal: null,
    ...overrides,
  } as CalendarProjectionItem;
}

afterEach(cleanup);

describe("CalendarProjectionCard", () => {
  it("dispatches resource kinds to their canonical cards", () => {
    const { rerender } = render(
      <CalendarProjectionCard
        item={item("completed_activity", { activity: { id: "activity-model" } as never })}
      />,
    );
    expect(screen.getByTestId("canonical-activity-activity-model").getAttribute("href")).toBe(
      "/open/completed_activity-1",
    );

    rerender(<CalendarProjectionCard item={item("planned_activity")} />);
    expect(screen.getByTestId("canonical-planned-planned_activity-1").getAttribute("href")).toBe(
      "/calendar/events/planned_activity-1?resourceType=planned_session",
    );

    rerender(
      <CalendarProjectionCard
        item={item("goal", {
          goal: { objectiveSummary: "Finish", typeLabel: "Race" },
          status: "active",
        })}
      />,
    );
    expect(screen.getByTestId("canonical-goal-goal-1").getAttribute("data-target-date")).toBe(
      "2026-08-20",
    );
  });

  it("keeps ordinary events on the generic calendar card", () => {
    render(<CalendarProjectionCard item={item("event")} />);
    expect(screen.getByRole("link", { name: /event/i }).getAttribute("href")).toBe("/open/event-1");
  });
});
