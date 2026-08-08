import {
  calculateAerobicDecoupling,
  calculateCyclingNormalizedPower,
  calculateEfficiencyFactor,
  calculateRunningNormalizedGradedPace,
} from "@repo/core/calculations";
import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityFileIngestions,
  activitySegments,
  activitySourceReferences,
  profileMetrics,
} from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import { materializeActivityAthleteStateEvidence } from "../athlete-intelligence/athlete-state-evidence";
import type { GeneratedActivityLthrEvidence } from "./reconcile-activity-evidence";
import {
  type ActivitySubmission,
  canCanonicalEvidenceReplace,
  MATERIALIZER_VERSION,
  manualImportActivityId,
  providerActivityId,
  providerProjectionDecision,
  recordingSessionActivityId,
  submitActivity,
} from "./submit-activity";

vi.mock("../athlete-intelligence/athlete-state-evidence", () => ({
  materializeActivityAthleteStateEvidence: vi.fn().mockResolvedValue({
    commonLoad: null,
    confidence: null,
    effectiveAt: null,
    materialChanged: false,
  }),
}));

describe("recordingSessionActivityId", () => {
  it("returns a stable profile-scoped UUID", () => {
    const first = recordingSessionActivityId("profile-1", "session-1");

    expect(first).toBe(recordingSessionActivityId("profile-1", "session-1"));
    expect(first).not.toBe(recordingSessionActivityId("profile-2", "session-1"));
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("providerActivityId", () => {
  it("is stable for exact redelivery and scoped by provider identity", () => {
    const id = providerActivityId("profile-1", "wahoo", "external-1");
    expect(id).toBe(providerActivityId("profile-1", "wahoo", "external-1"));
    expect(id).not.toBe(providerActivityId("profile-1", "wahoo", "external-2"));
  });
});

describe("manualImportActivityId", () => {
  it("is stable for a profile-scoped artifact digest", () => {
    const digest = "a".repeat(64);
    expect(manualImportActivityId("profile-1", digest)).toBe(
      manualImportActivityId("profile-1", digest),
    );
    expect(manualImportActivityId("profile-1", digest)).not.toBe(
      manualImportActivityId("profile-2", digest),
    );
  });
});

describe("providerProjectionDecision", () => {
  const versions = {
    existingParserVersion: "canonical-submission-v1",
    existingDecodedVersion: "decoded-activity-artifact-v1",
    existingMaterializerVersion: MATERIALIZER_VERSION,
  };

  it("makes exact redelivery a no-op and rejects out-of-order provider payloads", () => {
    const existingProviderUpdatedAt = new Date("2026-07-17T12:00:00Z");
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt,
        incomingProviderUpdatedAt: existingProviderUpdatedAt,
        existingDigest: "a".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("exact-redelivery");
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt,
        incomingProviderUpdatedAt: new Date("2026-07-17T11:59:59Z"),
        existingDigest: "b".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("stale");
  });

  it("applies changed bytes only for a newer provider revision", () => {
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        incomingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        existingDigest: "b".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("conflict");
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        incomingProviderUpdatedAt: new Date("2026-07-17T12:00:01Z"),
        existingDigest: "b".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("apply");
  });

  it("reconciles a newer provider revision even when its artifact bytes are unchanged", () => {
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        incomingProviderUpdatedAt: new Date("2026-07-17T12:00:01Z"),
        existingDigest: "a".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("apply");
  });

  it.each([
    ["parser", { existingParserVersion: "canonical-submission-v0" }],
    ["decoded contract", { existingDecodedVersion: "decoded-activity-artifact-v0" }],
    ["materializer", { existingMaterializerVersion: "activity-segments-v1" }],
  ])("rejects a stale %s marker before exact redelivery", (_marker, staleVersion) => {
    const revision = new Date("2026-07-17T12:00:00Z");
    expect(
      providerProjectionDecision({
        ...versions,
        ...staleVersion,
        existingProviderUpdatedAt: revision,
        incomingProviderUpdatedAt: revision,
        existingDigest: "a".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("unsupported-persisted-version");
  });

  it("keeps current identical redelivery idempotent", () => {
    expect(
      providerProjectionDecision({
        ...versions,
        existingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        incomingProviderUpdatedAt: new Date("2026-07-17T12:00:00Z"),
        existingDigest: "a".repeat(64),
        incomingDigest: "a".repeat(64),
      }),
    ).toBe("exact-redelivery");
  });
});

describe("canonical activity evidence priority", () => {
  it("orders FIT above raw samples, provider summaries, and inferred fallback", () => {
    expect(canCanonicalEvidenceReplace("fit_artifact", "raw_samples")).toBe(false);
    expect(canCanonicalEvidenceReplace("raw_samples", "provider_summary")).toBe(false);
    expect(canCanonicalEvidenceReplace("provider_summary", "inferred_fallback")).toBe(false);
    expect(canCanonicalEvidenceReplace("provider_summary", "fit_artifact")).toBe(true);
    expect(canCanonicalEvidenceReplace("raw_samples", "raw_samples")).toBe(true);
  });
});

type DbClient = ReturnType<typeof getRequiredDb>;
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });
const segmentSet = {
  version: 1 as const,
  elapsedMs: 3_600_000,
  segments: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ordinal: 0,
      role: "activity" as const,
      activity_category: "bike" as const,
      startOffsetMs: 0,
      endOffsetMs: 3_600_000,
      summary: {
        version: 1 as const,
        timing: { timingCoverage: "unavailable" as const },
        normalizedPowerResult: unavailableNormalizedPowerResult,
      },
    },
  ],
};

function detectedLthr(valueBpm: number): GeneratedActivityLthrEvidence {
  const recordedAt = new Date("2026-01-01T11:00:00Z");
  return {
    valueBpm,
    recordedAt,
    calculationVersion: "activity-file-lthr-v1",
    provenance: {
      activity_id: "activity-1",
      segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      derived_from: "activity_file_best_effort",
      source_series: "heart_rate",
      source_effort_calculation_version: "best-effort-extraction-v1",
      exact_window_start_timestamp_seconds: recordedAt.getTime() / 1_000 - 1_200,
      exact_window_end_timestamp_seconds: recordedAt.getTime() / 1_000,
      duration_seconds: 1_200,
      window_coverage: 1,
      extraction_status: "available",
      extraction_reason: null,
    },
  };
}
interface MockTx {
  execute(query: unknown): Promise<unknown>;
  select(): {
    from(table: unknown): MockSelectBuilder;
  };
  insert(table: unknown): {
    values(values: unknown): {
      onConflictDoUpdate(input: unknown): { returning(fields?: unknown): Promise<unknown[]> };
      onConflictDoNothing(): { returning(fields?: unknown): Promise<unknown[]> };
    };
  };
  update(table: unknown): {
    set(values: unknown): {
      where(
        condition: unknown,
      ): PromiseLike<unknown> & { returning(fields?: unknown): Promise<unknown[]> };
    };
  };
  delete(table: unknown): { where(condition: unknown): Promise<void> };
}

interface MockSelectBuilder extends PromiseLike<unknown[]> {
  for(mode: "share" | "update"): MockSelectBuilder;
  innerJoin(table: unknown, condition: unknown): MockSelectBuilder;
  leftJoin(table: unknown, condition: unknown): MockSelectBuilder;
  limit(count: number): MockSelectBuilder;
  orderBy(...order: unknown[]): MockSelectBuilder;
  where(condition: unknown): MockSelectBuilder;
}

function createDb(
  failOn?: unknown,
  existingActivity: unknown = {
    id: "activity-1",
    profile_id: "profile-1",
    activity_plan_id: "plan-1",
    name: "Recorded",
    notes: null,
    started_at: new Date(),
    finished_at: new Date(),
    elapsed_ms: 60_000,
    active_ms: 60_000,
    moving_ms: 60_000,
    timing_coverage: "complete",
    segments_revision: 1,
    canonical_evidence_tier: "provider_summary",
    content_visibility: "private",
    athlete_state_common_load: null,
    athlete_state_activity_category: null,
    athlete_state_evidence_confidence: null,
    athlete_state_capability_distance_meters: null,
    athlete_state_capability_duration_minutes: null,
    athlete_state_input_version: null,
    athlete_state_computed_at: null,
  },
) {
  const committed: unknown[] = [];
  const insertedValues: Array<{ table: unknown; values: unknown }> = [];
  const updatedValues: Array<{ table: unknown; values: unknown }> = [];
  let activityRow = existingActivity;
  let segmentRows: unknown[] = [];
  const transaction = vi.fn(async (callback: (tx: MockTx) => Promise<unknown>) => {
    const staged: unknown[] = [];
    const selectBuilder = (rows: unknown[]) => {
      let builder: MockSelectBuilder;
      builder = Object.assign(Promise.resolve(rows), {
        for: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        leftJoin: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        where: vi.fn(() => builder),
      });
      return builder;
    };
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) =>
          selectBuilder(
            table === activities && activityRow
              ? [activityRow]
              : table === activitySegments
                ? segmentRows
                : [],
          ),
        ),
      })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          if (table === failOn) throw new Error("write failed");
          staged.push(table);
          insertedValues.push({ table, values });
          if (table === activities)
            activityRow = {
              athlete_state_common_load: null,
              athlete_state_activity_category: null,
              athlete_state_evidence_confidence: null,
              athlete_state_capability_distance_meters: null,
              athlete_state_capability_duration_minutes: null,
              athlete_state_input_version: null,
              athlete_state_computed_at: null,
              ...(values as object),
            };
          if (table === activitySegments) segmentRows = Array.isArray(values) ? values : [values];
          const conflictResult = {
            returning: vi.fn().mockResolvedValue(
              table === activitySourceReferences
                ? [
                    {
                      activityId: (values as { activity_id: string }).activity_id,
                    },
                  ]
                : [{ id: "persisted-id", sourceRevision: 1 }],
            ),
          };
          return {
            onConflictDoUpdate: vi.fn(() => conflictResult),
            onConflictDoNothing: vi.fn(() => conflictResult),
            returning: vi.fn().mockResolvedValue([{ id: "persisted-id" }]),
          };
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: unknown) => ({
          where: vi.fn(() => {
            updatedValues.push({ table, values });
            if (table === activities && activityRow)
              activityRow = { ...(activityRow as object), ...(values as object) };
            if (table === failOn) throw new Error("write failed");
            staged.push(table);
            const result = Promise.resolve(undefined);
            return Object.assign(result, {
              returning: vi.fn().mockResolvedValue([{ id: "activity-1" }]),
            });
          }),
        })),
      })),
      delete: vi.fn((table: unknown) => ({
        where: vi.fn(async () => {
          if (table === failOn) throw new Error("write failed");
          staged.push(table);
        }),
      })),
    };
    const result = await callback(tx);
    committed.push(...staged);
    return result;
  });
  return {
    db: { transaction } as unknown as DbClient,
    committed,
    insertedValues,
    updatedValues,
    transaction,
  };
}

function createInput(): ActivitySubmission {
  return {
    profileId: "profile-1",
    name: "Ride",
    notes: null,
    contentVisibility: "followers",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    finishedAt: new Date("2026-01-01T11:00:00Z"),
    elapsedMs: 3_600_000,
    distanceMeters: 20_000,
    calories: 500,
    elevationGainMeters: 200,
    avgHeartRate: 140,
    maxHeartRate: 170,
    avgPower: 200,
    maxPower: 500,
    avgCadence: 88,
    maxCadence: 110,
    avgSpeedMps: 6,
    maxSpeedMps: 12,
    normalizedSpeedMps: null,
    avgTemperature: null,
    deviceManufacturer: "Wahoo",
    deviceProduct: "ELEMNT",
    laps: [{ index: 1 }],
    mapBounds: null,
    polyline: "encoded",
    providerProvenance: {
      provider: "wahoo",
      externalId: "external-1",
      integrationId: "integration-1",
      providerUpdatedAt: null,
    },
    segmentSet,
  };
}

describe("submitActivity", () => {
  it("rejects generated efforts that cross or mismatch segment boundaries", async () => {
    const { db, committed } = createDb(undefined, null);
    await expect(
      submitActivity(db, {
        ...createInput(),
        analysis: {
          efforts: [
            {
              id: "effort-crossing",
              created_at: new Date(),
              profile_id: "profile-1",
              activity_id: "activity-1",
              segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              activity_category: "bike",
              effort_type: "power",
              duration_seconds: 300,
              start_offset: 3_500,
              recorded_at: new Date(),
              unit: "watts",
              value: 250,
              source: "derived",
              method: "activity_file_best_effort",
              calculation_version: "best-effort-extraction-v1",
              provenance: { observation_id: "effort-crossing" },
            },
          ],
          detectedLTHR: null,
        },
      }),
    ).rejects.toThrow("exactly one bike segment without crossing boundaries");
    expect(committed).toEqual([]);
  });

  it("aborts before projection when the ingestion claim is lost", async () => {
    const { db, committed } = createDb();
    await expect(
      submitActivity(db, {
        kind: "enrich",
        segmentSet,
        activityId: "activity-1",
        profileId: "profile-1",
        deviceManufacturer: null,
        deviceProduct: null,
        summaryValues: { elapsed_ms: 3_600_000 },
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "mobile_recording",
          operationKey: "recording:1",
          ingestionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          claimToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          artifact: {
            sha256: "a".repeat(64),
            byteSize: 3,
            bucket: "activity-files",
            path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
            mediaType: "application/octet-stream",
            format: "fit",
          },
        },
      }),
    ).rejects.toThrow("Activity file ingestion claim was lost");
    expect(committed).toEqual([]);
  });

  it("attaches a lower-quality provider source without replacing canonical FIT evidence", async () => {
    const materializeCalls = vi.mocked(materializeActivityAthleteStateEvidence).mock.calls.length;
    const { db, insertedValues, updatedValues } = createDb(undefined, {
      id: "activity-1",
      profile_id: "profile-1",
      activity_plan_id: null,
      name: "FIT authority",
      notes: null,
      started_at: new Date("2026-01-01T10:00:00.000Z"),
      finished_at: new Date("2026-01-01T11:00:00.000Z"),
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      segments_revision: 1,
      content_visibility: "private",
      canonical_evidence_tier: "fit_artifact",
    });
    const result = await submitActivity(db, {
      ...createInput(),
      requestedActivityId: "activity-1",
      name: "Lower quality provider summary",
      providerProvenance: {
        provider: "strava",
        externalId: "strava-summary-1",
        integrationId: "integration-2",
        providerUpdatedAt: "2026-01-02T00:00:00.000Z",
        evidenceTier: "provider_summary",
      },
      analysis: {
        efforts: [],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "strava",
          externalId: "strava-summary-1",
          operationKey: "provider_sync:strava:strava-summary-1:artifact-a",
          artifact: {
            sha256: "a".repeat(64),
            byteSize: 123,
            bucket: "activity-files",
            path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
            mediaType: "application/gpx+xml",
            format: "gpx",
          },
        },
      },
    });

    expect(result.noOp).toBe(true);
    expect(insertedValues.some(({ table }) => table === activitySourceReferences)).toBe(true);
    expect(insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: activitySourceReferences,
          values: expect.objectContaining({ artifact_sha256: "a".repeat(64) }),
        }),
      ]),
    );
    expect(updatedValues.some(({ table }) => table === activities)).toBe(false);
    expect(materializeActivityAthleteStateEvidence).toHaveBeenCalledTimes(materializeCalls);
  });

  it("persists normalized material effective time for deferred import recovery", async () => {
    vi.mocked(materializeActivityAthleteStateEvidence).mockResolvedValueOnce({
      commonLoad: 25,
      confidence: 0.9,
      effectiveAt: new Date("2026-01-02T11:00:00.000Z"),
      materialChanged: true,
    });
    const { db, updatedValues } = createDb(undefined, null);
    await submitActivity(db, createInput(), {
      importRunId: "77777777-7777-4777-8777-777777777777",
      deferAthleteStateRefresh: true,
    });

    expect(updatedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: activitySourceReferences,
          values: expect.objectContaining({
            last_material_import_run_id: "77777777-7777-4777-8777-777777777777",
            last_material_effective_at: new Date("2026-01-02T11:00:00.000Z"),
          }),
        }),
      ]),
    );
  });

  it("treats a summary-to-FIT correction as material when reduced values stay equal", async () => {
    vi.mocked(materializeActivityAthleteStateEvidence).mockResolvedValueOnce({
      commonLoad: 25,
      confidence: 0.9,
      effectiveAt: new Date("2026-01-01T11:00:00.000Z"),
      materialChanged: true,
    });
    const { db, updatedValues } = createDb();
    await submitActivity(
      db,
      {
        ...createInput(),
        requestedActivityId: "activity-1",
        analysis: {
          efforts: [],
          detectedLTHR: null,
          ingestion: {
            source: "provider_sync",
            provider: "wahoo",
            externalId: "external-1",
            artifact: {
              sha256: "b".repeat(64),
              byteSize: 321,
              bucket: "activity-files",
              path: `artifacts/sha256/profile-1/${"b".repeat(64)}`,
              mediaType: "application/octet-stream",
              format: "fit",
            },
          },
        },
      },
      { importRunId: "88888888-8888-4888-8888-888888888888" },
    );

    expect(materializeActivityAthleteStateEvidence).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        canonicalEvidenceMaterialChanged: true,
        effortMaterialRecordedAt: null,
      }),
    );
    expect(updatedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: activitySourceReferences,
          values: expect.objectContaining({
            last_material_import_run_id: "88888888-8888-4888-8888-888888888888",
          }),
        }),
      ]),
    );
  });

  it("atomically creates every canonical provider projection", async () => {
    const { db, committed, insertedValues, transaction } = createDb(undefined, null);
    await submitActivity(db, {
      ...createInput(),
      analysis: {
        efforts: [
          {
            id: "effort-1",
            created_at: new Date("2026-01-01T11:00:00Z"),
            profile_id: "wrong-profile",
            activity_id: "wrong-activity",
            segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            activity_category: "bike",
            effort_type: "power",
            duration_seconds: 300,
            recorded_at: new Date("2026-01-01T11:00:00Z"),
            unit: "watts",
            value: 250,
            source: "derived",
            method: "activity_file_best_effort",
            calculation_version: "best-effort-extraction-v1",
            provenance: { observation_id: "effort-1" },
          },
        ],
        detectedLTHR: null,
        ingestion: {
          source: "provider_sync",
          provider: "wahoo",
          externalId: "external-1",
          fileType: "fit",
          artifact: {
            sha256: "a".repeat(64),
            byteSize: 123,
            bucket: "activity-files",
            path: `artifacts/sha256/profile-1/${"a".repeat(64)}`,
            mediaType: "application/octet-stream",
            format: "fit",
          },
        },
      },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(committed).toEqual(
      expect.arrayContaining([
        activities,
        activitySourceReferences,
        activityEfforts,
        activityFileIngestions,
        activityArtifacts,
        activityArtifactLinks,
        activitySegments,
      ]),
    );
    expect(insertedValues.find((entry) => entry.table === activityEfforts)?.values).toEqual([
      expect.objectContaining({
        activity_id: expect.any(String),
        profile_id: "profile-1",
        duration_seconds: 300,
      }),
    ]);
    expect(insertedValues.find((entry) => entry.table === activityFileIngestions)?.values).toEqual(
      expect.objectContaining({
        source: "provider_sync",
        status: "ready",
        provider: "wahoo",
        external_id: "external-1",
      }),
    );
    expect(materializeActivityAthleteStateEvidence).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        effortMaterialRecordedAt: new Date("2026-01-01T11:00:00.000Z"),
      }),
    );
  });

  it("persists the structured segment NP result without a parent normalized-power projection", async () => {
    const normalizedPowerResult = calculateCyclingNormalizedPower({
      samples: Array.from({ length: 61 }, (_, timestampSeconds) => ({
        timestampSeconds,
        powerWatts: 247.5,
      })),
    });
    if (normalizedPowerResult.status === "unavailable") {
      throw new Error("Expected a numeric Normalized Power fixture");
    }
    const canonicalSegmentSet: NonNullable<ActivitySubmission["segmentSet"]> = {
      version: 1,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 3_600_000,
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult,
          },
        },
      ],
    };
    const created = createDb(undefined, null);
    await submitActivity(created.db, {
      ...createInput(),
      segmentSet: canonicalSegmentSet,
    });
    expect(
      created.insertedValues.find(({ table }) => table === activities)?.values,
    ).not.toHaveProperty("normalized_power");
    expect(created.insertedValues.find(({ table }) => table === activitySegments)?.values).toEqual([
      expect.objectContaining({
        summary: expect.objectContaining({
          normalizedPowerResult,
        }),
      }),
    ]);

    const enriched = createDb();
    await submitActivity(enriched.db, {
      kind: "enrich",
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      summaryValues: {},
      segmentSet: canonicalSegmentSet,
      efforts: [],
      detectedLTHR: null,
    });
    expect(
      enriched.updatedValues.find(({ table }) => table === activities)?.values,
    ).not.toHaveProperty("normalized_power");
  });

  it("persists unavailable NP reason, coverage, gap, and version without nullable watts", async () => {
    const normalizedPowerResult = calculateCyclingNormalizedPower({
      samples: [
        { timestampSeconds: 0, powerWatts: 200 },
        { timestampSeconds: 6, powerWatts: 200 },
        ...Array.from({ length: 29 }, (_, index) => ({
          timestampSeconds: index + 7,
          powerWatts: 200,
        })),
      ],
    });
    if (normalizedPowerResult.status !== "unavailable") {
      throw new Error("Expected an unavailable Normalized Power fixture");
    }
    const [firstSegment] = segmentSet.segments;
    if (!firstSegment) throw new Error("Expected the canonical segment fixture");
    const unavailableSegmentSet: NonNullable<ActivitySubmission["segmentSet"]> = {
      ...segmentSet,
      segments: [
        {
          ...firstSegment,
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult,
          },
        },
      ],
    };
    const created = createDb(undefined, null);
    await submitActivity(created.db, {
      ...createInput(),
      segmentSet: unavailableSegmentSet,
    });

    const persisted = created.insertedValues.find(
      ({ table }) => table === activitySegments,
    )?.values;
    expect(persisted).toEqual([
      expect.objectContaining({
        summary: expect.not.objectContaining({ normalizedPowerWatts: expect.anything() }),
      }),
    ]);
    expect(persisted).toEqual([
      expect.objectContaining({
        summary: expect.objectContaining({
          normalizedPowerResult: expect.objectContaining({
            status: "unavailable",
            reason: "insufficient_window",
            calculationVersion: "cycling-normalized-power-v1",
            diagnostics: expect.objectContaining({
              sourceTimeCoverage: 29 / 35,
              excludedGapDurationSeconds: 6,
            }),
          }),
        }),
      }),
    ]);
  });

  it("keeps numerical analysis in the canonical segment summary", async () => {
    const normalizedGradedPaceResult = calculateRunningNormalizedGradedPace({
      samples: Array.from({ length: 61 }, (_, timestampSeconds) => ({
        timestampSeconds,
        speedMetersPerSecond: 4,
        elevationMeters: 100,
      })),
    });
    const aerobicInput = {
      modality: "running" as const,
      outputUnit: "meters_per_second" as const,
      samples: Array.from({ length: 1_201 }, (_, timestampSeconds) => ({
        timestampSeconds,
        output: 4,
        heartRateBpm: 145,
      })),
    };
    const efficiencyFactorResult = calculateEfficiencyFactor(aerobicInput);
    const aerobicDecouplingResult = calculateAerobicDecoupling(aerobicInput);
    const [firstSegment] = segmentSet.segments;
    if (!firstSegment) throw new Error("Expected a canonical segment fixture");
    const structuredSegmentSet: NonNullable<ActivitySubmission["segmentSet"]> = {
      ...segmentSet,
      segments: [
        {
          ...firstSegment,
          activity_category: "run",
          summary: {
            ...firstSegment.summary,
            normalizedGradedPaceResult,
            efficiencyFactorResult,
            aerobicDecouplingResult,
          },
        },
      ],
    };
    const created = createDb(undefined, null);

    await submitActivity(created.db, {
      ...createInput(),
      segmentSet: structuredSegmentSet,
    });

    const activityValues = created.insertedValues.find(({ table }) => table === activities)?.values;
    expect(activityValues).not.toHaveProperty("normalized_graded_speed_mps");
    expect(activityValues).not.toHaveProperty("efficiency_factor");
    expect(activityValues).not.toHaveProperty("aerobic_decoupling");
    expect(created.insertedValues.find(({ table }) => table === activitySegments)?.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: expect.objectContaining({
            normalizedGradedPaceResult,
            efficiencyFactorResult,
            aerobicDecouplingResult,
          }),
        }),
      ]),
    );
  });

  it("round-trips FIT string and numeric raw sub-activity-category identity through segment insertion", async () => {
    const sourceArtifactId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const multisportSegmentSet: NonNullable<ActivitySubmission["segmentSet"]> = {
      version: 1,
      elapsedMs: 3_600_000,
      segments: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: 1_500_000,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
            sessionMessageIndex: 2,
            messageIndex: 8,
            rawType: "session",
            rawSport: 2,
            rawSubSport: "road",
          },
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
          ordinal: 1,
          role: "unknown",
          startOffsetMs: 1_500_000,
          endOffsetMs: 1_800_000,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
            sessionMessageIndex: 3,
            messageIndex: 9,
            rawType: 99,
            rawSport: "transition",
            rawSubSport: 17,
          },
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3",
          ordinal: 2,
          role: "activity",
          activity_category: "run",
          startOffsetMs: 1_800_000,
          endOffsetMs: 3_600_000,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
            sessionMessageIndex: 4,
            messageIndex: 10,
            rawType: "lap",
            rawSport: "running",
          },
          summary: {
            version: 1,
            timing: { timingCoverage: "unavailable" },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          },
        },
      ],
    };
    const created = createDb();

    await submitActivity(created.db, {
      kind: "enrich",
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      summaryValues: {},
      segmentSet: multisportSegmentSet,
      efforts: [],
      detectedLTHR: null,
    });

    expect(created.insertedValues.find(({ table }) => table === activitySegments)?.values).toEqual([
      expect.objectContaining({
        ordinal: 0,
        role: "activity",
        source_artifact_id: sourceArtifactId,
        source_session_index: 2,
        source_message_index: 8,
        raw_type_string: "session",
        raw_type_integer: null,
        raw_sport_string: null,
        raw_sport_integer: 2,
        raw_sub_sport_string: "road",
        raw_sub_sport_integer: null,
      }),
      expect.objectContaining({
        ordinal: 1,
        role: "unknown",
        source_artifact_id: sourceArtifactId,
        source_session_index: 3,
        source_message_index: 9,
        raw_type_string: null,
        raw_type_integer: 99,
        raw_sport_string: "transition",
        raw_sport_integer: null,
        raw_sub_sport_string: null,
        raw_sub_sport_integer: 17,
      }),
      expect.objectContaining({
        ordinal: 2,
        role: "activity",
        source_artifact_id: sourceArtifactId,
        source_session_index: 4,
        source_message_index: 10,
        raw_type_string: "lap",
        raw_type_integer: null,
        raw_sport_string: "running",
        raw_sport_integer: null,
        raw_sub_sport_string: null,
        raw_sub_sport_integer: null,
      }),
    ]);
  });

  it("upserts an existing activity enrichment in one transaction", async () => {
    const { db, committed, insertedValues } = createDb();
    await submitActivity(db, {
      kind: "enrich",
      segmentSet,
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      laps: [{ lap: 1 }],
      mapBounds: null,
      polyline: "line",
      summaryValues: {
        activity_id: "activity-1",
        profile_id: "profile-1",
        elapsed_ms: 60_000,
        active_ms: 60_000,
        moving_ms: 60_000,
        distance_meters: 100,
      },
      efforts: [
        {
          id: "effort-1",
          activity_id: "activity-1",
          profile_id: "profile-1",
          segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          effort_type: "power",
          activity_category: "bike",
          duration_seconds: 5,
          value: 300,
          unit: "watts",
          recorded_at: new Date("2026-01-01T11:00:00Z"),
          created_at: new Date(),
          source: "derived",
          method: "activity_file_best_effort",
          calculation_version: "best-effort-extraction-v1",
          provenance: { observation_id: "effort-1" },
        },
      ],
      detectedLTHR: detectedLthr(170),
    });
    expect(committed).toEqual(
      expect.arrayContaining([
        activities,
        activities,
        activities,
        activities,
        activityEfforts,
        profileMetrics,
      ]),
    );
    expect(committed).toContain(activities);
    expect(insertedValues.find(({ table }) => table === profileMetrics)?.values).toMatchObject({
      value: 170,
      recorded_at: new Date("2026-01-01T11:00:00Z"),
      calculation_version: "activity-file-lthr-v1",
      provenance: {
        activity_id: "activity-1",
        segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        source_effort_calculation_version: "best-effort-extraction-v1",
        window_coverage: 1,
      },
    });
  });

  it("preserves omitted laps and geometry while explicit null clears them", async () => {
    const omitted = createDb();
    await submitActivity(omitted.db, {
      kind: "enrich",
      segmentSet,
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      summaryValues: {},
      efforts: [],
      detectedLTHR: null,
    });
    const omittedSet = omitted.updatedValues.at(-1)?.values as Record<string, unknown>;
    expect(omittedSet).not.toHaveProperty("laps");
    expect(omittedSet).not.toHaveProperty("map_bounds");
    expect(omittedSet).not.toHaveProperty("polyline");

    const cleared = createDb();
    await submitActivity(cleared.db, {
      kind: "enrich",
      segmentSet,
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      summaryValues: {},
      efforts: [],
      detectedLTHR: null,
    });
    expect(cleared.updatedValues.at(-1)?.values).toMatchObject({
      laps: [],
      map_bounds: null,
      polyline: null,
    });
  });

  it("rejects existing-ID enrichment when the activity is not owned by the profile", async () => {
    const { db, committed } = createDb(undefined, null);
    await expect(
      submitActivity(db, {
        kind: "enrich",
        segmentSet,
        activityId: "foreign-activity",
        profileId: "profile-1",
        deviceManufacturer: null,
        deviceProduct: null,
        laps: null,
        mapBounds: null,
        polyline: null,
        summaryValues: {
          activity_id: "foreign-activity",
          profile_id: "profile-1",
          elapsed_ms: 1_000,
          active_ms: 1_000,
          moving_ms: 1_000,
          distance_meters: 1,
        },
        efforts: [],
        detectedLTHR: null,
      }),
    ).rejects.toThrow("Activity not found for profile");
    expect(committed).toEqual([]);
  });

  it("forcibly scopes enrichment efforts to the canonical activity and profile", async () => {
    const { db, insertedValues } = createDb();
    await submitActivity(db, {
      kind: "enrich",
      segmentSet,
      activityId: "activity-1",
      profileId: "profile-1",
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      summaryValues: {
        activity_id: "foreign-activity",
        profile_id: "foreign-profile",
        elapsed_ms: 1_000,
        active_ms: 1_000,
        moving_ms: 1_000,
        distance_meters: 1,
      },
      efforts: [
        {
          id: "effort-1",
          activity_id: "foreign-activity",
          profile_id: "foreign-profile",
          segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          effort_type: "power",
          activity_category: "bike",
          duration_seconds: 5,
          value: 300,
          unit: "watts",
          recorded_at: new Date(),
          created_at: new Date(),
          source: "derived",
          method: "activity_file_best_effort",
          calculation_version: "best-effort-extraction-v1",
          provenance: { observation_id: "effort-1" },
        },
      ],
      detectedLTHR: null,
    });
    const effortWrite = insertedValues.find(({ table }) => table === activityEfforts);
    expect(effortWrite?.values).toEqual([
      expect.objectContaining({
        activity_id: "activity-1",
        profile_id: "profile-1",
      }),
    ]);
  });

  it("rolls back without partial persistence when a projection write fails", async () => {
    const { db, committed } = createDb(activities);
    await expect(submitActivity(db, createInput())).rejects.toThrow("write failed");
    expect(committed).toEqual([]);
  });

  it("rolls back activity enrichment when generated evidence reconciliation fails", async () => {
    const { db, committed } = createDb(activityEfforts);
    await expect(
      submitActivity(db, {
        kind: "enrich",
        segmentSet,
        activityId: "activity-1",
        profileId: "profile-1",
        deviceManufacturer: null,
        deviceProduct: null,
        summaryValues: {},
        efforts: [
          {
            id: "effort-1",
            created_at: new Date(),
            profile_id: "profile-1",
            activity_id: "activity-1",
            segment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            recorded_at: new Date(),
            activity_category: "bike",
            effort_type: "power",
            duration_seconds: 300,
            unit: "watts",
            value: 250,
            source: "derived",
            method: "activity_file_best_effort",
            calculation_version: "best-effort-extraction-v1",
            provenance: { observation_id: "effort-1" },
          },
        ],
        detectedLTHR: null,
      }),
    ).rejects.toThrow("write failed");
    expect(committed).toEqual([]);
  });

  it("composes recording ingestion persistence into the canonical transaction", async () => {
    const { db, committed, transaction } = createDb();
    const ingestionTable = { name: "activity_file_ingestions" };
    const composition = vi.fn(async (tx: MockTx, context: { activityId: string; now: Date }) => {
      await tx.insert(ingestionTable).values({ activity_id: context.activityId });
      return { id: "ingestion-1", status: "pending_upload" };
    });
    const result = await submitActivity(db, {
      ...createInput(),
      providerProvenance: undefined,
      composition: { persist: (tx, context) => composition(tx as unknown as MockTx, context) },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(committed).toEqual(expect.arrayContaining([activities, ingestionTable]));
    expect(result.compositionResult).toEqual({ id: "ingestion-1", status: "pending_upload" });
  });
});
