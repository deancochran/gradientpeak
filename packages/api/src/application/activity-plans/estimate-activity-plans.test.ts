import {
  activityPlanStructureSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publishedState = vi.hoisted(() => ({
  readPublishedAthletePerformanceTargets: vi.fn(),
}));

vi.mock("../athlete-intelligence/published-athlete-state", () => publishedState);

import { estimateActivityPlans } from "./estimate-activity-plans";

const asOf = new Date("2026-08-01T12:00:00.000Z");
const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      role: "activity",
      id: "70000000-0000-4000-8000-000000000001",
      name: "Scheduled bike",
      intervals: [
        {
          id: "70000000-0000-4000-8000-000000000002",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "70000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "%FTP", intensity: 75 }],
            },
          ],
        },
      ],
    },
  ],
});

const plan = {
  id: "80000000-0000-4000-8000-000000000001",
  profile_id: "90000000-0000-4000-8000-000000000001",
  name: "Bike plan",
  description: null,
  structure,
  structure_hash: `v1:sha256:${"a".repeat(64)}`,
  gps_recording_enabled: true,
  updated_at: asOf,
};

describe("estimateActivityPlans", () => {
  beforeEach(() => {
    publishedState.readPublishedAthletePerformanceTargets.mockReset();
  });

  it("estimates through the current published athlete-state snapshot", async () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(
      asOf.toISOString(),
      plan.profile_id,
    );
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: "available",
      targets,
    });

    const [estimated] = await estimateActivityPlans([plan], {} as never, plan.profile_id, { asOf });

    expect(publishedState.readPublishedAthletePerformanceTargets).toHaveBeenCalledWith({
      db: {},
      profileId: plan.profile_id,
      now: asOf,
    });
    expect(estimated?.prescriptionQuantification.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 1_800,
      unit: "seconds",
    });
    expect(estimated?.prescriptionQuantification.members).toHaveLength(1);
  });

  it("does not estimate current facts from a stale published target revision", async () => {
    publishedState.readPublishedAthletePerformanceTargets.mockResolvedValue({
      status: "stale",
      targets: createUnavailableAthletePerformanceTargetFacts(asOf.toISOString(), plan.profile_id),
    });

    const [estimated] = await estimateActivityPlans([plan], {} as never, plan.profile_id, { asOf });

    expect(estimated?.prescriptionQuantification.summary.duration.elapsed.status).toBe(
      "unavailable",
    );
    expect(estimated).not.toHaveProperty("estimation_warnings");
  });

  it("skips snapshot I/O for an empty batch", async () => {
    await expect(
      estimateActivityPlans([], {} as never, plan.profile_id, { asOf }),
    ).resolves.toEqual([]);
    expect(publishedState.readPublishedAthletePerformanceTargets).not.toHaveBeenCalled();
  });
});
