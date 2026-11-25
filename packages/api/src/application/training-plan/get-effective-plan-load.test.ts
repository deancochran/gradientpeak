import {
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { activityPlanStructureSchema } from "@repo/core/activity-plan";
import { COMMON_RELATIVE_LOAD_MODEL, COMMON_RELATIVE_LOAD_VERSION } from "@repo/core/load";
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
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: id(3),
      name: "Steady",
      duration: { type: "time", seconds: 1800 },
      targets: [{ type: "RPE", intensity: 5 }],
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
  linkedCompletionSessions: [],
  linkedCompletionSessionsComplete: true,
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
  currentPlan: {
    id: id(4),
    name: "Current steady run",
    structure,
    updatedAt: "2026-07-20T12:00:00.000Z",
  },
  resolutionManifest: manifest,
  ...overrides,
});
function observationQuantification(activityId: string) {
  return createObservationQuantificationBundle({
    members: [
      quantifyCompletedActivityObservation({
        activityCategory: "run",
        source: {
          activityId,
          segmentId: `${activityId}:segment`,
          provider: null,
          externalId: null,
          artifactId: null,
          capability: "unknown",
          parserVersion: null,
          decodedContractVersion: null,
          materializerVersion: null,
          segmentsRevision: null,
          segmentRevision: null,
          summaryVersion: 1,
          sourceSessionIndex: null,
          sourceMessageIndex: null,
          rawType: null,
          rawSport: null,
          rawSubSport: null,
        },
        timing: {
          coverage: "complete",
          source: "unknown",
          basis: "unknown",
          startedAt: "2026-07-20T12:00:00.000Z",
          finishedAt: "2026-07-20T12:01:00.000Z",
          elapsedSeconds: 60,
          activeSeconds: 60,
          movingSeconds: 60,
        },
        distance: { meters: null, source: "unknown", basis: "unknown" },
        intensity: {
          averageHeartRateBpm: null,
          averagePowerWatts: null,
          averageSpeedMetersPerSecond: null,
          normalizedSpeedMetersPerSecond: null,
        },
        commonLoad: {
          status: "unavailable",
          model: COMMON_RELATIVE_LOAD_MODEL,
          version: COMMON_RELATIVE_LOAD_VERSION,
          activity_category: "run",
          method: null,
          quality: null,
          thresholdEvidence: null,
          evidenceFingerprint: null,
          computedAsOf: "2026-07-20T12:01:00.000Z",
          contributingDurationSeconds: 60,
          reason: "activity_data_missing",
        },
      }),
    ],
  });
}
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
  it("uses current activity-plan structure for scheduled and recommendation load", async () => {
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
      expect(result.remaining).toMatchObject({ status: "unavailable", reason: "no_load_data" });
      expect(result.effective).toMatchObject({
        firmItems: [
          {
            kind: "scheduled",
            scheduledItemId: id(6),
            date: "2026-07-22",
            commonLoad: { status: "unavailable", reason: "duration_missing" },
            resolutionManifest: { fingerprint: manifest.fingerprint },
          },
        ],
      });
      expect(result.recommendation.points).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ date: "2026-07-21", state: "unavailable" }),
        ]),
      );
    }
  });
  it("does not treat a missing current plan as an immutable-manifest fallback", async () => {
    analysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysis.buildActivityDerivedSummaries.mockResolvedValue({ parent: new Map(), segments: [] });
    const incomplete = session({
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: id(4),
        structure,
        demand: manifest.session_demand,
      }),
      currentPlan: null,
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
  it("refuses a null-start linked completion when profile-wide link facts are incomplete", async () => {
    const nullStartActivityId = id(8);
    const timestampedActivityId = id(9);
    const linked = session({
      completedActivityId: nullStartActivityId,
      id: id(10),
      lifecycleStatus: "completed" as const,
      planningDate: "2026-07-20",
    });
    analysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map([
        [
          timestampedActivityId,
          { observationQuantification: observationQuantification(timestampedActivityId) },
        ],
      ]),
      segments: [],
    });
    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:30:00.000Z"),
      db: {} as never,
      profileId: id(7),
      repository: {
        getEffectivePlanLoadInputs: vi.fn().mockResolvedValue({
          ...facts([linked]),
          activities: [
            {
              id: nullStartActivityId,
              profile_id: id(7),
              started_at: null,
              finished_at: null,
              elapsed_ms: null,
              active_ms: null,
              moving_ms: null,
              timing_coverage: "unavailable",
              distance_meters: null,
              avg_heart_rate: null,
              max_heart_rate: null,
            },
            {
              id: timestampedActivityId,
              profile_id: id(7),
              started_at: new Date("2026-07-20T12:00:00.000Z"),
              finished_at: new Date("2026-07-20T12:01:00.000Z"),
              elapsed_ms: 60_000,
              active_ms: 60_000,
              moving_ms: 60_000,
              timing_coverage: "complete",
              distance_meters: null,
              avg_heart_rate: null,
              max_heart_rate: null,
            },
          ],
          linkedCompletionSessions: [linked],
          linkedCompletionSessionsComplete: false,
          sourceCoverage: {
            activities: {
              startDate: "2026-07-20",
              endDate: "2026-07-26",
              status: "partial" as const,
            },
            scheduledItems: {
              startDate: "2026-07-20",
              endDate: "2026-07-26",
              status: "complete" as const,
            },
          },
        }),
      } as unknown as EventReadRepository,
      request: { startDate: "2026-07-20", endDate: "2026-07-26" },
    });

    expect(result).toMatchObject({
      status: "available",
      effective: {
        status: "available",
        firmItems: [
          expect.objectContaining({
            kind: "completed",
            completedActivityId: timestampedActivityId,
            date: "2026-07-20",
          }),
        ],
      },
    });
    if (result.status !== "available" || result.effective.status !== "available") {
      throw new Error("Expected available effective plan load");
    }
    expect(result.effective.firmItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ completedActivityId: nullStartActivityId }),
      ]),
    );
  });
});
