// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanStructure } from "./activity-plan-structure";

const structure = {
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "00000000-0000-4000-8000-000000000003",
      name: "Tempo",
      instructions:
        "Keep the warm-up smooth. Recover fully before the next round. Settle into a sustainable rhythm. Stay seated on the climbs.",
      duration: { type: "time", seconds: 60 },
      targets: [{ type: "%FTP", intensity: 80 }],
    },
  ],
};
describe("ActivityPlanStructure", () => {
  afterEach(cleanup);
  it("keeps the authored reference separate from session-flow personalization", () => {
    render(<ActivityPlanStructure structure={structure} />);
    expect(screen.getByText(/80% FTP/)).toBeTruthy();
    expect(screen.queryByText(/240 W/)).toBeNull();
    expect(screen.queryByRole("switch", { name: "Calculated targets" })).toBeNull();
  });
  it("shows every authored instruction annotation in the full prescription", () => {
    render(<ActivityPlanStructure structure={structure} />);
    expect(screen.getByText(/Keep the warm-up smooth/)).toBeTruthy();
    expect(screen.getByText(/Recover fully before the next round/)).toBeTruthy();
    expect(screen.getByText(/Settle into a sustainable rhythm\./)).toBeTruthy();
    expect(screen.getByText(/Stay seated on the climbs\./)).toBeTruthy();
  });
});
