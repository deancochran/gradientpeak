import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  activities: {
    id: "activities.id",
    created_at: "activities.created_at",
    profile_id: "activities.profile_id",
    is_private: "activities.is_private",
    name: "activities.name",
    type: "activities.type",
    started_at: "activities.started_at",
    finished_at: "activities.finished_at",
    activity_file_path: "activities.activity_file_path",
  },
  activityArtifacts: {
    id: "activity_artifacts.id",
    path: "activity_artifacts.path",
    format: "activity_artifacts.format",
  },
  activityArtifactLinks: {
    activity_id: "activity_artifact_links.activity_id",
    artifact_id: "activity_artifact_links.artifact_id",
    is_current: "activity_artifact_links.is_current",
    role: "activity_artifact_links.role",
  },
  activitySegments: {
    activity_id: "activity_segments.activity_id",
    category: "activity_segments.category",
    role: "activity_segments.role",
  },
  activityGeometry: { table: "activity_geometry", activity_id: "activity_geometry.activity_id" },
  activityImports: {
    activity_id: "activity_imports.activity_id",
    profile_id: "activity_imports.profile_id",
    activity_file_path: "activity_imports.activity_file_path",
  },
  activityFileIngestions: {
    id: "activity_file_ingestions.id",
    activity_id: "activity_file_ingestions.activity_id",
    profile_id: "activity_file_ingestions.profile_id",
  },
  activityLaps: { table: "activity_laps", activity_id: "activity_laps.activity_id" },
  activitySummaries: { table: "activity_summaries", activity_id: "activity_summaries.activity_id" },
  activityEfforts: { table: "activity_efforts", activity_id: "activity_efforts.activity_id" },
  profileMetrics: {
    value: "profile_metrics.value",
    profile_id: "profile_metrics.profile_id",
    metric_type: "profile_metrics.metric_type",
    recorded_at: "profile_metrics.recorded_at",
  },
  activityPlans: {
    id: "activity_plans.id",
    profile_id: "activity_plans.profile_id",
  },
}));

const mocks = vi.hoisted(() => ({
  calculateBounds: vi.fn(),
  encodePolyline: vi.fn(),
  inferActivityFileType: vi.fn(),
  parseActivityFile: vi.fn(),
  calculateBestEfforts: vi.fn(),
  calculateDecouplingFromStreams: vi.fn(),
  calculateEfficiencyFactor: vi.fn(),
  calculateGradedSpeedStream: vi.fn(),
  calculateNGP: vi.fn(),
  calculateNormalizedPower: vi.fn(),
  calculateNormalizedSpeed: vi.fn(),
  detectLTHR: vi.fn(),
  estimateVO2Max: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
  resolveActivityContextAsOf: vi.fn(),
  fetchActivityTemperature: vi.fn(),
  storage: {
    createBucket: vi.fn(),
    createSignedUploadUrl: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
  },
  functionsInvoke: vi.fn(),
  processManualActivityFile: vi.fn(),
  db: {
    current: null as any,
  },
}));

vi.mock("@repo/core", async () => ({
  ...(await vi.importActual<typeof import("@repo/core")>("@repo/core")),
  calculateBounds: mocks.calculateBounds,
  encodePolyline: mocks.encodePolyline,
  inferActivityFileType: mocks.inferActivityFileType,
  simplifyCoordinates: vi.fn((coords) => coords),
  canTransitionActivityFileIngestionStatus: vi.fn(() => true),
  activityLapRecordListSchema: { parse: vi.fn((value) => value) },
}));

vi.mock("@repo/core/server/activity-files", () => ({
  inferActivityFileType: mocks.inferActivityFileType,
  parseActivityFile: mocks.parseActivityFile,
}));

vi.mock("@repo/core/calculations", () => ({
  calculateAerobicDecoupling: vi.fn(),
  calculateBestEfforts: mocks.calculateBestEfforts,
  calculateDecouplingFromStreams: mocks.calculateDecouplingFromStreams,
  calculateEfficiencyFactor: mocks.calculateEfficiencyFactor,
  calculateGradedSpeedStream: mocks.calculateGradedSpeedStream,
  calculateNGP: mocks.calculateNGP,
  calculateNormalizedPower: mocks.calculateNormalizedPower,
  calculateNormalizedSpeed: mocks.calculateNormalizedSpeed,
  detectLTHR: mocks.detectLTHR,
  estimateVO2Max: mocks.estimateVO2Max,
}));

vi.mock("../../utils/weather", () => ({
  fetchActivityTemperature: mocks.fetchActivityTemperature,
}));

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      createBucket: mocks.storage.createBucket,
      from: () => ({
        createSignedUploadUrl: mocks.storage.createSignedUploadUrl,
        upload: mocks.storage.upload,
        download: mocks.storage.download,
        remove: mocks.storage.remove,
        createSignedUrl: mocks.storage.createSignedUrl,
      }),
    },
    functions: {
      invoke: mocks.functionsInvoke,
    },
  }),
}));

vi.mock("../../db", () => ({
  getRequiredDb: () => mocks.db.current,
}));

vi.mock("../../infrastructure/repositories/drizzle-activity-analysis-repository", () => ({
  createActivityAnalysisStore: mocks.createActivityAnalysisStore,
}));

vi.mock("../../lib/activity-analysis/context", () => ({
  resolveActivityContextAsOf: mocks.resolveActivityContextAsOf,
}));
vi.mock("../../application/activity-file-ingestion/process-manual-activity-file", () => ({
  processManualActivityFile: mocks.processManualActivityFile,
}));

import { activities } from "@repo/db";
import { activityFilesRouter } from "../activity-files";

type MockDbPlan = {
  selectResults?: unknown[][];
  activitySelectResult?: unknown[];
  findFirstResults?: unknown[];
  executeResults?: unknown[];
};

function createBlob(contents = "fit bytes") {
  return new Blob([contents], { type: "application/octet-stream" });
}

function createDbMock(plan: MockDbPlan = {}) {
  const selectResults = [...(plan.selectResults ?? [])];
  const findFirstResults = [...(plan.findFirstResults ?? [])];
  const executeResults = [...(plan.executeResults ?? [])];
  const callLog = {
    executeCalls: [] as unknown[],
    findFirstCalls: [] as unknown[],
    insertCalls: [] as Array<{ table: unknown; values: unknown }>,
    selectCalls: [] as unknown[],
    updateCalls: [] as Array<{ table: unknown; set: unknown }>,
    deleteCalls: [] as Array<{ table: unknown; where: unknown }>,
  };
  let selectedTable: unknown;

  const builder: any = {
    from: vi.fn((table: unknown) => {
      selectedTable = table;
      return builder;
    }),
    innerJoin: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    where: vi.fn((...args: unknown[]) => {
      callLog.selectCalls.push({ type: "where", args });
      return builder;
    }),
    orderBy: vi.fn((...args: unknown[]) => {
      callLog.selectCalls.push({ type: "orderBy", args });
      return builder;
    }),
    limit: vi.fn((...args: unknown[]) => {
      callLog.selectCalls.push({ type: "limit", args });
      return builder;
    }),
    then: (onFulfilled: (rows: unknown[]) => unknown) =>
      Promise.resolve(
        selectedTable === activities && plan.activitySelectResult
          ? plan.activitySelectResult
          : (selectResults.shift() ?? []),
      ).then(onFulfilled),
  };

  const db = {
    execute: vi.fn(async (query: unknown) => {
      callLog.executeCalls.push(query);
      return (executeResults.shift() as { rows?: unknown[] } | undefined) ?? { rows: [] };
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        callLog.insertCalls.push({ table, values });
        const conflictResult = {
          returning: vi.fn(async () => (Array.isArray(values) ? values : [values])),
        };
        return {
          onConflictDoUpdate: vi.fn(() => conflictResult),
          onConflictDoNothing: vi.fn(() => conflictResult),
          returning: vi.fn(async () => (Array.isArray(values) ? values : [values])),
          then: (onFulfilled: (result: unknown) => unknown) =>
            Promise.resolve(values).then(onFulfilled),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((set: unknown) => {
        callLog.updateCalls.push({ table, set });
        return {
          where: vi.fn(() => ({
            returning: vi.fn(async () =>
              table === activities ? [{ id: "activity-1" }] : (selectResults.shift() ?? [set]),
            ),
            then: (onFulfilled: (result: unknown) => unknown) =>
              Promise.resolve(set).then(onFulfilled),
          })),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async (where: unknown) => {
        callLog.deleteCalls.push({ table, where });
        return undefined;
      }),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
    query: {
      activities: {
        findFirst: vi.fn(async (args: unknown) => {
          callLog.findFirstCalls.push(args);
          return findFirstResults.shift() ?? null;
        }),
      },
      activityFileIngestions: {
        findFirst: vi.fn(async () => findFirstResults.shift() ?? null),
      },
    },
    select: vi.fn((fields: unknown) => {
      callLog.selectCalls.push({ type: "select", fields });
      return builder;
    }),
  };

  return { callLog, db };
}

function createCaller(options?: { db?: unknown; userId?: string }) {
  mocks.db.current = options?.db ?? null;

  return activityFilesRouter.createCaller({
    session: { user: { id: options?.userId ?? "11111111-1111-4111-8111-111111111111" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mocks.db.current = null;

  mocks.storage.createSignedUploadUrl.mockImplementation(async (path: string) => ({
    data: { path, signedUrl: `https://upload.test/${path}`, token: "upload-token" },
    error: null,
  }));
  mocks.storage.createBucket.mockResolvedValue({ data: null, error: null });
  mocks.storage.upload.mockResolvedValue({ error: null });
  mocks.storage.download.mockResolvedValue({ data: createBlob(), error: null });
  mocks.storage.remove.mockResolvedValue({ data: null, error: null });
  mocks.storage.createSignedUrl.mockImplementation(async (path: string, expiresIn: number) => ({
    data: {
      signedUrl: `https://download.test/${path}`,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    },
    error: null,
  }));
  mocks.functionsInvoke.mockResolvedValue({ data: { queued: true }, error: null });
  mocks.processManualActivityFile.mockResolvedValue({
    activity: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Morning Ride",
      started_at: new Date("2025-05-10T10:00:00.000Z"),
      finished_at: new Date("2025-05-10T11:00:00.000Z"),
    },
    ingestion: { id: "ingestion-1", status: "ready", activity_id: "activity-1" },
  });
  mocks.calculateBounds.mockReturnValue({ minLat: 40, maxLat: 41, minLng: -74, maxLng: -73 });
  mocks.encodePolyline.mockReturnValue("encoded-polyline");
  mocks.inferActivityFileType.mockImplementation((fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension === "fit" || extension === "gpx" || extension === "tcx") return extension;
    throw new Error("Unsupported activity file type");
  });

  mocks.calculateBestEfforts.mockImplementation((_, timestamps: number[]) => [
    {
      duration: 1200,
      value: 300,
      startIndex: 0,
      endIndex: 0,
      startTimeSeconds: timestamps[0],
      endTimeSeconds: (timestamps[0] ?? 0) + 1200,
    },
  ]);
  mocks.calculateDecouplingFromStreams.mockReturnValue(0.03);
  mocks.calculateEfficiencyFactor.mockReturnValue(1.55);
  mocks.calculateGradedSpeedStream.mockReturnValue([4.5, 4.7]);
  mocks.calculateNGP.mockReturnValue(4.6);
  mocks.calculateNormalizedPower.mockReturnValue(250);
  mocks.calculateNormalizedSpeed.mockReturnValue(11.1);
  mocks.detectLTHR.mockReturnValue(175);
  mocks.estimateVO2Max.mockReturnValue(52);
  mocks.fetchActivityTemperature.mockResolvedValue(null);
  mocks.createActivityAnalysisStore.mockImplementation((db) => ({ db }));
  mocks.resolveActivityContextAsOf.mockResolvedValue({
    profileMetrics: {
      ftp: 300,
      lthr: null,
      lthr_by_sport: { bike: 180 },
      threshold_speed_mps: null,
      swim_threshold_speed_mps: null,
    },
    recentEfforts: [],
    profile: {},
    calibrationQuality: {
      ftp: {
        source: "manual",
        observed_at: "2026-02-20T00:00:00.000Z",
        confidence: "high",
        stale: false,
        estimate: false,
        calculation_version: null,
      },
    },
  });
});

describe("activityFilesRouter", () => {
  it("does not expose evidence maintenance as an end-user procedure", () => {
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("recalculateOwnedEvidence");
  });

  it("creates signed upload URLs for activity uploads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const caller = createCaller();
    const result = await caller.getSignedUploadUrl({ fileName: "ride.fit", fileSize: 1234 });

    expect(mocks.storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "activities/11111111-1111-4111-8111-111111111111/uploads/1775217600000_ride.fit",
    );
    expect(mocks.storage.createBucket).toHaveBeenCalledWith("activity-files", {
      public: false,
      fileSizeLimit: "50MB",
    });
    expect(result).toMatchObject({
      filePath: "activities/11111111-1111-4111-8111-111111111111/uploads/1775217600000_ride.fit",
      token: "upload-token",
    });
  });

  it("continues signed upload URL creation when the FIT bucket already exists", async () => {
    mocks.storage.createBucket.mockResolvedValueOnce({
      data: null,
      error: { message: "Bucket already exists" },
    });

    const caller = createCaller();
    const result = await caller.getSignedUploadUrl({ fileName: "ride.fit", fileSize: 1234 });

    expect(result.token).toBe("upload-token");
    expect(mocks.storage.createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed signed upload responses from storage", async () => {
    mocks.storage.createSignedUploadUrl.mockResolvedValue({
      data: { path: "activities/test/ride.fit", signedUrl: "https://upload.test/ride.fit" },
      error: null,
    });

    const caller = createCaller();

    await expect(
      caller.getSignedUploadUrl({ fileName: "ride.fit", fileSize: 1234 }),
    ).rejects.toThrow("Failed to generate upload URL");
  });

  it("delegates owned manual uploads to the ingestion use case without changing the response", async () => {
    const startTime = new Date("2025-05-10T10:00:00.000Z");
    const finishedAt = new Date("2025-05-10T11:00:00.000Z");
    const createdActivity = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Morning Ride",
      started_at: startTime,
      finished_at: finishedAt,
      created_at: startTime,
      updated_at: finishedAt,
    };
    const { db } = createDbMock({
      selectResults: [[{ value: "168" }], [{ value: "52" }], [], [], []],
      findFirstResults: [createdActivity],
      executeResults: [{ rows: [] }],
    });

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime },
      summary: {
        totalTime: 3600,
        totalDistance: 40250,
        calories: 900,
        totalAscent: 410,
        avgHeartRate: 162,
        maxHeartRate: 182,
        avgPower: 240,
        maxPower: 450,
        avgCadence: 88,
        maxCadence: 102,
        avgSpeed: 11.18,
        maxSpeed: 18.1,
      },
      records: [
        { timestamp: startTime, power: 230, heartRate: 160, cadence: 86, altitude: 120, speed: 11 },
        {
          timestamp: new Date("2025-05-10T10:20:00.000Z"),
          power: 245,
          heartRate: 168,
          cadence: 90,
          altitude: 150,
          speed: 11.5,
        },
      ],
      laps: [],
      lengths: [],
      segments: [
        {
          sessionMessageIndex: 0,
          role: "activity",
          category: "bike",
          rawSport: "cycling",
          startTime,
          endTime: finishedAt,
        },
      ],
    });

    const caller = createCaller({ db });
    const result = await caller.processActivityFile({
      activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
      name: "Morning Ride",
      notes: "Imported",
      importProvenance: {
        import_source: "manual_historical",
        import_file_type: "fit",
        import_original_file_name: "morning-ride.fit",
      },
    });

    expect(result).toMatchObject({
      success: true,
      activity: {
        id: createdActivity.id,
        started_at: startTime.toISOString(),
        finished_at: finishedAt.toISOString(),
      },
    });
    expect(mocks.processManualActivityFile).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        profileId: "11111111-1111-4111-8111-111111111111",
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
        originalName: "morning-ride.fit",
        fileType: "fit",
      }),
      expect.objectContaining({
        readStoredActivityFile: expect.any(Function),
        decodeActivityFile: expect.any(Function),
      }),
    );
  });

  it("rejects processing activity files owned by another user", async () => {
    const { db } = createDbMock();
    const caller = createCaller({ db });

    await expect(
      caller.processActivityFile({
        activityFilePath: "activities/22222222-2222-4222-8222-222222222222/uploads/ride.fit",
        name: "Other Ride",
      }),
    ).rejects.toThrow("Access denied");

    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("rejects the removed processActivityFile parent activity type field", async () => {
    const { db } = createDbMock();
    const caller = createCaller({ db });
    await expect(
      (caller.processActivityFile as (input: unknown) => Promise<unknown>)({
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/legacy.fit",
        name: "Legacy transport",
        activityType: "bike",
      }),
    ).rejects.toThrow("Unrecognized key");
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("attaches an uploaded file to an existing activity and marks ingestion ready", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const activityId = "99999999-9999-4999-8999-999999999999";
    const ingestionId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    const startTime = new Date("2026-04-01T08:00:00.000Z");
    const finishedAt = new Date("2026-04-01T09:00:00.000Z");
    const activity = {
      id: activityId,
      profile_id: userId,
      started_at: startTime,
      finished_at: finishedAt,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_600_000,
      timing_coverage: "complete",
      segments_revision: 1,
      created_at: startTime,
      updated_at: finishedAt,
    };
    const pendingIngestion = {
      id: ingestionId,
      activity_id: activityId,
      profile_id: userId,
      status: "pending_upload",
      attempt_count: 0,
    };
    const uploadedIngestion = { ...pendingIngestion, status: "uploaded" };
    const processingIngestion = {
      ...pendingIngestion,
      status: "processing",
      attempt_count: 1,
      claim_token: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
      operation_key: `mobile_recording:direct:${activityId}`,
      source: "mobile_recording" as const,
      provider: null,
      external_id: null,
    };
    const readyIngestion = { ...processingIngestion, status: "ready" };
    const { db, callLog } = createDbMock({
      selectResults: [
        [{ activity, ingestion: pendingIngestion }],
        [pendingIngestion],
        [uploadedIngestion],
        [uploadedIngestion],
        [processingIngestion],
        [{ value: "168" }],
        [{ value: "52" }],
        [{ id: ingestionId }],
        [],
        [],
        [],
        [],
      ],
      activitySelectResult: [activity],
      findFirstResults: [readyIngestion, activity],
    });

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime, manufacturer: "Wahoo", product: "ELEMNT" },
      summary: {
        totalTime: 3600,
        totalDistance: 40100,
        calories: 850,
        totalAscent: 375,
        avgHeartRate: 158,
        maxHeartRate: 180,
        avgPower: 235,
        maxPower: 440,
        avgCadence: 87,
        maxCadence: 101,
        avgSpeed: 11.14,
        maxSpeed: 17.9,
      },
      records: [
        { timestamp: startTime, power: 230, heartRate: 155, cadence: 86, altitude: 100, speed: 11 },
        {
          timestamp: new Date("2026-04-01T08:20:00.000Z"),
          power: 245,
          heartRate: 165,
          cadence: 90,
          altitude: 130,
          speed: 11.4,
          positionLat: 40,
          positionLong: -73,
        },
      ],
      laps: [{ startTime }],
      lengths: [],
      segments: [
        {
          sessionMessageIndex: 0,
          role: "activity",
          category: "bike",
          rawSport: "cycling",
          startTime,
          endTime: finishedAt,
        },
      ],
    });

    const caller = createCaller({ db, userId });
    const result = await caller.markUploadedAndProcess({
      ingestionId,
      activityId,
      activityFilePath: `activities/${userId}/uploads/phase5.fit`,
      fileSize: 12345,
    });

    expect(result).toMatchObject({
      success: true,
      activity: { id: activityId },
      ingestion: { id: ingestionId, status: "ready" },
    });
    expect(callLog.updateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          set: expect.objectContaining({
            elapsed_ms: 3_600_000,
            laps: expect.any(Array),
          }),
        }),
      ]),
    );
    expect(mocks.storage.remove).toHaveBeenCalledWith([`activities/${userId}/uploads/phase5.fit`]);
  });

  it("rejects attaching uploaded files when the activity or ingestion is not owned", async () => {
    const { db } = createDbMock({ selectResults: [[]] });
    const caller = createCaller({ db });

    await expect(
      caller.markUploadedAndProcess({
        ingestionId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        activityId: "99999999-9999-4999-8999-999999999999",
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/phase5.fit",
      }),
    ).rejects.toThrow("Activity file ingestion not found");
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("rejects attaching uploaded files outside the user's storage prefix", async () => {
    const { db } = createDbMock();
    const caller = createCaller({ db });

    await expect(
      caller.markUploadedAndProcess({
        ingestionId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        activityId: "99999999-9999-4999-8999-999999999999",
        activityFilePath: "activities/22222222-2222-4222-8222-222222222222/uploads/phase5.fit",
      }),
    ).rejects.toThrow("Access denied");
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("marks ingestion failed and preserves the activity when uploaded file parsing fails", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const activityId = "99999999-9999-4999-8999-999999999999";
    const ingestionId = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
    const activity = { id: activityId, profile_id: userId };
    const pendingIngestion = {
      id: ingestionId,
      activity_id: activityId,
      profile_id: userId,
      status: "pending_upload",
      attempt_count: 0,
    };
    const uploadedIngestion = { ...pendingIngestion, status: "uploaded" };
    const processingIngestion = {
      ...pendingIngestion,
      status: "processing",
      attempt_count: 1,
      claim_token: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
    };
    const failedIngestion = { ...processingIngestion, status: "failed" };
    const { db, callLog } = createDbMock({
      selectResults: [
        [{ activity, ingestion: pendingIngestion }],
        [pendingIngestion],
        [uploadedIngestion],
        [uploadedIngestion],
        [processingIngestion],
        [processingIngestion],
        [failedIngestion],
      ],
    });
    mocks.parseActivityFile.mockImplementation(() => {
      throw new Error("bad fit");
    });

    const caller = createCaller({ db, userId });

    await expect(
      caller.markUploadedAndProcess({
        ingestionId,
        activityId,
        activityFilePath: `activities/${userId}/uploads/bad.fit`,
      }),
    ).rejects.toThrow("Unable to parse activity file");
    expect(callLog.deleteCalls).toEqual([]);
    expect(mocks.storage.remove).not.toHaveBeenCalled();
    expect(callLog.updateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          set: expect.objectContaining({ status: "failed", last_error_code: "parse_failed" }),
        }),
      ]),
    );
  });

  it("rejects download URLs for another user's activity file", async () => {
    const caller = createCaller();

    await expect(
      caller.getActivityFileUrl({
        filePath: "22222222-2222-4222-8222-222222222222/ride.fit",
        expiresIn: 600,
      }),
    ).rejects.toThrow("Access denied: You can only access your own files");
  });

  it("accepts signed download responses without expiresAt", async () => {
    mocks.storage.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl: "https://download.test/11111111-1111-4111-8111-111111111111/ride.fit",
      },
      error: null,
    });

    const caller = createCaller();

    await expect(
      caller.getActivityFileUrl({
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
        expiresIn: 600,
      }),
    ).resolves.toEqual({
      signedUrl: "https://download.test/11111111-1111-4111-8111-111111111111/ride.fit",
    });
  });

  it("requires activityId for stream access", async () => {
    const caller = createCaller();

    await expect(caller.getStreams({} as Parameters<typeof caller.getStreams>[0])).rejects.toThrow(
      /activityId/,
    );
  });

  it("returns parsed streams for an owned activity", async () => {
    const activityId = "66666666-6666-4666-8666-666666666666";
    const segmentId = "99999999-9999-4999-8999-999999999999";
    const { db } = createDbMock({
      selectResults: [
        [
          {
            activityFilePath: `artifacts/sha256/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}`,
            activityFileType: "fit",
            profile_id: "11111111-1111-4111-8111-111111111111",
            is_private: true,
            activityType: "bike",
            parentStartedAt: new Date("2026-03-01T10:00:00.000Z"),
            startOffsetMs: 0,
            endOffsetMs: 20_000,
            sourceSessionIndex: 0,
          },
        ],
      ],
    });

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime: new Date("2026-03-01T10:00:00.000Z") },
      records: [
        {
          messageIndex: 0,
          lapMessageIndex: 0,
          timestamp: new Date("2026-03-01T10:00:00.000Z"),
          distance: 0,
          power: 240,
          heartRate: 160,
        },
        { timestamp: new Date("2026-03-01T10:00:10.000Z"), power: 300, heartRate: 180 },
      ],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: {
        totalTime: 1800,
        totalDistance: 20000,
        totalDescent: 125,
        poolLength: 25,
        poolLengthUnit: "metric",
        totalStrokes: 40,
        avgStrokeDistance: 1.25,
      },
      semantics: {
        segments: [
          {
            role: "activity",
            category: "bike",
            startOffsetMs: 0,
            endOffsetMs: 1_800_000,
            activeMs: 1_800_000,
            distanceMeters: 20_000,
          },
        ],
        totals: { elapsedMs: 1_800_000, activeMs: 1_800_000, distanceMeters: 20_000 },
      },
    });

    const caller = createCaller({ db });
    const result = await caller.getStreams({
      activityId,
      scope: { type: "segment", segmentId },
    });

    expect(mocks.storage.download).toHaveBeenCalledWith(
      `artifacts/sha256/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}`,
    );
    expect(mocks.parseActivityFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: "fit" }),
    );
    expect(result).toMatchObject({
      records: [
        {
          messageIndex: 0,
          lapMessageIndex: 0,
          timestamp: new Date("2026-03-01T10:00:00.000Z"),
          distance: 0,
          power: 240,
          heartRate: 160,
        },
        { timestamp: new Date("2026-03-01T10:00:10.000Z"), power: 300, heartRate: 180 },
      ],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: {
        totalTime: 1800,
        totalDistance: 20000,
        totalDescent: 125,
        poolLength: 25,
        poolLengthUnit: "metric",
        totalStrokes: 40,
        avgStrokeDistance: 1.25,
      },
      analysis: {
        version: "2",
        sport: "bike",
        distributions: {
          heart_rate: {
            threshold: 180,
            time_weighted_average: 160,
            quality: { status: "sufficient", integrated_seconds: 10, coverage_ratio: 1 },
          },
          power: {
            threshold: 300,
            threshold_identity: {
              source: "manual",
              observed_at: "2026-02-20T00:00:00.000Z",
              confidence: "high",
              stale: false,
              estimate: false,
              calculation_version: null,
            },
            time_weighted_average: 240,
            quality: { status: "sufficient", integrated_seconds: 10, coverage_ratio: 1 },
          },
        },
        heart_rate_load: {
          value: 0.219,
          reason: null,
          lthr_bpm: 180,
          calculation_version: "lthr_normalized_squared_v1",
          max_heart_rate_bpm: 250,
        },
      },
    });
    expect(mocks.resolveActivityContextAsOf).toHaveBeenCalledWith({
      store: { db },
      profileId: "11111111-1111-4111-8111-111111111111",
      activityTimestamp: new Date("2026-03-01T10:00:00.000Z"),
      activityId,
      evidenceScope: "thresholds",
    });
  });

  it("analyzes only the requested source session in a multisport artifact", async () => {
    const activityId = "66666666-6666-4666-8666-666666666666";
    const { db } = createDbMock({
      selectResults: [
        [
          {
            activityFilePath:
              "activities/11111111-1111-4111-8111-111111111111/uploads/multisport.fit",
            activityFileType: "fit",
            profile_id: "11111111-1111-4111-8111-111111111111",
            activityType: "run",
            parentStartedAt: new Date("2026-03-01T10:00:00.000Z"),
            startOffsetMs: 600_000,
            endOffsetMs: 1_200_000,
            sourceSessionIndex: 1,
          },
        ],
      ],
    });
    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "multisport", startTime: new Date("2026-03-01T10:00:00.000Z") },
      records: [
        { timestamp: new Date("2026-03-01T10:01:00.000Z"), sessionMessageIndex: 0, power: 250 },
        { timestamp: new Date("2026-03-01T10:11:00.000Z"), sessionMessageIndex: 1, heartRate: 165 },
      ],
      laps: [],
      lengths: [],
      summary: { totalTime: 1200, totalDistance: 5000 },
    });

    const result = await createCaller({ db }).getStreams({
      activityId,
      scope: { type: "session", sessionMessageIndex: 1 },
    });

    expect(result.records).toEqual([
      expect.objectContaining({ sessionMessageIndex: 1, heartRate: 165 }),
    ]);
    expect(result.analysis.sport).toBe("run");
  });

  it("does not expose parser validation details when stream decoding fails", async () => {
    const activityId = "66666666-6666-4666-8666-666666666666";
    const { db } = createDbMock({
      selectResults: [
        [
          {
            activityFilePath:
              "activities/11111111-1111-4111-8111-111111111111/uploads/activity.fit",
            activityFileType: "fit",
            profile_id: "11111111-1111-4111-8111-111111111111",
            is_private: true,
            activityType: "run",
            parentStartedAt: new Date("2026-03-01T10:00:00.000Z"),
            startOffsetMs: 0,
            endOffsetMs: 60_000,
            sourceSessionIndex: 0,
          },
        ],
      ],
    });
    const parserError = new Error('Sensitive parser detail at ["segments",0,"activeMs"]');
    mocks.parseActivityFile.mockImplementation(() => {
      throw parserError;
    });

    const result = createCaller({ db }).getStreams({
      activityId,
      scope: { type: "segment", segmentId: "99999999-9999-4999-8999-999999999999" },
    });

    const rejection: unknown = await result.catch((error: unknown) => error);
    expect(rejection).toMatchObject({
      message: "Failed to retrieve activity streams",
      cause: { message: "Activity stream parsing failed", cause: parserError },
    });
    expect(rejection).not.toMatchObject({ cause: parserError });
  });

  it("rejects stream access when an authorized activity has no activity file", async () => {
    const activityId = "77777777-7777-4777-8777-777777777777";
    const { db } = createDbMock({
      selectResults: [
        [
          {
            activityFilePath: null,
            profile_id: "11111111-1111-4111-8111-111111111111",
            is_private: true,
            activityType: "bike",
          },
        ],
      ],
    });

    const caller = createCaller({ db });

    await expect(
      caller.getStreams({
        activityId,
        scope: { type: "segment", segmentId: "99999999-9999-4999-8999-999999999999" },
      }),
    ).rejects.toThrow("Activity does not have an associated activity file");
  });

  it("rejects stream access for non-owners even when the activity is public", async () => {
    const activityId = "88888888-8888-4888-8888-888888888888";
    const { db } = createDbMock({
      selectResults: [
        [
          {
            activityFilePath: "activities/22222222-2222-4222-8222-222222222222/uploads/public.fit",
            profile_id: "22222222-2222-4222-8222-222222222222",
            is_private: false,
            activityType: "bike",
          },
        ],
      ],
    });

    const caller = createCaller({ db });

    await expect(
      caller.getStreams({
        activityId,
        scope: { type: "segment", segmentId: "99999999-9999-4999-8999-999999999999" },
      }),
    ).rejects.toThrow("Detailed activity streams are only available to the activity owner");
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("retains an accepted immutable artifact when decoded data is malformed", async () => {
    const { db } = createDbMock();

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime: "2025-05-10T10:00:00.000Z" },
      summary: { totalTime: 3600, totalDistance: 40250 },
      records: [],
      laps: [],
      lengths: [],
    });
    mocks.processManualActivityFile.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "Failed to parse activity file" }),
    );

    const caller = createCaller({ db });

    await expect(
      caller.processActivityFile({
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
        name: "Morning Ride",
        notes: "Imported",
      }),
    ).rejects.toThrow("Failed to parse activity file");

    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });
});
