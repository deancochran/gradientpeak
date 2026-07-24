import {
  activities,
  activityArtifactLinks,
  activityArtifacts,
  activityEfforts,
  activityFileIngestions,
  activitySegments,
  integrationResourceLinks,
  profileMetrics,
} from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import {
  type ActivitySubmission,
  manualImportActivityId,
  providerActivityId,
  providerProjectionDecision,
  recordingSessionActivityId,
  submitActivity,
} from "./submit-activity";

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
    existingMaterializerVersion: "activity-segments-v1",
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
});

type DbClient = ReturnType<typeof getRequiredDb>;
const segmentSet = {
  version: 1 as const,
  elapsedMs: 3_600_000,
  segments: [
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ordinal: 0,
      role: "activity" as const,
      category: "bike" as const,
      startOffsetMs: 0,
      endOffsetMs: 3_600_000,
      summary: { version: 1 as const, timing: { timingCoverage: "unavailable" as const } },
    },
  ],
};
interface MockTx {
  execute(query: unknown): Promise<unknown>;
  select(): {
    from(table: unknown): {
      where(condition: unknown): PromiseLike<unknown[]> & {
        limit(count: number): Promise<unknown[]>;
      };
    };
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

function createDb(
  failOn?: unknown,
  existingActivity: unknown = {
    id: "activity-1",
    profile_id: "profile-1",
    activity_plan_id: "plan-1",
    name: "Recorded",
    notes: null,
    is_private: true,
    started_at: new Date(),
    finished_at: new Date(),
    elapsed_ms: 60_000,
    active_ms: 60_000,
    moving_ms: 60_000,
    timing_coverage: "complete",
    segments_revision: 1,
    content_visibility: "private",
  },
) {
  const committed: unknown[] = [];
  const insertedValues: Array<{ table: unknown; values: unknown }> = [];
  const updatedValues: Array<{ table: unknown; values: unknown }> = [];
  const transaction = vi.fn(async (callback: (tx: MockTx) => Promise<void>) => {
    const staged: unknown[] = [];
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => {
            const rows = table === activities && existingActivity ? [existingActivity] : [];
            return Object.assign(Promise.resolve(rows), {
              limit: vi.fn().mockResolvedValue(rows),
              orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows) })),
            });
          }),
        })),
      })),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: unknown) => {
          if (table === failOn) throw new Error("write failed");
          staged.push(table);
          insertedValues.push({ table, values });
          const conflictResult = {
            returning: vi.fn().mockResolvedValue([{ id: "persisted-id" }]),
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
    await callback(tx);
    committed.push(...staged);
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
    isPrivate: false,
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
    normalizedPower: 220,
    avgCadence: 88,
    maxCadence: 110,
    avgSpeedMps: 6,
    maxSpeedMps: 12,
    normalizedSpeedMps: null,
    normalizedGradedSpeedMps: null,
    efficiencyFactor: null,
    aerobicDecoupling: null,
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
              activity_category: "bike",
              effort_type: "power",
              duration_seconds: 300,
              start_offset: 3_500,
              recorded_at: new Date(),
              unit: "watts",
              value: 250,
            },
          ],
          detectedLTHR: null,
          activityCompletedAt: new Date(),
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
        activityCompletedAt: new Date(),
        ingestion: {
          source: "mobile_recording",
          operationKey: "recording:1",
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
            activity_category: "bike",
            effort_type: "power",
            duration_seconds: 300,
            recorded_at: new Date("2026-01-01T11:00:00Z"),
            unit: "watts",
            value: 250,
          },
        ],
        detectedLTHR: null,
        activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
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
        integrationResourceLinks,
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
  });

  it("upserts an existing activity enrichment in one transaction", async () => {
    const { db, committed } = createDb();
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
          effort_type: "power",
          activity_category: "bike",
          duration_seconds: 5,
          value: 300,
          unit: "watts",
          recorded_at: new Date("2026-01-01T11:00:00Z"),
          created_at: new Date(),
        },
      ],
      detectedLTHR: 170,
      activityCompletedAt: new Date("2026-01-01T11:00:00Z"),
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
      activityCompletedAt: new Date(),
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
      activityCompletedAt: new Date(),
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
        activityCompletedAt: new Date(),
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
          effort_type: "power",
          activity_category: "bike",
          duration_seconds: 5,
          value: 300,
          unit: "watts",
          recorded_at: new Date(),
          created_at: new Date(),
        },
      ],
      detectedLTHR: null,
      activityCompletedAt: new Date(),
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
            recorded_at: new Date(),
            activity_category: "bike",
            effort_type: "power",
            duration_seconds: 300,
            unit: "watts",
            value: 250,
          },
        ],
        detectedLTHR: null,
        activityCompletedAt: new Date(),
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
