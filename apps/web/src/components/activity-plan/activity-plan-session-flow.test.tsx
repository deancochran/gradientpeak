// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanSessionFlow } from "./activity-plan-session-flow";

afterEach(cleanup);
describe("ActivityPlanSessionFlow", () => {
  it("formats a legacy pace-conversion artifact without changing its authored value", () => {
    const structure = {
      version: 5 as const,
      activity_category: "run" as const,
      items: [
        {
          type: "step",
          id: "00000000-0000-4000-8000-000000000002",
          duration: { type: "time" as const, seconds: 270 },
          targets: [{ type: "speed" as const, intensity: 13.333333333333334 }],
        },
      ],
    };
    render(<ActivityPlanSessionFlow structure={structure} />);
    expect(screen.getByText(/13\.33 km\/h/)).toBeTruthy();
    expect(structure.items[0]?.targets[0]?.intensity).toBe(13.333333333333334);
  });
});
