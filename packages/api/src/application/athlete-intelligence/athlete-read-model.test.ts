import {
  ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  athleteStateBaselineSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "@repo/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readAthleteObservationTimeline,
  readAthleteReadModelContextSources,
} from "../../repositories/athlete-read-model-repository";
import { getCommonLoadHistory } from "../activities/common-load-history";
import { athleteReadModelRequestSchema, readAthleteReadModel } from "./athlete-read-model";
import { readPublishedAthleteStateSnapshot } from "./published-athlete-state";

vi.mock("./published-athlete-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./published-athlete-state")>()),
  readPublishedAthleteStateSnapshot: vi.fn(),
}));
vi.mock("../activities/common-load-history", () => ({ getCommonLoadHistory: vi.fn() }));
vi.mock("../../repositories/athlete-read-model-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../repositories/athlete-read-model-repository")>()),
  readAthleteObservationTimeline: vi.fn(),
  readAthleteReadModelContextSources: vi.fn(),
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const computedAt = "2026-08-01T12:00:00.000Z";

function snapshot(freshness: "fresh" | "stale" = "fresh") {
  const baseline = athleteStateBaselineSchema.parse({
    contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    athleteId: profileId,
    stateRevision: 4,
    asOf: computedAt,
    longTermLoad: 40,
    recentLoad: 35,
    loadBalance: 5,
    evidenceConfidence: 0.8,
    capabilities: [],
    athleteAgeYears: null,
  });
  return {
    planningTimezone: "America/Los_Angeles",
    currentPlanningDate: "2026-08-01",
    freshness,
    rebuildStatus: freshness === "fresh" ? ("fresh" as const) : ("pending" as const),
    importStatus: "complete" as const,
    revisions: { source: freshness === "fresh" ? 4 : 5, published: 4 },
    coverage: { startAt: null, endAt: computedAt, lastActivityAt: computedAt },
    computedAt,
    algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
    baseline,
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(computedAt, profileId),
    estimates: [],
  };
}

describe("AthleteReadModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readPublishedAthleteStateSnapshot).mockResolvedValue(snapshot());
    vi.mocked(readAthleteReadModelContextSources).mockResolvedValue({
      profile: {
        id: profileId,
        dob: null,
        gender: null,
        planningTimezone: "America/Los_Angeles",
        preferredUnits: "metric",
      },
      observations: [
        {
          metric_type: "weight_kg",
          value: 70,
          unit: "kg",
          recorded_at: new Date(computedAt),
          notes: null,
          reference_activity_id: null,
          source: "manual",
          method: "manual_entry",
          calculation_version: null,
          quality_score: null,
          provenance: null,
        },
        {
          metric_type: "max_hr",
          value: 199,
          unit: "bpm",
          recorded_at: new Date(computedAt),
          notes: null,
          reference_activity_id: null,
          source: "manual",
          method: "manual_entry",
          calculation_version: null,
          quality_score: null,
          provenance: null,
        },
      ],
      observationsTruncated: false,
    });
    vi.mocked(readAthleteObservationTimeline).mockResolvedValue({ items: [], truncated: false });
    vi.mocked(getCommonLoadHistory).mockResolvedValue({
      status: "unavailable",
      policyVersion: "common_load_history_v1",
      reason: "insufficient_history",
      context: { requiredDays: 84, receivedDays: 0 },
    });
  });

  it("returns only requested sections and keys load history to the published revision", async () => {
    const result = await readAthleteReadModel({
      db: {} as never,
      profileId,
      now: new Date("2026-08-01T14:00:00.000Z"),
      sections: { status: true, loadHistory: true },
    });

    expect(result).toMatchObject({
      contractVersion: "athlete-read-model-v1",
      publishedRevision: 4,
      status: { freshness: "fresh", sourceRevision: 4, publishedRevision: 4 },
      loadHistory: {
        publishedRevision: 4,
        algorithmVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
      },
    });
    expect(result).not.toHaveProperty("publishedState");
    expect(result).not.toHaveProperty("currentBaseline");
  });

  it("does not expose raw evidence as load history while publication is stale", async () => {
    vi.mocked(readPublishedAthleteStateSnapshot).mockResolvedValue(snapshot("stale"));
    const result = await readAthleteReadModel({
      db: {} as never,
      profileId,
      sections: { status: true, loadHistory: true },
    });

    expect(result.loadHistory).toBeNull();
    expect(getCommonLoadHistory).not.toHaveBeenCalled();
  });

  it("uses observations for body context but not as current threshold or calibration authority", async () => {
    const result = await readAthleteReadModel({
      db: {} as never,
      profileId,
      sections: { currentBaseline: { includePlanningContext: true } },
    });

    expect(result.currentBaseline?.planningContext?.body.weightKg.value).toBe(70);
    expect(result.currentBaseline?.planningContext?.physiology.maxHeartRateBpm.value).toBeNull();
    expect(result.currentBaseline?.planningContext?.efforts).toEqual([]);
  });

  it("uses the performance-target cutoff when building a current planning context", async () => {
    const targetAsOf = "2026-08-01T14:00:00.000Z";
    const published = snapshot();
    published.performanceTargets = createUnavailableAthletePerformanceTargetFacts(
      targetAsOf,
      profileId,
    );
    vi.mocked(readPublishedAthleteStateSnapshot).mockResolvedValue(published);

    const result = await readAthleteReadModel({
      db: {} as never,
      profileId,
      now: new Date(targetAsOf),
      sections: { currentBaseline: { includePlanningContext: true } },
    });

    expect(result.currentBaseline?.planningContext?.evidence.asOf).toBe(targetAsOf);
    expect(readAthleteReadModelContextSources).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ profileId, asOf: new Date(targetAsOf) }),
    );
  });

  it("rejects unbounded timelines and analytics ranges", () => {
    const startAt = "2025-01-01T00:00:00.000Z";
    const endAt = "2026-08-01T00:00:00.000Z";
    expect(
      athleteReadModelRequestSchema.safeParse({
        profileId,
        sections: { profileObservations: { startAt, endAt, limit: 200 } },
      }).success,
    ).toBe(false);
    expect(
      athleteReadModelRequestSchema.safeParse({
        profileId,
        sections: { activityAnalytics: { startAt, endAt } },
      }).success,
    ).toBe(false);
  });
});
