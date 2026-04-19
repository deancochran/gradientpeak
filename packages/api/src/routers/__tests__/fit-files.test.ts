import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", () => ({
  activities: {
    id: "activities.id",
    profile_id: "activities.profile_id",
    is_private: "activities.is_private",
  },
  activityEfforts: { table: "activity_efforts" },
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
  parseFitFileWithSDK: mocks.parseFitFileWithSDK,
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
}));

import { fitFilesRouter } from "../fit-files";

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
  };

  const builder: any = {
    from: vi.fn(() => builder),
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
      Promise.resolve(selectResults.shift() ?? []).then(onFulfilled),
  };

  const db = {
    execute: vi.fn(async (query: unknown) => {
      callLog.executeCalls.push(query);
      return (executeResults.shift() as { rows?: unknown[] } | undefined) ?? { rows: [] };
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        callLog.insertCalls.push({ table, values });
        return values;
      }),
    })),
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

  return fitFilesRouter.createCaller({
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

describe("fitFilesRouter", () => {
  it("creates signed upload URLs for FIT uploads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T12:00:00.000Z"));

    const caller = createCaller();
    const result = await caller.getSignedUploadUrl({ fileName: "ride.fit", fileSize: 1234 });

    expect(mocks.storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "activities/11111111-1111-4111-8111-111111111111/uploads/1775217600000_ride.fit",
    );
    expect(result).toMatchObject({
      filePath: "activities/11111111-1111-4111-8111-111111111111/uploads/1775217600000_ride.fit",
      token: "upload-token",
    });
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

  it("processes FIT uploads through ctx.db and records derived side effects", async () => {
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

    mocks.parseFitFileWithSDK.mockReturnValue({
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
    const result = await caller.processFitFile({
      fitFilePath: "activities/user/uploads/123_history.fit",
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
    expect(callLog.executeCalls).toHaveLength(1);
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

  it("uploads FIT file bytes to storage", async () => {
    const caller = createCaller();
    const result = await caller.uploadFitFile({
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

  it("invokes the analyze-fit-file edge function", async () => {
    const caller = createCaller();
    const activityId = "22222222-2222-4222-8222-222222222222";

    const result = await caller.analyzeFitFile({
      activityId,
      filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
      bucketName: "fit-files",
    });

    expect(mocks.functionsInvoke).toHaveBeenCalledWith("analyze-fit-file", {
      body: {
        activityId,
        bucketName: "fit-files",
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
      },
    });
    expect(result).toEqual({ queued: true });
  });

  it("rejects malformed analyze-fit-file responses", async () => {
    mocks.functionsInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    const caller = createCaller();

    await expect(
      caller.analyzeFitFile({
        activityId: "22222222-2222-4222-8222-222222222222",
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
        bucketName: "fit-files",
      }),
    ).rejects.toThrow("FIT file analysis failed");
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
    const result = await caller.getFitFileStatus({ activityId });

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
    const result = await caller.listFitFiles({ pageSize: 2 });

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

  it("rejects download URLs for another user's FIT file", async () => {
    const caller = createCaller();

    await expect(
      caller.getFitFileUrl({
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
      caller.getFitFileUrl({
        filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
        expiresIn: 600,
      }),
    ).resolves.toEqual({
      signedUrl: "https://download.test/11111111-1111-4111-8111-111111111111/ride.fit",
    });
  });

  it("deletes an owned FIT file from storage", async () => {
    const caller = createCaller();

    const result = await caller.deleteFitFile({
      filePath: "11111111-1111-4111-8111-111111111111/ride.fit",
    });

    expect(mocks.storage.remove).toHaveBeenCalledWith([
      "11111111-1111-4111-8111-111111111111/ride.fit",
    ]);
    expect(result).toEqual({ success: true });
  });

  it("rejects FIT stream access when the path only contains the user id", async () => {
    const caller = createCaller();

    await expect(
      caller.getStreams({
        fitFilePath: "tmp/11111111-1111-4111-8111-111111111111-ride.fit",
      }),
    ).rejects.toThrow("Failed to retrieve streams: Access denied");
  });

  it("returns parsed streams for an owned activity", async () => {
    const activityId = "66666666-6666-4666-8666-666666666666";
    const { db } = createDbMock({
      findFirstResults: [{ profile_id: "11111111-1111-4111-8111-111111111111", is_private: true }],
    });

    mocks.parseFitFileWithSDK.mockReturnValue({
      metadata: { type: "cycling", startTime: new Date("2026-03-01T10:00:00.000Z") },
      records: [{ timestamp: new Date("2026-03-01T10:00:00.000Z"), power: 240 }],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: { totalTime: 1800, totalDistance: 20000 },
    });

    const caller = createCaller({ db });
    const result = await caller.getStreams({
      fitFilePath: "11111111-1111-4111-8111-111111111111/ride.fit",
      activityId,
    });

    expect(result).toEqual({
      records: [{ timestamp: new Date("2026-03-01T10:00:00.000Z"), power: 240 }],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: { totalTime: 1800, totalDistance: 20000 },
    });
  });

  it("cleans up malformed parsed FIT data during processing", async () => {
    const { db } = createDbMock();

    mocks.parseFitFileWithSDK.mockReturnValue({
      metadata: { type: "cycling", startTime: "2025-05-10T10:00:00.000Z" },
      summary: { totalTime: 3600, totalDistance: 40250 },
      records: [],
      laps: [],
      lengths: [],
    });

    const caller = createCaller({ db });

    await expect(
      caller.processFitFile({
        fitFilePath: "activities/user/uploads/123_history.fit",
        name: "Morning Ride",
        notes: "Imported",
        activityType: "bike",
      }),
    ).rejects.toThrow("Failed to parse FIT file");

    expect(mocks.storage.remove).toHaveBeenCalledWith(["activities/user/uploads/123_history.fit"]);
  });
});
