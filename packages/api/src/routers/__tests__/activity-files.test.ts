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
    activity_file_path: "activities.activity_file_path",
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
  profileEstimationState: {
    profile_id: "profile_estimation_state.profile_id",
    metrics_revision: "profile_estimation_state.metrics_revision",
    performance_revision: "profile_estimation_state.performance_revision",
    fitness_revision: "profile_estimation_state.fitness_revision",
  },
  activityPlans: {
    id: "activity_plans.id",
    profile_id: "activity_plans.profile_id",
  },
  activityPlanRefreshQueue: {
    profile_id: "activity_plan_refresh_queue.profile_id",
    activity_plan_id: "activity_plan_refresh_queue.activity_plan_id",
  },
}));

const mocks = vi.hoisted(() => ({
  calculateBounds: vi.fn(),
  encodePolyline: vi.fn(),
  inferActivityFileType: vi.fn(),
  parseActivityFile: vi.fn(),
  parseFitFileWithSDK: vi.fn(),
  calculateBestEfforts: vi.fn(),
  calculateDecouplingFromStreams: vi.fn(),
  calculateEfficiencyFactor: vi.fn(),
  calculateGradedSpeedStream: vi.fn(),
  calculateNGP: vi.fn(),
  calculateNormalizedPower: vi.fn(),
  calculateNormalizedSpeed: vi.fn(),
  detectLTHR: vi.fn(),
  estimateVO2Max: vi.fn(),
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
  db: {
    current: null as any,
  },
}));

vi.mock("@repo/core", () => ({
  calculateBounds: mocks.calculateBounds,
  encodePolyline: mocks.encodePolyline,
  inferActivityFileType: mocks.inferActivityFileType,
  parseActivityFile: mocks.parseActivityFile,
  parseFitFileWithSDK: mocks.parseFitFileWithSDK,
  simplifyCoordinates: vi.fn((coords) => coords),
  canTransitionActivityFileIngestionStatus: vi.fn(() => true),
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

vi.mock("../../utils/profile-estimation-state", () => ({
  bumpProfileEstimationState: vi.fn(async () => undefined),
  markProfileAnalysisDirty: vi.fn(async () => undefined),
}));

import { activityFilesRouter } from "../activity-files";

type MockDbPlan = {
  selectResults?: unknown[][];
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

  const builder: any = {
    from: vi.fn(() => builder),
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
      Promise.resolve(selectResults.shift() ?? [findFirstResults.shift()].filter(Boolean)).then(
        onFulfilled,
      ),
  };

  const db = {
    execute: vi.fn(async (query: unknown) => {
      callLog.executeCalls.push(query);
      return (executeResults.shift() as { rows?: unknown[] } | undefined) ?? { rows: [] };
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        callLog.insertCalls.push({ table, values });
        return {
          onConflictDoUpdate: vi.fn(async () => values),
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
            returning: vi.fn(async () => selectResults.shift() ?? [set]),
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
  mocks.calculateBounds.mockReturnValue({ minLat: 40, maxLat: 41, minLng: -74, maxLng: -73 });
  mocks.encodePolyline.mockReturnValue("encoded-polyline");
  mocks.inferActivityFileType.mockImplementation((fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension === "fit" || extension === "gpx" || extension === "tcx") return extension;
    throw new Error("Unsupported activity file type");
  });

  mocks.calculateBestEfforts.mockReturnValue([{ duration: 1200, value: 300, startIndex: 0 }]);
  mocks.calculateDecouplingFromStreams.mockReturnValue(0.03);
  mocks.calculateEfficiencyFactor.mockReturnValue(1.55);
  mocks.calculateGradedSpeedStream.mockReturnValue([4.5, 4.7]);
  mocks.calculateNGP.mockReturnValue(4.6);
  mocks.calculateNormalizedPower.mockReturnValue(250);
  mocks.calculateNormalizedSpeed.mockReturnValue(11.1);
  mocks.detectLTHR.mockReturnValue(175);
  mocks.estimateVO2Max.mockReturnValue(52);
  mocks.fetchActivityTemperature.mockResolvedValue(null);
});

describe("activityFilesRouter", () => {
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

  it("processes activity uploads through ctx.db and records derived side effects", async () => {
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
    const { db, callLog } = createDbMock({
      selectResults: [[{ value: "168" }], [{ value: "188" }], [{ value: "52" }]],
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
    });

    const caller = createCaller({ db });
    const result = await caller.processActivityFile({
      activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
      name: "Morning Ride",
      notes: "Imported",
      activityType: "bike",
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
    expect(callLog.insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.arrayContaining([
            expect.objectContaining({
              activity_id: createdActivity.id,
              effort_type: "power",
              profile_id: "11111111-1111-4111-8111-111111111111",
              recorded_at: finishedAt,
            }),
          ]),
        }),
        expect.objectContaining({
          values: expect.objectContaining({
            metric_type: "lthr",
            recorded_at: finishedAt,
            value: 175,
          }),
        }),
      ]),
    );
    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });

  it("uploads activity file bytes to storage", async () => {
    const caller = createCaller();
    const result = await caller.uploadActivityFile({
      fileName: "ride.fit",
      fileSize: 4,
      fileType: "ride.fit",
      fileData: Buffer.from("test").toString("base64"),
    });

    expect(mocks.storage.upload).toHaveBeenCalledTimes(1);
    const [filePath, bytes, options] = mocks.storage.upload.mock.calls[0] ?? [];
    expect(filePath).toMatch(/^11111111-1111-4111-8111-111111111111\//);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(options).toMatchObject({ contentType: "application/octet-stream", upsert: false });
    expect(result).toMatchObject({ success: true, size: 4 });
  });

  it("rejects processing activity files owned by another user", async () => {
    const { db } = createDbMock();
    const caller = createCaller({ db });

    await expect(
      caller.processActivityFile({
        activityFilePath: "activities/22222222-2222-4222-8222-222222222222/uploads/ride.fit",
        name: "Other Ride",
        activityType: "bike",
      }),
    ).rejects.toThrow("Access denied");

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
      type: "bike",
      started_at: startTime,
      finished_at: finishedAt,
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
    const processingIngestion = { ...pendingIngestion, status: "processing", attempt_count: 1 };
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
        [processingIngestion],
        [readyIngestion],
      ],
      findFirstResults: [activity],
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
    expect(callLog.insertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.objectContaining({
            activity_id: activityId,
            activity_file_path: `activities/${userId}/uploads/phase5.fit`,
            activity_file_size: 12345,
            import_file_type: "fit",
            profile_id: userId,
          }),
        }),
        expect.objectContaining({
          values: expect.arrayContaining([
            expect.objectContaining({ activity_id: activityId, lap_index: 0, profile_id: userId }),
          ]),
        }),
      ]),
    );
    expect(mocks.storage.remove).not.toHaveBeenCalled();
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
    const activity = { id: activityId, profile_id: userId, type: "bike" };
    const pendingIngestion = {
      id: ingestionId,
      activity_id: activityId,
      profile_id: userId,
      status: "pending_upload",
      attempt_count: 0,
    };
    const uploadedIngestion = { ...pendingIngestion, status: "uploaded" };
    const processingIngestion = { ...pendingIngestion, status: "processing", attempt_count: 1 };
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
    ).rejects.toThrow("Failed to parse activity file");
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

  it("invokes the analyze-activity-file edge function", async () => {
    const caller = createCaller();
    const activityId = "22222222-2222-4222-8222-222222222222";

    const result = await caller.analyzeActivityFile({
      activityId,
      filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
      bucketName: "activity-files",
    });

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("analyze-activity-file", {
      body: {
        activityId,
        bucketName: "activity-files",
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
      },
    });
    expect(result).toEqual({ queued: true });
  });

  it("rejects malformed analyze-activity-file responses", async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const caller = createCaller();

    await expect(
      caller.analyzeActivityFile({
        activityId: "22222222-2222-4222-8222-222222222222",
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
        bucketName: "activity-files",
      }),
    ).rejects.toThrow("Activity file analysis failed");
  });

  it("returns serialized activity details for FIT processing status", async () => {
    const activityId = "33333333-3333-4333-8333-333333333333";
    const createdAt = new Date("2026-01-01T12:00:00.000Z");
    const { db } = createDbMock({
      findFirstResults: [
        {
          id: activityId,
          name: "Imported Ride",
          type: "bike",
          started_at: createdAt,
        },
      ],
    });

    const caller = createCaller({ db });
    const result = await caller.getActivityFileStatus({ activityId });

    expect(result).toEqual({
      activity: {
        id: activityId,
        name: "Imported Ride",
        started_at: createdAt.toISOString(),
        type: "bike",
      },
      filePath: null,
      fileSize: null,
      processingStatus: "pending",
      updatedAt: null,
      version: null,
    });
  });

  it("lists FIT-backed activities with a next cursor", async () => {
    const firstCreatedAt = new Date("2026-02-01T12:00:00.000Z");
    const secondCreatedAt = new Date("2026-01-31T12:00:00.000Z");
    const { db } = createDbMock({
      selectResults: [
        [
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Ride A",
            type: "bike",
            started_at: firstCreatedAt,
            created_at: firstCreatedAt,
          },
          {
            id: "55555555-5555-4555-8555-555555555555",
            name: "Ride B",
            type: "bike",
            started_at: secondCreatedAt,
            created_at: secondCreatedAt,
          },
        ],
      ],
    });

    const caller = createCaller({ db });
    const result = await caller.listActivityFiles({ pageSize: 2 });

    expect(result).toEqual({
      files: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Ride A",
          type: "bike",
          started_at: firstCreatedAt.toISOString(),
          created_at: firstCreatedAt.toISOString(),
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          name: "Ride B",
          type: "bike",
          started_at: secondCreatedAt.toISOString(),
          created_at: secondCreatedAt.toISOString(),
        },
      ],
      nextCursor: secondCreatedAt.toISOString(),
    });
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

  it("deletes an owned activity file from storage", async () => {
    const caller = createCaller();

    const result = await caller.deleteActivityFile({
      filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
    });

    expect(mocks.storage.remove).toHaveBeenCalledWith([
      "11111111-1111-4111-8111-111111111111/ride.fit",
    ]);
    expect(result).toEqual({ success: true });
  });

  it("rejects activity stream access when the path only contains the user id", async () => {
    const caller = createCaller();

    await expect(
      caller.getStreams({
        activityFilePath: "tmp/11111111-1111-4111-8111-111111111111-ride.fit",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Access denied: You can only access your own files",
    });
  });

  it("returns parsed streams for an owned activity", async () => {
    const activityId = "66666666-6666-4666-8666-666666666666";
    const { db } = createDbMock({
      findFirstResults: [
        {
          activity_file_path:
            "activities/11111111-1111-4111-8111-111111111111/uploads/authorized.fit",
          profile_id: "11111111-1111-4111-8111-111111111111",
          is_private: true,
        },
      ],
    });

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime: new Date("2026-03-01T10:00:00.000Z") },
      records: [{ timestamp: new Date("2026-03-01T10:00:00.000Z"), power: 240 }],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: { totalTime: 1800, totalDistance: 20000 },
    });

    const caller = createCaller({ db });
    const result = await caller.getStreams({
      activityFilePath: "11111111-1111-4111-8111-111111111111/ignored.fit",
      activityId,
    });

    expect(mocks.storage.download).toHaveBeenCalledWith(
      "activities/11111111-1111-4111-8111-111111111111/uploads/authorized.fit",
    );
    expect(result).toEqual({
      records: [{ timestamp: new Date("2026-03-01T10:00:00.000Z"), power: 240 }],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: { totalTime: 1800, totalDistance: 20000 },
    });
  });

  it("rejects stream access when an authorized activity has no activity file", async () => {
    const activityId = "77777777-7777-4777-8777-777777777777";
    const { db } = createDbMock({
      findFirstResults: [
        {
          activity_file_path: null,
          profile_id: "11111111-1111-4111-8111-111111111111",
          is_private: true,
        },
      ],
    });

    const caller = createCaller({ db });

    await expect(
      caller.getStreams({
        activityFilePath: "11111111-1111-4111-8111-111111111111/ignored.fit",
        activityId,
      }),
    ).rejects.toThrow("Activity does not have an associated activity file");
  });

  it("rejects stream access for non-owners even when the activity is public", async () => {
    const activityId = "88888888-8888-4888-8888-888888888888";
    const { db } = createDbMock({
      findFirstResults: [
        {
          activity_file_path: "activities/22222222-2222-4222-8222-222222222222/uploads/public.fit",
          profile_id: "22222222-2222-4222-8222-222222222222",
          is_private: false,
        },
      ],
    });

    const caller = createCaller({ db });

    await expect(
      caller.getStreams({
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/ignored.fit",
        activityId,
      }),
    ).rejects.toThrow("Detailed activity streams are only available to the activity owner");
    expect(mocks.storage.download).not.toHaveBeenCalled();
  });

  it("cleans up malformed parsed activity data during processing", async () => {
    const { db } = createDbMock();

    mocks.parseActivityFile.mockReturnValue({
      metadata: { type: "cycling", startTime: "2025-05-10T10:00:00.000Z" },
      summary: { totalTime: 3600, totalDistance: 40250 },
      records: [],
      laps: [],
      lengths: [],
    });

    const caller = createCaller({ db });

    await expect(
      caller.processActivityFile({
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
        name: "Morning Ride",
        notes: "Imported",
        activityType: "bike",
      }),
    ).rejects.toThrow("Failed to parse activity file");

    expect(mocks.storage.remove).toHaveBeenCalledWith([
      "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
    ]);
  });
});
