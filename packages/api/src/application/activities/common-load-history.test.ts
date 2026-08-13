import {
  createObservationQuantificationBundle,
  quantifyCompletedActivityObservation,
} from "@repo/core";
import { type CommonLoadResult, commonLoadHistoryResultSchema } from "@repo/core/load";
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
const CALCULATED_AS_OF = "2026-07-21T12:00:00.000Z";
const AS_OF = new Date(CALCULATED_AS_OF);
const EVIDENCE_SCOPE_FINGERPRINT = "common-load-history-test-scope";
const trustedSourceEvidence = {
  currentArtifactIds: [],
  providerReferences: [{ provider: "wahoo", externalId: "provider-activity" }],
} as const;
const activity = (id: string, startedAt: string) => ({
  id,
  started_at: new Date(startedAt),
  sourceEvidence: trustedSourceEvidence,
});
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

function completeSourceCoverage() {
  const succeededAt = new Date("2026-07-21T00:00:00.000Z");
  return {
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
  };
}

function availableLoad(
  input: {
    activity_category?: "bike" | "run";
    load?: number;
    duration?: number;
    fingerprint?: string;
    computedAsOf?: string;
  } = {},
): CommonLoadResult {
  const duration = input.duration ?? 3600;
  const load = input.load ?? 64;
  const activity_category = input.activity_category ?? "bike";
  const method = activity_category === "run" ? "run_pace_threshold" : "power_threshold";
  const thresholdEvidence =
    activity_category === "run"
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
    activity_category,
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
    evidenceFingerprint: input.fingerprint ?? `${activity_category}-activity-evidence`,
    computedAsOf: input.computedAsOf ?? "2026-07-20T12:00:00.000Z",
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
    activity_category: "bike",
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
  const quantification = quantifyCompletedActivityObservation({
    activityCategory: commonLoad.activity_category,
    source: {
      activityId,
      segmentId,
      provider: "wahoo",
      externalId: "provider-activity",
      artifactId: null,
      capability: "provider_summary",
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
      finishedAt: "2026-07-20T13:00:00.000Z",
      elapsedSeconds: 3600,
      activeSeconds: 3600,
      movingSeconds: 3600,
    },
    distance: { meters: null, source: "unknown", basis: "unknown" },
    intensity: {
      averageHeartRateBpm: null,
      averagePowerWatts: null,
      averageSpeedMetersPerSecond: null,
      normalizedSpeedMetersPerSecond: null,
    },
    commonLoad,
  });
  return {
    activity_id: activityId,
    segment_id: segmentId,
    activity_category: commonLoad.activity_category,
    common_load: commonLoad,
    observationQuantification: createObservationQuantificationBundle({
      members: [quantification],
    }),
    computed_as_of: "2026-07-20T12:00:00.000Z",
    dedupe_key: `segment-${segmentId}`,
    load_stream_key: null,
  };
}

function createDb(
  rows: unknown[],
  failure?: Error,
  source: {
    integrationRows?: unknown[];
    syncRows?: unknown[];
    artifactRows?: unknown[];
    sourceReferenceRows?: unknown[];
  } = {},
) {
  const whereClauses = new Map<string, unknown>();
  const db = {
    select: vi.fn(() => {
      let tableName = "";
      const rowsForTable = () => {
        if (tableName === "integrations") return source.integrationRows ?? [];
        if (tableName === "provider_sync_state") return source.syncRows ?? [];
        if (tableName === "activity_artifact_links") return source.artifactRows ?? [];
        if (tableName === "activity_source_references") {
          if (source.sourceReferenceRows) return source.sourceReferenceRows;
          return rows.flatMap((row) => {
            if (!row || typeof row !== "object" || !("id" in row)) return [];
            return [
              {
                activityId: String(Reflect.get(row, "id")),
                provider: "wahoo",
                externalId: "provider-activity",
              },
            ];
          });
        }
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
        innerJoin: vi.fn(() => query),
        orderBy: vi.fn(() => query),
        limit: vi.fn(async () => {
          if (failure && tableName === "activities") throw failure;
          return rowsForTable();
        }),
      };
      Object.defineProperty(query, "then", {
        value: (onFulfilled: (value: unknown[]) => unknown) =>
          Promise.resolve(rowsForTable()).then(onFulfilled),
      });
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

  it("does not treat the absence of a history source as known-zero evidence", async () => {
    const { db } = createDb([]);
    const result = await getCommonLoadHistory({
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(commonLoadHistoryResultSchema.parse(result)).toEqual(result);
    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "unavailable", observationReason: "source_incomplete" },
    });
  });

  it("abstains when provider coverage is incomplete", async () => {
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [],
    });
    const result = await getCommonLoadHistory({
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incomplete_observation",
      context: { observationState: "unavailable", observationReason: "source_incomplete" },
    });
    expect(analysis.buildActivitySegmentDerivedSummaries).not.toHaveBeenCalled();
  });

  it("accepts an up-to-date successful historical provider sync as complete source coverage", async () => {
    const { db } = createDb([], undefined, completeSourceCoverage());
    const request = {
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    };
    const result = await getCommonLoadHistory(request);
    const repeated = await getCommonLoadHistory(request);

    expect(result.status).toBe("available");
    if (result.status !== "available") throw new Error("Expected available history");
    expect(result.maturity).toMatchObject({ status: "mature", replayedDays: 168 });
    expect(result.points).toHaveLength(84);
    expect(repeated).toEqual(result);
  });

  it.each([
    ["date-only start", { start: "2026-01-01" }],
    ["normalized-invalid end", { end: "2026-07-32T00:00:00.000Z" }],
    ["normalized-invalid start", { start: "2026-02-30T00:00:00.000Z" }],
  ])("rejects metadata with a non-strict ISO offset datetime (%s)", async (_label, replacement) => {
    const coverage = completeSourceCoverage();
    const metadata = coverage.syncRows[0]?.metadata as {
      activityHistoryCoverage: { start: string; end: string };
    };
    Object.assign(metadata.activityHistoryCoverage, replacement);
    const { db } = createDb([], undefined, coverage);

    await expect(
      getCommonLoadHistory({
        asOf: AS_OF,
        db: db as never,
        profileId: PROFILE_ID,
        currentPlanningDate: CURRENT_DATE,
        planningTimezone: "UTC",
      }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
  });

  it("abstains when stale coverage has a current high-watermark", async () => {
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [
        {
          integrationId: "integration-1",
          lastSucceededAt: new Date("2026-07-01T00:00:00.000Z"),
          lastFailedAt: null,
          consecutiveFailures: 0,
          highWatermark: new Date("2026-07-21T00:00:00.000Z"),
          metadata: {
            activityHistoryCoverage: {
              start: "2026-01-01T00:00:00.000Z",
              end: "2026-07-21T00:00:00.000Z",
            },
          },
        },
      ],
    });

    await expect(
      getCommonLoadHistory({
        asOf: AS_OF,
        db: db as never,
        profileId: PROFILE_ID,
        currentPlanningDate: CURRENT_DATE,
        planningTimezone: "UTC",
      }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
  });

  it("abstains during an unresolved provider outage", async () => {
    const watermark = new Date("2026-07-21T00:00:00.000Z");
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "integration-1", provider: "wahoo" }],
      syncRows: [
        {
          integrationId: "integration-1",
          lastSucceededAt: watermark,
          lastFailedAt: new Date("2026-07-21T00:01:00.000Z"),
          consecutiveFailures: 1,
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

    await expect(
      getCommonLoadHistory({
        asOf: AS_OF,
        db: db as never,
        profileId: PROFILE_ID,
        currentPlanningDate: CURRENT_DATE,
        planningTimezone: "UTC",
      }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
  });

  it("does not let an unsupported integration stand in for history coverage", async () => {
    const { db } = createDb([], undefined, {
      integrationRows: [{ id: "zwift-1", provider: "zwift" }],
      syncRows: [],
    });
    const result = await getCommonLoadHistory({
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
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
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(result).toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
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
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "America/Los_Angeles",
    });

    expect(result).toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
  });

  it("aggregates cross-category activities on one observed day", () => {
    const observations = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      activities: [
        activity("bike", "2026-07-20T08:00:00.000Z"),
        activity("run", "2026-07-20T12:00:00.000Z"),
      ],
      segmentSummaries: [
        summary("bike", "bike-1", availableLoad({ activity_category: "bike", load: 64 })),
        summary("run", "run-1", availableLoad({ activity_category: "run", load: 36 })),
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

  it("fingerprints activity and threshold-source evidence independently without exposing row IDs", () => {
    const activities = [
      activity("private-activity-a", "2026-07-20T08:00:00.000Z"),
      activity("private-activity-b", "2026-07-20T12:00:00.000Z"),
    ];
    const observations = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
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

    const activityFingerprintChanged = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      activities,
      segmentSummaries: [
        summary(
          "private-activity-a",
          "private-segment-a",
          availableLoad({ fingerprint: "new-activity-evidence" }),
        ),
        summary("private-activity-b", "private-segment-b", availableLoad()),
      ],
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    }).at(-1);
    if (activityFingerprintChanged?.state !== "observed") throw new Error("Observed day expected");
    expect(activityFingerprintChanged.evidenceFingerprints).not.toEqual(day.evidenceFingerprints);

    const thresholdChangedLoad = availableLoad();
    if (thresholdChangedLoad.status !== "available") throw new Error("Available load expected");
    if (thresholdChangedLoad.thresholdEvidence === null) {
      throw new Error("Threshold evidence expected");
    }
    const changedThreshold = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
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

  it("groups cross-category segments into one multisport activity before daily aggregation", () => {
    const observations = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      activities: [activity("multi", "2026-07-20T08:00:00.000Z")],
      segmentSummaries: [
        summary("multi", "one", availableLoad({ load: 32, duration: 1800, fingerprint: "one" })),
        summary(
          "multi",
          "two",
          availableLoad({ activity_category: "run", load: 32, duration: 1800, fingerprint: "two" }),
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

  it("canonicalizes activity and segment ordering before daily aggregation", () => {
    const activities = [
      activity("bike", "2026-07-20T08:00:00.000Z"),
      activity("run", "2026-07-20T12:00:00.000Z"),
    ];
    const summaries = [
      summary("bike", "bike-1", availableLoad({ activity_category: "bike", load: 64 })),
      summary("run", "run-1", availableLoad({ activity_category: "run", load: 36 })),
    ];
    const build = (activityInput: typeof activities, summaryInput: typeof summaries) =>
      buildCommonLoadHistoryObservations({
        activities: activityInput,
        calculatedAsOf: CALCULATED_AS_OF,
        currentPlanningDate: CURRENT_DATE,
        evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
        planningTimezone: "UTC",
        segmentSummaries: summaryInput,
      });

    expect(build(activities, summaries)).toEqual(
      build([...activities].reverse(), [...summaries].reverse()),
    );
  });

  it("excludes a contribution calculated after the historical as-of instant", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [activity("later", "2026-07-20T08:00:00.000Z")],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [
        summary("later", "later-1", availableLoad({ computedAsOf: "2026-07-21T12:00:00.001Z" })),
      ],
    });

    expect(observations.at(-1)).toMatchObject({
      state: "unavailable",
      reason: "common_load_unavailable",
    });
  });

  it.each([
    ["partial", partialLoad()],
    ["unavailable", unavailableLoad()],
  ])("replays a known activity with %s common Load as a zero contribution", async (_status, load) => {
    const knownActivity = activity("incomplete", "2026-07-20T08:00:00.000Z");
    const { db } = createDb([knownActivity], undefined, completeSourceCoverage());
    const segmentSummary = summary("incomplete", "incomplete-1", load);
    analysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([segmentSummary]);
    const observations = buildCommonLoadHistoryObservations({
      activities: [knownActivity],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [segmentSummary],
    });
    const result = await getCommonLoadHistory({
      asOf: AS_OF,
      db: db as never,
      profileId: PROFILE_ID,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "UTC",
    });

    expect(observations.at(-1)).toMatchObject({
      state: "known_zero",
      coverageStatus: "partial",
    });
    expect(observations.at(-1)?.evidenceFingerprints).toHaveLength(1);
    expect(result).toMatchObject({ status: "available" });
    if (result.status !== "available") throw new Error("Expected available history");
    expect(result.points.at(-1)).toMatchObject({ date: "2026-07-20", dailyLoad: 0 });
  });

  it("keeps quantified contributions unchanged when another known activity has no complete Load", () => {
    const activities = [
      activity("quantified", "2026-07-20T08:00:00.000Z"),
      activity("known-zero", "2026-07-20T12:00:00.000Z"),
    ];
    const build = () =>
      buildCommonLoadHistoryObservations({
        activities,
        calculatedAsOf: CALCULATED_AS_OF,
        currentPlanningDate: CURRENT_DATE,
        evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
        planningTimezone: "UTC",
        segmentSummaries: [
          summary("quantified", "quantified-1", availableLoad({ load: 64 })),
          summary("known-zero", "known-zero-1", unavailableLoad()),
        ],
      }).at(-1);
    const day = build();

    expect(day).toMatchObject({
      state: "observed",
      coverageStatus: "partial",
      aggregate: { status: "complete", load: 64, totalActivityCount: 1 },
    });
    expect(day?.evidenceFingerprints).toHaveLength(2);
    expect(new Set(day?.evidenceFingerprints).size).toBe(2);
    expect(build()).toEqual(day);
    expect(day?.evidenceFingerprints.join(" ")).not.toMatch(/quantified|known-zero/);
  });

  it("preserves a missing activity-derived source result as unavailable", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [{ id: "missing", started_at: new Date("2026-07-20T08:00:00.000Z") }],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [],
    });

    expect(observations.at(-1)).toMatchObject({
      state: "unavailable",
      reason: "common_load_unavailable",
    });
  });

  it("zero-contributes a trusted known activity whose quantification is missing", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [activity("trusted-unquantified", "2026-07-20T08:00:00.000Z")],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [],
    });

    expect(observations.at(-1)).toMatchObject({
      state: "known_zero",
      coverageStatus: "partial",
    });
    expect(observations.at(-1)?.evidenceFingerprints).toHaveLength(1);
  });

  it.each([
    {
      label: "mixed artifact and provider evidence",
      sourceEvidence: {
        currentArtifactIds: ["artifact"],
        providerReferences: [{ provider: "wahoo", externalId: "provider-activity" }],
      },
    },
    {
      label: "multiple provider references",
      sourceEvidence: {
        currentArtifactIds: [],
        providerReferences: [
          { provider: "wahoo", externalId: "provider-activity" },
          { provider: "wahoo", externalId: "another-activity" },
        ],
      },
    },
  ])("fails closed for missing quantification with $label", ({ sourceEvidence }) => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [
        {
          id: "ambiguous-unquantified",
          started_at: new Date("2026-07-20T08:00:00.000Z"),
          sourceEvidence,
        },
      ],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [],
    });

    expect(observations.at(-1)).toMatchObject({
      state: "unavailable",
      reason: "common_load_unavailable",
    });
  });

  it("does not zero-contribute an untrusted activity even when derived Load is unavailable", () => {
    const observations = buildCommonLoadHistoryObservations({
      activities: [
        {
          id: "untrusted",
          started_at: new Date("2026-07-20T08:00:00.000Z"),
          sourceEvidence: { currentArtifactIds: [], providerReferences: [] },
        },
      ],
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries: [summary("untrusted", "untrusted-1", unavailableLoad())],
    });

    expect(observations.at(-1)).toMatchObject({
      state: "unavailable",
      reason: "common_load_unavailable",
    });
  });

  it("fails the persisted history read closed when an activity has no source reference", async () => {
    const knownActivity = activity("missing-source", "2026-07-20T08:00:00.000Z");
    const coverage = completeSourceCoverage();
    const { db } = createDb([knownActivity], undefined, {
      ...coverage,
      sourceReferenceRows: [],
    });
    analysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([
      summary("missing-source", "missing-source-1", unavailableLoad()),
    ]);

    await expect(
      getCommonLoadHistory({
        asOf: AS_OF,
        db: db as never,
        profileId: PROFILE_ID,
        currentPlanningDate: CURRENT_DATE,
        planningTimezone: "UTC",
      }),
    ).resolves.toMatchObject({ status: "unavailable", reason: "incomplete_observation" });
  });

  it("uses the athlete planning timezone at the UTC boundary and excludes the current day", () => {
    const activities = [
      activity("previous", "2026-07-20T00:30:00.000Z"),
      activity("current", "2026-07-21T18:00:00.000Z"),
    ];
    const segmentSummaries = [
      summary("previous", "previous-1", availableLoad()),
      summary("current", "current-1", availableLoad()),
    ];
    const observations = buildCommonLoadHistoryObservations({
      calculatedAsOf: CALCULATED_AS_OF,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      activities,
      segmentSummaries,
      currentPlanningDate: CURRENT_DATE,
      planningTimezone: "America/Los_Angeles",
    });
    const utc = buildCommonLoadHistoryObservations({
      activities,
      calculatedAsOf: CALCULATED_AS_OF,
      currentPlanningDate: CURRENT_DATE,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "UTC",
      segmentSummaries,
    });

    expect(observations.find((day) => day.date === "2026-07-19")?.state).toBe("observed");
    expect(observations.find((day) => day.date === "2026-07-20")?.state).toBe("known_zero");
    expect(utc.find((day) => day.date === "2026-07-20")?.state).toBe("observed");
    expect(observations.some((day) => day.date === CURRENT_DATE)).toBe(false);
  });

  it.each([
    {
      label: "spring-forward gap",
      currentPlanningDate: "2026-03-09",
      calculatedAsOf: "2026-03-09T12:00:00.000Z",
      instants: ["2026-03-08T09:30:00.000Z", "2026-03-08T10:30:00.000Z"],
      expectedDate: "2026-03-08",
    },
    {
      label: "fall-back repeated hour",
      currentPlanningDate: "2026-11-02",
      calculatedAsOf: "2026-11-02T12:00:00.000Z",
      instants: ["2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z"],
      expectedDate: "2026-11-01",
    },
  ])("groups both sides of the $label into one profile-local day", (fixture) => {
    const activities = fixture.instants.map((instant, index) => activity(`dst-${index}`, instant));
    const observations = buildCommonLoadHistoryObservations({
      activities,
      calculatedAsOf: fixture.calculatedAsOf,
      currentPlanningDate: fixture.currentPlanningDate,
      evidenceScopeFingerprint: EVIDENCE_SCOPE_FINGERPRINT,
      planningTimezone: "America/Los_Angeles",
      segmentSummaries: activities.map((activity, index) =>
        summary(
          activity.id,
          `dst-segment-${index}`,
          availableLoad({ computedAsOf: fixture.calculatedAsOf }),
        ),
      ),
    });

    expect(observations.find((day) => day.date === fixture.expectedDate)).toMatchObject({
      state: "observed",
      aggregate: { status: "complete", load: 128, totalActivityCount: 2 },
    });
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
      asOf: AS_OF,
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
    const { db, getWhereClause } = createDb([], undefined, completeSourceCoverage());
    const result = await getCommonLoadHistory({
      asOf: AS_OF,
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
