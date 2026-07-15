import {
  activities,
  activityEfforts,
  activityFileIngestions,
  integrationResourceLinks,
  profileMetrics,
} from "@repo/db";
import { describe, expect, it, vi } from "vitest";
import type { getRequiredDb } from "../../db";
import {
  type ActivitySubmission,
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

type DbClient = ReturnType<typeof getRequiredDb>;
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
      onConflictDoUpdate(input: unknown): Promise<void>;
      onConflictDoNothing(): Promise<void>;
    };
  };
  update(table: unknown): { set(values: unknown): { where(condition: unknown): Promise<void> } };
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
    type: "bike",
    is_private: true,
    started_at: new Date(),
    finished_at: new Date(),
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
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
          };
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: unknown) => ({
          where: vi.fn(async () => {
            updatedValues.push({ table, values });
            if (table === failOn) throw new Error("write failed");
            staged.push(table);
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
    activityType: "bike",
    isPrivate: false,
    startedAt: new Date("2026-01-01T10:00:00Z"),
    finishedAt: new Date("2026-01-01T11:00:00Z"),
    durationSeconds: 3600,
    movingSeconds: 3500,
    distanceMeters: 20_000,
    activityFilePath: "ride.fit",
    activityFileSize: 123,
    importSource: null,
    importFileType: "fit",
    importOriginalFileName: null,
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
  };
}

describe("submitActivity", () => {
  it("atomically creates every canonical provider projection", async () => {
    const { db, committed, insertedValues, transaction } = createDb();
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
        },
      },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(committed).toEqual(
      expect.arrayContaining([
        activities,
        activities,
        activities,
        activities,
        activities,
        integrationResourceLinks,
        activityEfforts,
        activityFileIngestions,
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
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 50,
      activityFileType: "fit",
      deviceManufacturer: null,
      deviceProduct: null,
      laps: [{ lap: 1 }],
      mapBounds: null,
      polyline: "line",
      summaryValues: {
        activity_id: "activity-1",
        profile_id: "profile-1",
        duration_seconds: 60,
        moving_seconds: 60,
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
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 50,
      activityFileType: "fit",
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
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 50,
      activityFileType: "fit",
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
        activityId: "foreign-activity",
        profileId: "profile-1",
        activityFilePath: "recorded.fit",
        activityFileSize: 1,
        activityFileType: "fit",
        deviceManufacturer: null,
        deviceProduct: null,
        laps: null,
        mapBounds: null,
        polyline: null,
        summaryValues: {
          activity_id: "foreign-activity",
          profile_id: "profile-1",
          duration_seconds: 1,
          moving_seconds: 1,
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
      activityId: "activity-1",
      profileId: "profile-1",
      activityFilePath: "recorded.fit",
      activityFileSize: 1,
      activityFileType: "fit",
      deviceManufacturer: null,
      deviceProduct: null,
      laps: null,
      mapBounds: null,
      polyline: null,
      summaryValues: {
        activity_id: "foreign-activity",
        profile_id: "foreign-profile",
        duration_seconds: 1,
        moving_seconds: 1,
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
        activityId: "activity-1",
        profileId: "profile-1",
        activityFilePath: "recorded.fit",
        activityFileSize: 1,
        activityFileType: "fit",
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
      activityFilePath: null,
      providerProvenance: undefined,
      composition: { persist: (tx, context) => composition(tx as unknown as MockTx, context) },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(committed).toEqual(expect.arrayContaining([activities, ingestionTable]));
    expect(result.compositionResult).toEqual({ id: "ingestion-1", status: "pending_upload" });
  });
});
