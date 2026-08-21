// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanStructure } from "./activity-plan-structure";

const structure = {
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Ride",
      notes: "Keep the warm-up smooth.",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Work",
          notes: "Recover fully before the next round.",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              name: "Tempo",
              description: "Settle into a sustainable rhythm.",
              notes: "Stay seated on the climbs.",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("ActivityPlanStructure", () => {
  afterEach(cleanup);
  it("keeps the authored reference separate from session-flow personalization", () => {
    render(<ActivityPlanStructure structure={structure} />);

    expect(screen.getByText(/80% FTP/)).toBeTruthy();
    expect(screen.queryByText(/240 W/)).toBeNull();
    expect(screen.queryByRole("switch", { name: "Personalize targets" })).toBeNull();
  });

  it("shows every authored instruction annotation in the full prescription", () => {
    render(<ActivityPlanStructure structure={structure} />);

    expect(screen.getByText("Keep the warm-up smooth.")).toBeTruthy();
    expect(screen.getByText("Recover fully before the next round.")).toBeTruthy();
    expect(screen.getByText("Settle into a sustainable rhythm.")).toBeTruthy();
    expect(screen.getByText("Stay seated on the climbs.")).toBeTruthy();
  });
});
