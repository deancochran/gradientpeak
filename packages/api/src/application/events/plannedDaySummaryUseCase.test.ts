import { describe, expect, it } from "vitest";
import type {
  PlannedDaySummaryActivityPlanRecord,
  PlannedDaySummaryEventRecord,
  PlannedDaySummaryReadInput,
} from "../../repositories";
import {
  MAX_PLANNED_DAY_SUMMARY_EVENTS,
  PlannedDaySummaryLimitExceededError,
  plannedDaySummaryUseCase,
} from "./plannedDaySummaryUseCase";

function structure(activity_categories: Array<"bike" | "run">) {
  return {
    version: 3,
    segments: activity_categories.map((activity_category, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
      activity_category,
      name: activity_category,
      intervals: [
        {
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    })),
  };
}

function plan(id: string, planStructure: unknown): PlannedDaySummaryActivityPlanRecord {
  return {
    id,
    profile_id: "actor-1",
    name: id,
    description: null,
    structure: planStructure,
    gps_recording_enabled: false,
    structure_hash: `hash-${id}`,
    updated_at: new Date("2026-07-27T00:00:00.000Z"),
  };
}

function event(
  id: string,
  activityPlan: PlannedDaySummaryActivityPlanRecord | null,
  activityPlanId = activityPlan?.id ?? null,
): PlannedDaySummaryEventRecord {
  return {
    id,
    activity_plan_id: activityPlanId,
    activity_plan: activityPlan,
    starts_at: "2026-07-27T00:00:00.000Z",
  };
}

async function summarize(
  events: PlannedDaySummaryEventRecord[],
  estimates: Record<
    string,
    { estimated_duration: number | null; estimated_tss: number | null }
  > = {},
) {
  let readInput: PlannedDaySummaryReadInput | undefined;
  const result = await plannedDaySummaryUseCase({
    date: "2026-07-27",
    profileId: "actor-1",
    repository: {
      async listOwnedPlannedEventsForDay(input) {
        readInput = input;
        return events;
      },
    },
    deriveMetrics: async (plans) =>
      plans.map((plan) => ({
        ...plan,
        authoritative_metrics: estimates[plan.id] ?? {
          estimated_duration: 3600,
          estimated_tss: 72,
        },
      })),
  });
  return { readInput, result };
}

describe("plannedDaySummaryUseCase", () => {
  it("returns an honest empty-day summary and actor-scoped bounded read", async () => {
    const { readInput, result } = await summarize([]);

    expect(readInput).toEqual({
      date: "2026-07-27",
      limit: MAX_PLANNED_DAY_SUMMARY_EVENTS + 1,
      profileId: "actor-1",
    });
    expect(result).toEqual({
      summary: {
        eventCount: 0,
        activity_categories: [],
        totalDurationSeconds: 0,
        totalTss: 0,
      },
      source: {
        complete: true,
        eventCount: 0,
        unavailableEstimateCount: 0,
        unavailablePlanCount: 0,
        unlinkedPlanCount: 0,
      },
    });
  });

  it("aggregates two same-day Bike and Run plans with stable activity_categories and known values", async () => {
    const bike = plan("plan-bike", structure(["bike"]));
    const run = plan("plan-run", structure(["run"]));
    const { result } = await summarize([event("bike", bike), event("run", run)], {
      "plan-bike": { estimated_duration: 3600, estimated_tss: 80 },
      "plan-run": { estimated_duration: 1800, estimated_tss: 40 },
    });

    expect(result.summary).toEqual({
      eventCount: 2,
      activity_categories: ["bike", "run"],
      totalDurationSeconds: 5400,
      totalTss: 120,
    });
  });

  it("contributes a repeated same-category plan only once to activity_categories", async () => {
    const bike = plan("plan-bike", structure(["bike"]));
    const { result } = await summarize([event("bike-1", bike), event("bike-2", bike)]);

    expect(result.summary.activity_categories).toEqual(["bike"]);
    expect(result.summary.eventCount).toBe(2);
  });

  it("keeps aggregate estimates unknown rather than converting them to zero", async () => {
    const bike = plan("plan-bike", structure(["bike"]));
    const run = plan("plan-run", structure(["run"]));
    const { result } = await summarize([event("bike", bike), event("run", run)], {
      "plan-bike": { estimated_duration: null, estimated_tss: 80 },
      "plan-run": { estimated_duration: 1800, estimated_tss: null },
    });

    expect(result.summary.totalDurationSeconds).toBeNull();
    expect(result.summary.totalTss).toBeNull();
    expect(result.source.unavailableEstimateCount).toBe(2);
  });

  it("counts mixed stored plans as unavailable", async () => {
    const legacy = plan("plan-legacy", structure(["bike", "run"]));
    const { result } = await summarize([event("legacy", legacy)]);

    expect(result.summary).toMatchObject({
      eventCount: 1,
      activity_categories: [],
    });
  });

  it("counts unavailable, invalid, and unlinked plans without exposing issues", async () => {
    const invalid = plan("plan-invalid", { version: 3, segments: [] });
    const { result } = await summarize([
      event("unavailable", null, "deleted-plan"),
      event("invalid", invalid),
      event("unlinked", null),
    ]);

    expect(result.summary).toMatchObject({
      eventCount: 3,
      activity_categories: [],
      totalDurationSeconds: null,
      totalTss: null,
    });
    expect(result.source).toEqual({
      complete: true,
      eventCount: 3,
      unavailableEstimateCount: 3,
      unavailablePlanCount: 2,
      unlinkedPlanCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("issues");
  });

  it("uses scheduled and completed Events' planned estimates after the repository excludes cancelled Events", async () => {
    const bike = plan("plan-bike", structure(["bike"]));
    const run = plan("plan-run", structure(["run"]));
    const { result } = await summarize([event("scheduled", bike), event("completed", run)], {
      "plan-bike": { estimated_duration: 3600, estimated_tss: 80 },
      "plan-run": { estimated_duration: 1800, estimated_tss: 40 },
    });

    expect(result.summary).toMatchObject({
      eventCount: 2,
      totalDurationSeconds: 5400,
      totalTss: 120,
    });
  });

  it("rejects an over-limit day instead of truncating it", async () => {
    const events = Array.from({ length: MAX_PLANNED_DAY_SUMMARY_EVENTS + 1 }, (_, index) =>
      event(`event-${index}`, null),
    );

    await expect(summarize(events)).rejects.toBeInstanceOf(PlannedDaySummaryLimitExceededError);
  });
});
