import {
  COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  type CommonLoadResult,
  commonLoadHistoryResultSchema,
} from "@repo/core/load";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentDerivedSummary } from "../../lib/activity-analysis";

const analysis = vi.hoisted(() => ({
  buildActivitySegmentDerivedSummaries: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));

vi.mock("../../lib/activity-analysis", async (importActual) => ({
  ...(await importActual<typeof import("../../lib/activity-analysis")>()),
  ...analysis,
}));

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: vi.fn(() => ({ kind: "activity-analysis-store" })),
}));

import {
  buildCommonLoadHistoryObservations,
  commonLoadHistoryActivityLimit,
  getCommonLoadHistory,
} from "./common-load-history";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const CURRENT_DATE = "2026-07-21";
const quality = {
  source: "manual",
  observed_at: "2026-01-01T00:00:00.000Z",
  valid_at: "2026-01-01T00:00:00.000Z",
  confidence: "high",
  stale: false,
  estimate: false,
  calculation_version: "1",
  evidence_fingerprint: "threshold-evidence",
} as const;

function availableLoad(
  input: { sport?: "bike" | "run"; load?: number; duration?: number; fingerprint?: string } = {},
): CommonLoadResult {
  const duration = input.duration ?? 3600;
  const load = input.load ?? 64;
  const sport = input.sport ?? "bike";
  const method = sport === "run" ? "run_pace_threshold" : "power_threshold";
  const thresholdEvidence =
    sport === "run"
      ? {
          type: "threshold_speed_mps" as const,
          value: 4,
          unit: "meters_per_second" as const,
        }
      : { type: "ftp_watts" as const, value: 250, unit: "watts" as const };
  return {
    status: "available",
    model: "gradientpeak_relative_load",
    version: "1",
    sport,
    method,
    load,
    intensity: Math.sqrt(load / (100 * (duration / 3600))),
    contributingDurationSeconds: duration,
    quality,
    thresholdEvidence: {
      ...thresholdEvidence,
      source: "manual",
      observedAt: "2026-01-01T00:00:00.000Z",
      validAt: "2026-01-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "1",
      sourceFingerprint: "threshold-evidence",
    },
    evidenceFingerprint: input.fingerprint ?? `${sport}-activity-evidence`,
    computedAsOf: "2026-07-20T12:00:00.000Z",
    estimated: false,
  };
}

function partialLoad(): CommonLoadResult {
  const base = availableLoad({ load: 32, duration: 1800 });
  if (base.status !== "available") throw new Error("Available fixture expected");
  const { estimated: _estimated, status: _status, ...shared } = base;
  return {
    ...shared,
    status: "partial",
    eligibleDurationSeconds: 3600,
    sourceTimeCoverage: 0.5,
    reason: "duration_partial",
  };
}

function unavailableLoad(): CommonLoadResult {
  return {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    sport: "bike",
    method: "power_threshold",
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-07-20T12:00:00.000Z",
    contributingDurationSeconds: 3600,
    reason: "threshold_missing",
  };
}

function summary(
  activityId: string,
  segmentId: string,
  commonLoad: CommonLoadResult,
): SegmentDerivedSummary {
  return {
    activity_id: activityId,
    segment_id: segmentId,
    category: commonLoad.sport,
    tss: null,
    tss_identity: null,
    intensity_factor: null,
    method: null,
    unavailable_reason: null,
    calibration_quality: null,
    common_load: commonLoad,
    computed_as_of: "2026-07-20T12:00:00.000Z",
    dedupe_key: `segment-${segmentId}`,
    load_stream_key: null,
  };
}

function createDb(
  rows: unknown[],
  failure?: Error,
  source: { integrationRows?: unknown[]; syncRows?: unknown[] } = {},
) {
  const whereClauses = new Map<string, unknown>();
  const db = {
    select: vi.fn(() => {
      let tableName = "";
      const rowsForTable = () => {
        if (tableName === "integrations") return source.integrationRows ?? [];
        if (tableName === "provider_sync_state") return source.syncRows ?? [];
        return rows;
      };
      const query = {
        from: vi.fn((table: Parameters<typeof getTableName>[0]) => {
          tableName = getTableName(table);
          return query;
        }),
        where: vi.fn((condition: unknown) => {
          whereClauses.set(tableName, condition);
          return query;
        }),
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => {
          if (failure && tableName === "activities") throw failure;
          return rowsForTable();
        }),
        then: (onFulfilled: (value: unknown[]) => unknown) =>
          Promise.resolve(rowsForTable()).then(onFulfilled),
      };
      return query;
    }),
    transaction: vi.fn(async (callback: (transaction: typeof db) => Promise<unknown>) =>
      callback(db),
    ),
  };
  return {
    db,
    getWhereClause: () => whereClauses.get("activities"),
  };
}

describe("common Load history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    analysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([]);
  });

  it("replays exactly 84 explicit known-zero complete days through the Core output schema", async () => {
    const { db } = createDb([]);
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(commonLoadHistoryResultSchema.parse(result)).toEqual(result);
    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Available history expected");
    expect(result.points).toHaveLength(COMMON_LOAD_HISTORY_REQUIRED_DAYS);
    expect(result.points.every((point) => point.dailyLoad === 0)).toBe(true);
    expect(result.points.at(-1)?.date).toBe("2026-07-20");
  });

  it("retains partial history when provider coverage is incomplete", async () => {
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [],
    });
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject({ status: "available", coverageStatus: "partial" });
    expect(analysis.buildActivitySegmentDerivedSummaries).toHaveBeenCalledOnce();
  });

  it("accepts an up-to-date successful historical provider sync as complete source coverage", async () => {
    const succeededAt = new Date("2026-07-21T00:00:00.000Z");
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [
        {
          integrationId: "integration-1",
          lastSucceededAt: succeededAt,
          lastFailedAt: null,
          consecutiveFailures: 0,
          highWatermark: succeededAt,
          metadata: {
            activityHistoryCoverage: {
              start: "2026-01-01T00:00:00.000Z",
              end: "2026-07-21T00:00:00.000Z",
            },
          },
        },
      ],
    });
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result.status).toBe("available");
  });

  it("ignores integrations that do not support activity history sync", async () => {
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "zwift-1", provider: "zwift" }],
      syncRows: [],
    });
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result.status).toBe("available");
  });

  it("requires provider coverage to span the complete history window", async () => {
    const succeededAt = new Date("2026-07-21T00:00:00.000Z");
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [
        {
          integrationId: "integration-1",
          lastSucceededAt: succeededAt,
          lastFailedAt: null,
          consecutiveFailures: 0,
          highWatermark: succeededAt,
          metadata: {
            activityHistoryCoverage: {
              start: "2026-07-01T00:00:00.000Z",
              end: "2026-07-21T00:00:00.000Z",
            },
          },
        },
      ],
    });
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject({ status: "available", coverageStatus: "partial" });
  });

  it("checks provider coverage against profile-local rather than UTC day boundaries", async () => {
    const watermark = new Date("2026-07-21T00:00:00.000Z");
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [
        {
          integrationId: "integration-1",
          lastSucceededAt: watermark,
          lastFailedAt: null,
          consecutiveFailures: 0,
          highWatermark: watermark,
          metadata: {
            activityHistoryCoverage: {
              start: "2026-01-01T00:00:00.000Z",
              end: watermark.toISOString(),
            },
          },
        },
      ],
    });
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "America/Los_Angeles",
    });

    expect(result).toMatchObject({ status: "available", coverageStatus: "partial" });
  });

  it("aggregates cross-sport activities on one observed day", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [
        { id: "bike", started_at: new Date("2026-07-20T08:00:00.000Z") },
        { id: "run", started_at: new Date("2026-07-20T12:00:00.000Z") },
      ],
      segmentSummaries: [
        summary("bike", "bike-1", availableLoad({ sport: "bike", load: 64 })),
        summary("run", "run-1", availableLoad({ sport: "run", load: 36 })),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });
    const day = observations.at(-1);

    expect(day).toMatchObject({
      state: "observed",
      aggregate: { status: "complete", load: 100, totalActivityCount: 2 },
    });
  });

  it("namespaces repeated threshold evidence per contribution without exposing row IDs", () => {
    const activities = [
      { id: "private-activity-a", started_at: new Date("2026-07-20T08:00:00.000Z") },
      { id: "private-activity-b", started_at: new Date("2026-07-20T12:00:00.000Z") },
    ];
    const observations = buildCommonLoadHistoryObservations({
      activities,
      segmentSummaries: [
        summary("private-activity-a", "private-segment-a", availableLoad()),
        summary("private-activity-b", "private-segment-b", availableLoad()),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });
    const day = observations.at(-1);
    if (day?.state !== "observed") throw new Error("Observed day expected");
    expect(new Set(day.evidenceFingerprints).size).toBe(2);
    expect(day.evidenceFingerprints.join(" ")).not.toMatch(/private-(activity|segment)/);

    const changed = buildCommonLoadHistoryObservations({
      activities,
      segmentSummaries: [
        summary("private-activity-a", "private-segment-a", availableLoad({ load: 36 })),
        summary("private-activity-b", "private-segment-b", availableLoad()),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    }).at(-1);
    if (changed?.state !== "observed") throw new Error("Observed day expected");
    expect(changed.evidenceFingerprints).not.toEqual(day.evidenceFingerprints);

    const thresholdChangedLoad = availableLoad();
    if (thresholdChangedLoad.status !== "available") throw new Error("Available load expected");
    const changedThreshold = buildCommonLoadHistoryObservations({
      activities,
      segmentSummaries: [
        summary("private-activity-a", "private-segment-a", {
          ...thresholdChangedLoad,
          thresholdEvidence: {
            ...thresholdChangedLoad.thresholdEvidence,
            sourceFingerprint: "new-threshold",
          },
        }),
        summary("private-activity-b", "private-segment-b", availableLoad()),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    }).at(-1);
    expect(changedThreshold?.evidenceFingerprints).not.toEqual(day.evidenceFingerprints);
  });

  it("groups cross-sport segments into one multisport activity before daily aggregation", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [{ id: "multi", started_at: new Date("2026-07-20T08:00:00.000Z") }],
      segmentSummaries: [
        summary("multi", "one", availableLoad({ load: 32, duration: 1800, fingerprint: "one" })),
        summary(
          "multi",
          "two",
          availableLoad({ sport: "run", load: 32, duration: 1800, fingerprint: "two" }),
        ),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(observations.at(-1)).toMatchObject({
      state: "observed",
      aggregate: {
        status: "complete",
        load: 64,
        totalActivityCount: 1,
        contributingActivityCount: 1,
      },
    });
  });

  it.each([
    ["partial", partialLoad()],
    ["unavailable", unavailableLoad()],
  ])("keeps %s common results distinct from zero", async (status, load) => {
    const activity = { id: "incomplete", started_at: new Date("2026-07-20T08:00:00.000Z") };
    const { db } = createDb([activity]);
    analysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([
      summary("incomplete", "incomplete-1", load),
    ]);
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject(
      status === "partial"
        ? { status: "available", coverageStatus: "partial" }
        : { status: "unavailable", reason: "incomplete_observation" },
    );
  });

  it("assigns dates in the requested planning timezone and excludes the current day", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [
        { id: "previous", started_at: new Date("2026-07-20T00:30:00.000Z") },
        { id: "current", started_at: new Date("2026-07-21T18:00:00.000Z") },
      ],
      segmentSummaries: [
        summary("previous", "previous-1", availableLoad()),
        summary("current", "current-1", availableLoad()),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "America/Los_Angeles",
    });

    expect(observations.find((day) => day.date === "2026-07-19")?.state).toBe("observed");
    expect(observations.find((day) => day.date === "2026-07-20")?.state).toBe("known_zero");
    expect(observations.some((day) => day.date === CURRENT_DATE)).toBe(false);
  });

  it("returns unavailable on query failure or limit truncation", async () => {
    const failed = createDb([], new Error("query failed"));
    const truncated = createDb(
      Array.from({ length: commonLoadHistoryActivityLimit + 1 }, (_, index) => ({
        id: `activity-${index}`,
        started_at: new Date("2026-07-20T08:00:00.000Z"),
      })),
    );
    const request = {
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    };

    await expect(
      getCommonLoadHistory({ db: failed.db as never, ...request }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
    await expect(
      getCommonLoadHistory({ db: truncated.db as never, ...request }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
    expect(analysis.buildActivitySegmentDerivedSummaries).not.toHaveBeenCalled();
  });

  it("scopes the bounded read to the authenticated profile without exposing its ID", async () => {
    const { db, getWhereClause } = createDb([]);
    const result = await getCommonLoadHistory({
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });
    const query = new PgDialect().sqlToQuery(getWhereClause() as never);

    expect(query.sql).toContain('"activities"."profile_id" = $1');
    expect(query.params).toContain(PROFILE_ID);
    expect(JSON.stringify(result)).not.toContain(PROFILE_ID);
  });
});
