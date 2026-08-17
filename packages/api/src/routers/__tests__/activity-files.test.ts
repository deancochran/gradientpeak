import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/db")>()),
  activities: {
    id: "activities.id",
    created_at: "activities.created_at",
    profile_id: "activities.profile_id",
    name: "activities.name",
    type: "activities.type",
    started_at: "activities.started_at",
    finished_at: "activities.finished_at",
    activity_file_path: "activities.activity_file_path",
  },
  activityArtifacts: {
    id: "activity_artifacts.id",
    profile_id: "activity_artifacts.profile_id",
    availability: "activity_artifacts.availability",
    digest: "activity_artifacts.digest",
    byte_size: "activity_artifacts.byte_size",
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
    activity_category: "activity_segments.activity_category",
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
    artifact_id: "activity_file_ingestions.artifact_id",
    profile_id: "activity_file_ingestions.profile_id",
    source: "activity_file_ingestions.source",
    operation_key: "activity_file_ingestions.operation_key",
    status: "activity_file_ingestions.status",
    claim_token: "activity_file_ingestions.claim_token",
    lease_expires_at: "activity_file_ingestions.lease_expires_at",
    attempt_count: "activity_file_ingestions.attempt_count",
    staging_cleanup_pending: "activity_file_ingestions.staging_cleanup_pending",
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
  calculateNormalizedPower: vi.fn(),
  calculateNormalizedSpeed: vi.fn(),
  estimateVO2Max: vi.fn(),
  createActivityAnalysisStore: vi.fn(),
  getPerformanceTargetsAsOf: vi.fn(),
  fetchActivityTemperature: vi.fn(),
  storage: {
    createBucket: vi.fn(),
    createSignedUploadUrl: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
  },
  readObjectBounded: vi.fn(),
  functionsInvoke: vi.fn(),
  processManualActivityFile: vi.fn(),
  beginMobileRecordingUploadClaim: vi.fn(),
  drainPendingMobileRecordingStagingCleanup: vi.fn(),
  readActivityIngestionSafeStatus: vi.fn(),
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

vi.mock("@repo/core/calculations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/core/calculations")>()),
  calculateNormalizedPower: mocks.calculateNormalizedPower,
  calculateNormalizedSpeed: mocks.calculateNormalizedSpeed,
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
    readObjectBounded: mocks.readObjectBounded,
  }),
  getActivityArtifactStorageService: () => ({
    storage: {
      from: () => ({ upload: mocks.storage.upload, remove: mocks.storage.remove }),
    },
    readObjectBounded: mocks.readObjectBounded,
  }),
}));

vi.mock("../../db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../db")>();
  return {
    ...actual,
    getRequiredDb: () => mocks.db.current,
    withProfileFencedRepeatableReadSnapshot: async <Result>(
      db: Parameters<typeof actual.withRepeatableReadSnapshot>[0],
      profileId: string,
      write: Parameters<typeof actual.withRepeatableReadSnapshot<Result>>[1],
    ) =>
      actual.withRepeatableReadSnapshot(
        db,
        async (tx) => {
          await tx.execute({ profileId } as never);
          return write(tx);
        },
        { accessMode: "read write" },
      ),
  };
});

vi.mock("../../infrastructure/repositories/drizzle-activity-analysis-repository", () => ({
  createActivityAnalysisStore: mocks.createActivityAnalysisStore,
}));

vi.mock("../../application/activity-file-ingestion/process-manual-activity-file", () => ({
  processManualActivityFile: mocks.processManualActivityFile,
}));
vi.mock("../../application/activity-file-ingestion/activity-ingestion-actions", () => ({
  ActivityIngestionNotFoundError: class ActivityIngestionNotFoundError extends Error {},
  ActivityIngestionStateConflictError: class ActivityIngestionStateConflictError extends Error {},
  readActivityIngestionSafeStatus: mocks.readActivityIngestionSafeStatus,
}));
vi.mock(
  "../../application/activity-file-ingestion/mobile-recording-upload",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../application/activity-file-ingestion/mobile-recording-upload")
    >()),
    beginMobileRecordingUploadClaim: mocks.beginMobileRecordingUploadClaim,
    drainPendingMobileRecordingStagingCleanup: mocks.drainPendingMobileRecordingStagingCleanup,
  }),
);

import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { activities } from "@repo/db";
import { MobileRecordingUploadError } from "../../application/activity-file-ingestion/mobile-recording-upload";
import { activityFilesRouter } from "../activity-files";

type MockDbPlan = {
  selectResults?: unknown[][];
  activitySelectResult?: unknown[];
  findFirstResults?: unknown[];
  executeResults?: unknown[];
};

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
    $client: {},
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
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      const { $client: _rootClient, ...transactionExecutor } = db;
      return callback(transactionExecutor);
    }),
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
  mocks.readObjectBounded.mockResolvedValue({
    data: new TextEncoder().encode("fit bytes"),
    contentType: "application/vnd.ant.fit",
  });
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
  mocks.beginMobileRecordingUploadClaim.mockResolvedValue({
    status: "upload",
    ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    byteSize: 9,
    sha256: "a".repeat(64),
    format: "fit",
    mediaType: "application/vnd.ant.fit",
    stagingPath:
      "mobile-recordings/11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.fit",
  });
  mocks.drainPendingMobileRecordingStagingCleanup.mockResolvedValue({
    attempted: 1,
    cleaned: 1,
    pending: 0,
  });
  const safeIngestion = {
    ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    profileId: "11111111-1111-4111-8111-111111111111",
    operationId: "a".repeat(32),
    source: "manual_import",
    activityId: null,
    artifactId: null,
    requestedAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:00:00.000Z",
    status: "failed_retryable",
    failureCode: "dependency_unavailable",
    failedAt: "2026-08-10T08:00:00.000Z",
    actions: { retry: true },
  };
  mocks.readActivityIngestionSafeStatus.mockResolvedValue(safeIngestion);
  mocks.calculateBounds.mockReturnValue({ minLat: 40, maxLat: 41, minLng: -74, maxLng: -73 });
  mocks.encodePolyline.mockReturnValue("encoded-polyline");
  mocks.inferActivityFileType.mockImplementation((fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (extension === "fit" || extension === "gpx" || extension === "tcx") return extension;
    throw new Error("Unsupported activity file type");
  });

  mocks.calculateNormalizedPower.mockReturnValue(calculateCyclingNormalizedPower({ samples: [] }));
  mocks.calculateNormalizedSpeed.mockReturnValue(11.1);
  mocks.estimateVO2Max.mockReturnValue(52);
  mocks.fetchActivityTemperature.mockResolvedValue(null);
  mocks.getPerformanceTargetsAsOf.mockImplementation(
    ({ asOf, profileId }: { asOf: Date; profileId: string }) =>
      Promise.resolve(
        buildPerformanceTargetFactsFixture({
          asOf: asOf.toISOString(),
          athleteId: profileId,
          heartRateObservedAt: "2026-02-20T00:00:00.000Z",
          lthrBpm: { bike: 180 },
          bikeThresholdWatts: 300,
        }),
      ),
  );
  mocks.createActivityAnalysisStore.mockImplementation((db) => ({
    db,
    getPerformanceTargetsAsOf: mocks.getPerformanceTargetsAsOf,
  }));
});

describe("activityFilesRouter", () => {
  it("protects safe ingestion status and denies cross-profile access before the read", async () => {
    const unauthenticated = activityFilesRouter.createCaller({
      session: null,
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as never);
    await expect(
      unauthenticated.getIngestionStatus({
        profileId: "11111111-1111-4111-8111-111111111111",
        ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      createCaller({ userId: "22222222-2222-4222-8222-222222222222" }).getIngestionStatus({
        profileId: "11111111-1111-4111-8111-111111111111",
        ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.readActivityIngestionSafeStatus).not.toHaveBeenCalled();
  });

  it("returns only safe ingestion status and requires retries through source resubmission", async () => {
    const caller = createCaller({ db: createDbMock().db });
    const status = await caller.getIngestionStatus({
      profileId: "11111111-1111-4111-8111-111111111111",
      ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(status.actions).toEqual({ retry: true });
    expect(status).not.toHaveProperty("claimToken");
    expect(status).not.toHaveProperty("stagingPath");
    expect(status).not.toHaveProperty("rawError");
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("retryIngestion");
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("cancelIngestion");
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("markUploadedAndProcess");
  });

  it("does not expose evidence maintenance as an end-user procedure", () => {
    expect(activityFilesRouter._def.procedures).not.toHaveProperty("recalculateOwnedEvidence");
  });

  it("returns a signed URL only after creating the actor-owned recording claim", async () => {
    const { db } = createDbMock();
    const result = await createCaller({ db }).beginMobileRecordingUpload({
      recordingSessionId: "recording-session-1",
      byteSize: 9,
      sha256: "a".repeat(64),
      format: "fit",
    });

    expect(mocks.beginMobileRecordingUploadClaim).toHaveBeenCalledWith(db, {
      profileId: "11111111-1111-4111-8111-111111111111",
      recordingSessionId: "recording-session-1",
      byteSize: 9,
      sha256: "a".repeat(64),
      format: "fit",
    });
    expect(mocks.storage.createSignedUploadUrl).toHaveBeenCalledWith(
      "mobile-recordings/11111111-1111-4111-8111-111111111111/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.fit",
      { upsert: true },
    );
    expect(result).toMatchObject({
      status: "upload",
      ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      token: "upload-token",
    });
    expect(result).not.toHaveProperty("stagingPath");
  });

  it("returns an already accepted claim without issuing another upload URL", async () => {
    mocks.beginMobileRecordingUploadClaim.mockResolvedValueOnce({
      status: "ready",
      ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      byteSize: 9,
      sha256: "a".repeat(64),
      format: "fit",
      mediaType: "application/vnd.ant.fit",
    });

    const result = await createCaller({ db: createDbMock().db }).beginMobileRecordingUpload({
      recordingSessionId: "recording-session-1",
      byteSize: 9,
      sha256: "a".repeat(64),
      format: "fit",
    });
    expect(result).toEqual({
      status: "ready",
      ingestionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      activityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
    expect(mocks.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("maps immutable recording-claim conflicts to a client-safe conflict", async () => {
    mocks.beginMobileRecordingUploadClaim.mockRejectedValueOnce(
      new MobileRecordingUploadError("claim_conflict", "Recording upload metadata conflicts"),
    );
    await expect(
      createCaller({ db: createDbMock().db }).beginMobileRecordingUpload({
        recordingSessionId: "recording-session-1",
        byteSize: 9,
        sha256: "a".repeat(64),
        format: "fit",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "Recording upload metadata conflicts" });
    expect(mocks.storage.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("drains bounded pending cleanup only for the authenticated profile", async () => {
    const { db } = createDbMock();
    await expect(
      createCaller({ db }).retryPendingMobileRecordingCleanup({ limit: 5 }),
    ).resolves.toEqual({ attempted: 1, cleaned: 1, pending: 0 });
    expect(mocks.drainPendingMobileRecordingStagingCleanup).toHaveBeenCalledWith(
      db,
      expect.anything(),
      { profileId: "11111111-1111-4111-8111-111111111111", limit: 5 },
    );
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
    ).rejects.toThrow("Unable to prepare activity file upload");
  });

  it("redacts synthetic private data from manual upload preparation errors", async () => {
    const privateCanaries = [
      "11111111-1111-4111-8111-111111111111",
      "Dean Private Ride",
      "https://storage.test/upload?token=super-secret-token",
    ] as const;
    mocks.storage.createSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: privateCanaries.join(" ") },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const rejection = await createCaller()
        .getSignedUploadUrl({ fileName: "ride.fit", fileSize: 1234 })
        .catch((error: unknown) => error);
      expect(rejection).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to prepare activity file upload",
      });
      const logged = JSON.stringify(consoleError.mock.calls);
      expect(logged).toContain("manual_activity_import.prepare_upload.prepare_failed");
      for (const canary of privateCanaries) expect(logged).not.toContain(canary);
    } finally {
      consoleError.mockRestore();
    }
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
          activity_category: "bike",
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
        originalName: "history.fit",
        fileType: "fit",
      }),
      expect.objectContaining({
        readStoredActivityFile: expect.any(Function),
        decodeActivityFile: expect.any(Function),
      }),
    );
    const dependencies = mocks.processManualActivityFile.mock.calls[0]?.[2];
    const stored = await dependencies.readStoredActivityFile({
      activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
      removeOnParseFailure: false,
    });
    expect(stored.activityFile.type).toBe("application/vnd.ant.fit");
    expect(mocks.readObjectBounded).toHaveBeenCalledWith({
      bucket: "activity-files",
      path: "activities/11111111-1111-4111-8111-111111111111/uploads/123_history.fit",
      maxBytes: 50 * 1024 * 1024,
    });
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

    expect(mocks.readObjectBounded).not.toHaveBeenCalled();
  });

  it("returns and logs only allowlisted manual processing failures", async () => {
    const privateCanaries = [
      "activities/11111111-1111-4111-8111-111111111111/uploads/dean-private.fit",
      "Dean Private Ride",
      "https://storage.test/upload?token=super-secret-token",
    ] as const;
    mocks.processManualActivityFile.mockRejectedValueOnce(new Error(privateCanaries.join(" ")));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const rejection = await createCaller({ db: createDbMock().db })
        .processActivityFile({
          activityFilePath: privateCanaries[0],
          name: privateCanaries[1],
        })
        .catch((error: unknown) => error);
      expect(rejection).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Activity file processing failed",
      });
      const logged = JSON.stringify(consoleError.mock.calls);
      expect(logged).toContain("manual_activity_import.process.process_failed");
      for (const canary of privateCanaries) expect(logged).not.toContain(canary);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("rejects the removed processActivityFile parent classification field", async () => {
    const { db } = createDbMock();
    const caller = createCaller({ db });
    await expect(
      (caller.processActivityFile as (input: unknown) => Promise<unknown>)({
        activityFilePath: "activities/11111111-1111-4111-8111-111111111111/uploads/legacy.fit",
        name: "Legacy transport",
        activityCategory: "bike",
      }),
    ).rejects.toThrow("Unrecognized key");
    expect(mocks.readObjectBounded).not.toHaveBeenCalled();
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
            activityCategory: "bike",
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
          sessionMessageIndex: 0,
          timestamp: new Date("2026-03-01T10:00:00.000Z"),
          distance: 0,
          power: 240,
          heartRate: 160,
        },
        { timestamp: new Date("2026-03-01T10:00:05.000Z"), sessionMessageIndex: 1 },
        {
          timestamp: new Date("2026-03-01T10:00:10.000Z"),
          sessionMessageIndex: 0,
          power: 300,
          heartRate: 180,
        },
        { timestamp: new Date("2026-03-01T10:00:20.000Z"), sessionMessageIndex: 0 },
      ],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: {
        totalTime: 1800,
        totalDistance: 20000,
        totalDescent: 125,
        poolLengthMeters: 25,
        totalStrokes: 40,
        avgStrokeDistance: 1.25,
      },
      semantics: {
        segments: [
          {
            role: "activity",
            activity_category: "bike",
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

    expect(mocks.readObjectBounded).toHaveBeenCalledWith({
      bucket: "activity-files",
      path: `artifacts/sha256/11111111-1111-4111-8111-111111111111/${"a".repeat(64)}`,
      maxBytes: 50 * 1024 * 1024,
    });
    expect(mocks.parseActivityFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: "fit" }),
    );
    expect(result).toMatchObject({
      records: [
        {
          messageIndex: 0,
          lapMessageIndex: 0,
          sessionMessageIndex: 0,
          timestamp: new Date("2026-03-01T10:00:00.000Z"),
          distance: 0,
          power: 240,
          heartRate: 160,
        },
        {
          timestamp: new Date("2026-03-01T10:00:10.000Z"),
          sessionMessageIndex: 0,
          power: 300,
          heartRate: 180,
        },
        { timestamp: new Date("2026-03-01T10:00:20.000Z"), sessionMessageIndex: 0 },
      ],
      laps: [{ startTime: new Date("2026-03-01T10:00:00.000Z") }],
      lengths: [],
      summary: {
        totalTime: 1800,
        totalDistance: 20000,
        totalDescent: 125,
        poolLengthMeters: 25,
        totalStrokes: 40,
        avgStrokeDistance: 1.25,
      },
      analysis: {
        version: "2",
        activity_category: "bike",
        distributions: {
          heart_rate: {
            threshold: 180,
            time_weighted_average: 170,
            quality: { status: "sufficient", integrated_seconds: 20, coverage_ratio: 1 },
          },
          power: {
            threshold: 300,
            threshold_identity: {
              source: "observed_effort",
              observed_at: "2026-02-28T10:00:00.000Z",
              confidence: "high",
              stale: false,
              estimate: false,
              calculation_version: "threshold-policy-v1",
            },
            time_weighted_average: 270,
            quality: { status: "sufficient", integrated_seconds: 20, coverage_ratio: 1 },
          },
        },
        heart_rate_load: {
          value: 0.497,
          reason: null,
          lthr_bpm: 180,
          calculation_version: "lthr_normalized_squared_v1",
          max_heart_rate_bpm: 250,
        },
      },
    });
    expect(mocks.getPerformanceTargetsAsOf).toHaveBeenCalledWith({
      profileId: "11111111-1111-4111-8111-111111111111",
      asOf: new Date("2026-03-01T10:00:00.000Z"),
      activityIdToExclude: activityId,
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
            activityCategory: "run",
            parentStartedAt: new Date("2026-03-01T10:00:00.000Z"),
            startOffsetMs: 600_000,
            endOffsetMs: 1_200_000,
            sourceSessionIndex: 1,
          },
        ],
        [
          {
            activityFilePath:
              "activities/11111111-1111-4111-8111-111111111111/uploads/multisport.fit",
            activityFileType: "fit",
            profile_id: "11111111-1111-4111-8111-111111111111",
            activityCategory: "run",
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
      laps: [
        { messageIndex: 0, sessionMessageIndex: 0 },
        { messageIndex: 1, sessionMessageIndex: 1 },
      ],
      lengths: [
        { messageIndex: 0, sessionMessageIndex: 0 },
        { messageIndex: 1, sessionMessageIndex: 1 },
      ],
      sessions: [
        {
          messageIndex: 0,
          startTime: new Date("2026-03-01T10:00:00.000Z"),
          endTime: new Date("2026-03-01T10:10:00.000Z"),
          totalElapsedTime: 600,
          totalDistance: 1000,
          laps: [],
          records: [],
        },
        {
          messageIndex: 1,
          startTime: new Date("2026-03-01T10:10:00.000Z"),
          endTime: new Date("2026-03-01T10:20:00.000Z"),
          totalElapsedTime: 600,
          totalDistance: 4000,
          laps: [],
          records: [],
        },
      ],
      summary: { totalTime: 1200, totalDistance: 5000 },
    });

    const result = await createCaller({ db }).getStreams({
      activityId,
      scope: { type: "session", sessionMessageIndex: 1 },
    });

    expect(result.records).toEqual([
      expect.objectContaining({ sessionMessageIndex: 1, heartRate: 165 }),
    ]);
    expect(result.analysis.activity_category).toBe("run");

    const segmentResult = await createCaller({ db }).getStreams({
      activityId,
      scope: { type: "segment", segmentId: "99999999-9999-4999-8999-999999999999" },
    });
    expect(segmentResult).toMatchObject({
      records: [expect.objectContaining({ sessionMessageIndex: 1, heartRate: 165 })],
      laps: [expect.objectContaining({ messageIndex: 1, sessionMessageIndex: 1 })],
      lengths: [expect.objectContaining({ messageIndex: 1, sessionMessageIndex: 1 })],
      summary: { totalTime: 600, totalDistance: 4000 },
    });
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
            activityCategory: "run",
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
            activityCategory: "bike",
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
            activityCategory: "bike",
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
    expect(mocks.readObjectBounded).not.toHaveBeenCalled();
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
    ).rejects.toThrow("Unable to parse activity file");

    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });
});
