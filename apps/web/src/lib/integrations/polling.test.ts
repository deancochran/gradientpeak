import { describe, expect, it } from "vitest";

import { getIntegrationPollingInterval } from "./polling";

function overview(status: { activity?: string; planned?: string; setup?: string }) {
  return [
    {
      activityHistory: { status: status.activity ?? "idle" },
      plannedWorkouts: { status: status.planned ?? "automatic" },
      setupData: { status: status.setup ?? "refreshed" },
    },
  ];
}

describe("integration overview polling", () => {
  it.each([
    [overview({ activity: "queued" })],
    [overview({ activity: "importing" })],
    [overview({ planned: "queued" })],
    [overview({ planned: "syncing" })],
    [overview({ setup: "refreshing" })],
  ])("polls while any provider resource is transitioning", (value) => {
    expect(getIntegrationPollingInterval(value)).toBe(5000);
  });

  it("stops polling after resources settle", () => {
    expect(getIntegrationPollingInterval(overview({ activity: "synced" }))).toBe(false);
    expect(getIntegrationPollingInterval(undefined)).toBe(false);
  });
});
