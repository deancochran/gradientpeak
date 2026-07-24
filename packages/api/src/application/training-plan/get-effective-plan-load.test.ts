import { describe, expect, it, vi } from "vitest";
import { getEffectivePlanLoad, getEffectivePlanLoadInputSchema } from "./get-effective-plan-load";

const activityAnalysis = vi.hoisted(() => ({
  buildActivityDerivedSummaries: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", () => activityAnalysis);

describe("getEffectivePlanLoad", () => {
  it("accepts a server-derived current week or a bounded date range and tentative server-item overlay", () => {
    expect(getEffectivePlanLoadInputSchema.safeParse({}).success).toBe(true);
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-07-23",
        endDate: "2026-07-24",
        tentativeScheduledItemIds: ["4cf55f6b-7599-49bc-bb62-c0b94c58ba3e"],
      }).success,
    ).toBe(true);
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-07-24",
        endDate: "2026-07-23",
        scheduledItems: [],
      }).success,
    ).toBe(false);
    expect(getEffectivePlanLoadInputSchema.safeParse({ startDate: "2026-07-23" }).success).toBe(
      false,
    );
  });

  it("does not turn a missing profile timezone into zero Load", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [],
      planningTimezone: null,
      resolvedRange: { startDate: null, endDate: null },
      sourceCounts: { activities: 0, events: 0 },
      sourceCoverage: { activities: null, scheduledItems: null },
    });
    const result = await getEffectivePlanLoad({
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-23", endDate: "2026-07-24" },
    });

    expect(getEffectivePlanLoadInputs).toHaveBeenCalledWith({
      asOf: expect.any(Date),
      profileId: "profile-1",
      startDate: "2026-07-23",
      endDate: "2026-07-24",
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "planning_timezone_missing" });
  });

  it("uses the derived parent summary once for a multi-segment completed activity", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [{ id: "activity-1", started_at: new Date("2026-07-20T12:00:00.000Z") }],
      events: [],
      planningTimezone: "UTC",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
      sourceCounts: { activities: 1, events: 0 },
      sourceCoverage: {
        activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map([
        [
          "activity-1",
          {
            common_load: {
              status: "unavailable",
              model: "gradientpeak_relative_load",
              version: "1",
              sport: "bike",
              method: null,
              quality: null,
              thresholdEvidence: null,
              evidenceFingerprint: null,
              computedAsOf: "2026-07-20T12:00:00.000Z",
              contributingDurationSeconds: null,
              reason: "threshold_missing",
            },
          },
        ],
      ]),
      segments: [{ activity_id: "activity-1" }, { activity_id: "activity-1" }],
    });

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: {},
    });

    expect(activityAnalysis.buildActivityDerivedSummaries).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "available",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26", timezone: "UTC" },
      effective: {
        firmItems: [
          {
            kind: "completed",
            completedActivityId: "activity-1",
            commonLoad: { reason: "threshold_missing" },
          },
        ],
      },
    });
  });

  it("assigns scheduled items to their persisted scheduled date, not their event instant", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [
        {
          id: "event-1",
          activity_plan_id: null,
          linked_activity_id: null,
          scheduled_date: "2026-07-21",
          starts_at: "2026-07-18T00:00:00.000Z",
          status: "scheduled",
        },
      ],
      planningTimezone: "America/Los_Angeles",
      resolvedRange: { startDate: "2026-07-19", endDate: "2026-07-25" },
      sourceCounts: { activities: 0, events: 1 },
      sourceCoverage: {
        activities: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
        scheduledItems: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map(),
      segments: [],
    });

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-19", endDate: "2026-07-25" },
    });

    expect(result).toMatchObject({
      status: "available",
      effective: {
        firmItems: [{ kind: "scheduled", scheduledItemId: "event-1", date: "2026-07-21" }],
      },
    });
  });
});
