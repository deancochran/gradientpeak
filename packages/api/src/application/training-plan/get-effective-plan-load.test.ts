import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it, vi } from "vitest";
import type { EventReadRepository } from "../../repositories";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { getEffectivePlanLoad, getEffectivePlanLoadInputSchema } from "./get-effective-plan-load";

const analysis = vi.hoisted(() => ({
  buildActivityDerivedSummaries: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));
vi.mock("../../lib/activity-analysis", () => analysis);
const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: id(1),
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: id(2),
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Steady",
              duration: { type: "time", seconds: 1800 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});
const manifest = {
  ...createResolutionManifestFixture({
    activityPlanId: id(4),
    structure,
    demand: {
      activity_category: "run",
      training_intent: "general_maintenance",
      target_duration_minutes: 30,
      target_common_load: null,
      importance: "normal",
    },
  }),
  prescription_estimate: {
    duration: { status: "exact" as const, value_seconds: 1800 },
    common_load: { status: "complete" as const, value: 50 },
    rest_seconds: 0,
    has_open_completion: false,
    warnings: [],
    factors: [],
  },
};
const facts = (sessions: unknown[] = [], recommendationSessions: unknown[] = []) => ({
  activities: [],
  plannedSessions: sessions,
  recommendationPlannedSessions: recommendationSessions,
  recommendationSource: { status: "complete" as const, trainingPlanId: id(5) },
  planningTimezone: "UTC",
  resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
  sourceCounts: { activities: 0, plannedSessions: sessions.length },
  sourceCoverage: {
    activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" as const },
    scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" as const },
  },
});
const session = (overrides = {}) => ({
  id: id(6),
  planningDate: "2026-07-22",
  originalTargetDate: "2026-07-21",
  lifecycleStatus: "scheduled" as const,
  completedActivityId: null,
  source: { trainingPlanId: id(5), trainingPlanRevision: 2 },
  resolutionManifest: manifest,
  ...overrides,
});

describe("getEffectivePlanLoad", () => {
  it("requires paired bounded dates", () => {
    expect(getEffectivePlanLoadInputSchema.safeParse({ startDate: "2026-07-20" }).success).toBe(
      false,
    );
    expect(
      getEffectivePlanLoadInputSchema.safeParse({ startDate: "2026-07-20", endDate: "2026-07-26" })
        .success,
    ).toBe(true);
  });

  it("uses only immutable planned-session manifests for scheduled and recommendation load", async () => {
    analysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysis.buildActivityDerivedSummaries.mockResolvedValue({ parent: new Map(), segments: [] });
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue(facts([session()], [session()]));
    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: id(7),
      repository: { getEffectivePlanLoadInputs } as unknown as EventReadRepository,
      request: {},
    });
    expect(result.status).toBe("available");
    if (result.status === "available") {
      expect(result.remaining).toMatchObject({ status: "complete", load: 50 });
      expect(result.effective).toMatchObject({
        firmItems: [
          {
            kind: "scheduled",
            scheduledItemId: id(6),
            date: "2026-07-22",
            commonLoad: { status: "complete", load: 50 },
            resolutionManifest: { fingerprint: manifest.fingerprint },
          },
        ],
      });
      expect(result.recommendation.points).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ date: "2026-07-21", state: "complete", load: 50 }),
        ]),
      );
    }
  });

  it("reports unavailable scheduled load when the frozen manifest estimate is incomplete", async () => {
    analysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysis.buildActivityDerivedSummaries.mockResolvedValue({ parent: new Map(), segments: [] });
    const incomplete = session({
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: id(4),
        structure,
        demand: manifest.session_demand,
      }),
    });
    const result = await getEffectivePlanLoad({
      db: {} as never,
      profileId: id(7),
      repository: {
        getEffectivePlanLoadInputs: vi.fn().mockResolvedValue(facts([incomplete])),
      } as unknown as EventReadRepository,
      request: {},
    });
    expect(result).toMatchObject({
      status: "available",
      remaining: { status: "unavailable", reason: "no_load_data" },
    });
  });
});
