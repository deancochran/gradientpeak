// @vitest-environment jsdom
vi.mock("../app-href-link", () => ({
  AppHrefLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GoalCard } from "./goal-card";

describe("GoalCard", () => {
  it("renders goal identity, a readable target date, and a descriptive link", () => {
    render(
      <GoalCard
        goal={{
          id: "goal-1",
          objectiveSummary: "Finish under four hours",
          targetDate: "2026-10-18",
          title: "Autumn marathon",
          typeLabel: "Race",
        }}
        href="/goals/goal-1"
      />,
    );

    expect(screen.getByText("Autumn marathon")).toBeTruthy();
    expect(screen.getByText("Finish under four hours")).toBeTruthy();
    expect(screen.getByText("Oct 18, 2026")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open goal Autumn marathon" }).getAttribute("href"),
    ).toBe("/goals/goal-1");
  });
});
