// @vitest-environment jsdom
vi.mock("../app-href-link", () => ({
  AppHrefLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import type { CalendarProjectionItem } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannedActivityCard } from "./planned-activity-card";

vi.mock("./activity-plan-card", () => ({
  ActivityPlanCard: ({
    href,
    openLabel,
    plan,
  }: {
    href: string;
    openLabel: string;
    plan: { id: string; metrics: CalendarProjectionItem["metrics"] };
  }) => (
    <a
      aria-label={openLabel}
      data-load={plan.metrics.find((metric) => metric.key === "common_load")?.value ?? "missing"}
      data-testid={`activity-plan-card-${plan.id}`}
      href={href}
    >
      Plan
    </a>
  ),
}));

function planned(
  plan: CalendarProjectionItem["plan"],
  metrics: CalendarProjectionItem["metrics"] = [],
) {
  return {
    calendarDate: "2026-08-20",
    id: "planned-1",
    metrics,
    navigation: { href: "/calendar/events/planned-1", target: "event" },
    plan,
    status: "scheduled",
    subtitle: "Aerobic run",
    title: "Morning run",
  } as const;
}

afterEach(cleanup);

describe("PlannedActivityCard", () => {
  it("remains a dedicated planned card when the plan preview is unavailable", () => {
    render(<PlannedActivityCard item={planned(null)} />);
    expect(screen.getByTestId("planned-activity-card-planned-1")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open planned activity Morning run/i })).toBeTruthy();
    expect(screen.getByText(/August 20, 2026/)).toBeTruthy();
    expect(screen.queryByText("Load")).toBeNull();
    expect(screen.queryByText("Intensity")).toBeNull();
    expect(screen.queryByText("Estimate details")).toBeNull();
  });

  it("delegates rich plan data to ActivityPlanCard", () => {
    const metrics = [
      {
        key: "common_load" as const,
        label: "Load",
        status: "available" as const,
        value: 55,
        unit: "score",
        reason: null,
      },
    ];
    render(<PlannedActivityCard item={planned({ id: "plan-1", metrics } as never, metrics)} />);
    const card = screen.getByTestId("activity-plan-card-plan-1");
    expect(card.getAttribute("href")).toBe("/calendar/events/planned-1");
    expect(card.getAttribute("data-load")).toBe("55");
    expect(screen.getByRole("link", { name: "Open planned activity Morning run" })).toBeTruthy();
  });
});
