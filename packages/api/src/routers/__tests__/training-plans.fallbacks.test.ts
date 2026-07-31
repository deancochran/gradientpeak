import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryMapDbMock } from "../../test/mock-query-db";

vi.mock("../../utils/activity-plan-derived-metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/activity-plan-derived-metrics")>()),
  getActivityPlansDerivedMetrics: vi.fn(async (plans: any[]) =>
    plans.map((plan) => ({
      ...plan,
      authoritative_metrics: { estimated_tss: plan.structure?.mock_estimated_tss ?? 70 },
      counts_toward_aggregation: !(plan.structure?.shouldThrow ?? false),
    })),
  ),
}));

import { getPlanTabProjectionService } from "../planning/training-plans/base";

const plan = {
  id: "11111111-1111-4111-8111-111111111111",
  profile_id: "profile-123",
  structure: {
    id: "11111111-1111-4111-8111-111111111111",
    version: 1,
    activity_category: ["run"],
    sessions: [{ offset_days: 0, activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
  },
};

function fixtureDb(events: unknown[] = []) {
  return createQueryMapDbMock({
    training_plans: { data: plan, error: null },
    profile_goals: { data: [], error: null },
    profile_training_settings: { data: null, error: null },
    profiles: { data: [{ dob: null, gender: null }], error: null },
    activities: { data: [], error: null },
    activity_efforts: { data: [], error: null },
    profile_metrics: { data: [], error: null },
    activity_segments: { data: [], error: null },
    activity_plans: { data: [], error: null },
    events: { data: events, error: null },
  }).db;
}

describe("training plan projection repository fixtures", () => {
  beforeEach(() => vi.useFakeTimers());

  it("preserves conservative no-history guidance through the Drizzle path", async () => {
    vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));
    const result = await getPlanTabProjectionService({
      db: fixtureDb() as any,
      profileId: "profile-123",
      store: { getContextSnapshot: async () => ({}) } as any,
      input: {
        training_plan_id: plan.id,
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.recommended_load_tss)).toEqual([20, 20, 20]);
    expect(result.load_guidance.weekly_cap_tss).toBe(140);
  });

  it("preserves scoped scheduled load through the repository projection", async () => {
    const result = await getPlanTabProjectionService({
      db: fixtureDb([
        {
          profile_id: "profile-123",
          event_type: "planned",
          training_plan_id: plan.id,
          starts_at: "2026-01-02T00:00:00.000Z",
          scheduled_date: "2026-01-02",
          activity_plan: { id: "plan-a", structure: { mock_estimated_tss: 42 } },
        },
      ]) as any,
      profileId: "profile-123",
      store: { getContextSnapshot: async () => ({}) } as any,
      input: {
        training_plan_id: plan.id,
        start_date: "2026-01-01",
        end_date: "2026-01-03",
        timezone: "UTC",
      },
    });

    expect(result.timeline.map((point) => point.scheduled_load_tss)).toEqual([0, 42, 0]);
    expect(result.timeline.map((point) => point.tentative_scheduled_load_tss)).toEqual([0, 0, 0]);
  });
});
