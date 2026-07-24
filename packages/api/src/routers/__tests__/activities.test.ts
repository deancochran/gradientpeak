import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", () => ({
  createHash: () => ({
    update: () => ({ digest: () => "1".repeat(64) }),
  }),
  randomUUID: () => "33333333-3333-4333-8333-333333333333",
}));

const pgDialect = new PgDialect();

const mockActivityAnalysis = vi.hoisted(() => ({
  analyzeActivityDerivedMetrics: vi.fn(),
  buildActivityDerivedSummaryMap: vi.fn(),
  buildActivitySegmentDerivedSummaries: vi.fn(),
  createActivityAnalysisStore: vi.fn(() => ({
    kind: "activity-analysis-store",
  })),
  mapActivityToDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    activity,
    has_liked,
    derived,
  })),
  mapActivityToListDerivedResponse: vi.fn(({ activity, has_liked, derived }) => ({
    ...activity,
    has_liked,
    derived,
  })),
  resolveActivityContextAsOf: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));
const mockArtifactStorage = vi.hoisted(() => ({
  verifyAcceptedActivityArtifact: vi.fn(),
}));

vi.mock("../../application/activity-file-ingestion/artifact-storage", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../application/activity-file-ingestion/artifact-storage")
  >()),
  verifyAcceptedActivityArtifact: mockArtifactStorage.verifyAcceptedActivityArtifact,
}));
vi.mock("../../storage-service", () => ({ getApiStorageService: () => ({}) }));

vi.mock("@repo/core", async () => {
  const actual = await vi.importActual<typeof import("@repo/core")>("@repo/core");

  return {
    ...actual,
    analyzeActivityDerivedMetrics: mockActivityAnalysis.analyzeActivityDerivedMetrics,
  };
});

vi.mock("../../infrastructure/repositories", () => ({
  createActivityAnalysisStore: mockActivityAnalysis.createActivityAnalysisStore,
}));

vi.mock("../../lib/activity-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/activity-analysis")>();
  return {
    ...actual,
    buildActivityDerivedSummaryMap: mockActivityAnalysis.buildActivityDerivedSummaryMap,
    buildActivityDerivedSummaries: async (
      input: Parameters<typeof actual.buildActivityDerivedSummaryMap>[0],
    ) => ({
      parent: await mockActivityAnalysis.buildActivityDerivedSummaryMap(input),
      segments: await mockActivityAnalysis.buildActivitySegmentDerivedSummaries(input),
    }),
    buildActivitySegmentDerivedSummaries: mockActivityAnalysis.buildActivitySegmentDerivedSummaries,
    loadActivitySegmentsByActivityId: mockActivityAnalysis.loadActivitySegmentsByActivityId,
    resolveActivityContextAsOf: mockActivityAnalysis.resolveActivityContextAsOf,
  };
});

import { activitiesRouter } from "../activities";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";
const ACTIVITY_ID_3 = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";
const PLAN_ID = "77777777-7777-4777-8777-777777777777";
const SEGMENT_ID = "99999999-9999-4999-8999-999999999999";
const ACCEPTED_ARTIFACT = {
  sha256: "a".repeat(64),
  byteSize: 123456,
  bucket: "activity-files",
  path: `artifacts/sha256/${OWNER_ID}/${"a".repeat(64)}`,
  mediaType: "application/vnd.ant.fit",
  format: "fit" as const,
  originalName: "accepted.fit",
};

function singleSegmentSet(category: "run" | "bike" | "swim", elapsedMs = 3_600_000) {
  return {
    version: 1 as const,
    elapsedMs,
    segments: [
      {
        id: SEGMENT_ID,
        ordinal: 0,
        role: "activity" as const,
        category,
        startOffsetMs: 0,
        endOffsetMs: elapsedMs,
        summary: {
          version: 1 as const,
          timing: {
            timingCoverage: "complete" as const,
            activeMs: elapsedMs,
            movingMs: elapsedMs - 100_000,
          },
        },
      },
    ],
  };
}

function recordingExecutionManifest(category: "run" | "bike" | "swim" = "run") {
  return {
    version: 1 as const,
    compilerVersion: 1,
    planHash: "b".repeat(64),
    occurrences: [
      {
        occurrenceId: "occurrence-1",
        globalOrdinal: 0,
        segmentId: SEGMENT_ID,
        role: "activity" as const,
        category,
        startedAt: "2026-01-15T09:00:00.000Z",
        completedAt: "2026-01-15T10:00:00.000Z",
        activeSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10000,
        timerEvents: [],
        laps: [],
      },
    ],
  };
}

function recordingCreateInput(profileId = OWNER_ID) {
  return {
    profileId,
    name: "Recorder Run",
    startedAt: "2026-01-15T09:00:00.000Z",
    finishedAt: "2026-01-15T10:00:00.000Z",
    executionManifest: recordingExecutionManifest(),
    acceptedArtifact: ACCEPTED_ARTIFACT,
    summary: { distanceMeters: 10000 },
  };
}
const RUN_TSS_IDENTITY = {
  sport: "run",
  method: "run_pace_threshold",
  source: "activity_analysis",
  version: "1",
  calibration: { type: "threshold_speed_mps", value: 4.2 },
} as const;
const BIKE_TSS_IDENTITY = {
  sport: "bike",
  method: "power_threshold",
  source: "activity_analysis",
  version: "1",
  calibration: { type: "ftp_watts", value: 250 },
} as const;
const activityCategories = new Map<string, "bike" | "run" | "swim">();

function buildActivityRow(overrides: Record<string, unknown> = {}) {
  const { category = "run", ...rowOverrides } = overrides;
  const id = typeof rowOverrides.id === "string" ? rowOverrides.id : ACTIVITY_ID;
  activityCategories.set(id, category as "bike" | "run" | "swim");
  return {
    id,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    profile_id: OWNER_ID,
    activity_plan_id: null,
    name: "Morning Run",
    provider: null,
    external_id: null,
    started_at: new Date("2026-01-10T08:00:00.000Z"),
    finished_at: new Date("2026-01-10T08:45:00.000Z"),
    elapsed_ms: 2_700_000,
    active_ms: 2_700_000,
    moving_ms: 2_650_000,
    timing_coverage: "complete",
    segments_revision: 1,
    parser_version: "test-parser-v1",
    decoded_contract_version: "test-decoded-v1",
    materializer_version: "test-materializer-v1",
    segments_generated_at: new Date("2026-01-10T08:45:00.000Z"),
    distance_meters: 9000,
    elevation_gain_meters: null,
    elevation_loss_meters: null,
    calories: null,
    avg_heart_rate: null,
    max_heart_rate: null,
    avg_power: null,
    max_power: null,
    normalized_power: null,
    avg_cadence: null,
    max_cadence: null,
    avg_speed_mps: 3.3,
    max_speed_mps: 4.8,
    normalized_speed_mps: null,
    normalized_graded_speed_mps: null,
    avg_temperature: null,
    avg_swolf: null,
    efficiency_factor: null,
    aerobic_decoupling: null,
    pool_length: null,
    total_strokes: null,
    device_manufacturer: null,
    device_product: null,
    notes: null,
    polyline: null,
    laps: null,
    map_bounds: null,
    is_private: false,
    ...rowOverrides,
    content_visibility:
      rowOverrides.content_visibility ?? (rowOverrides.is_private === true ? "private" : "public"),
  };
}

function buildSegmentReadRow(
  activityId: string,
  ordinal: number,
  category: "run" | "bike" | "swim",
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `99999999-9999-4999-8999-${ordinal.toString().padStart(12, "0")}`,
    activity_id: activityId,
    ordinal,
    role: "activity" as const,
    category,
    start_offset_ms: ordinal * 1_000,
    end_offset_ms: (ordinal + 1) * 1_000,
    timing_coverage: "complete" as const,
    active_ms: 1_000,
    moving_ms: 900,
    summary: {
      version: 1 as const,
      timing: {
        timingCoverage: "complete" as const,
        activeMs: 1_000,
        movingMs: 900,
      },
      distanceMeters: 100,
    },
    ...overrides,
  };
}

function buildActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-02T00:00:00.000Z"),
    profile_id: OWNER_ID,
    name: "Planned Run",
    description: "",
    notes: null,
    activity_category: "run",
    structure: null,
    version: "1.0",
    template_visibility: "private",
    import_provider: null,
    import_external_id: null,
    is_system_template: false,
    ...overrides,
  };
}

function buildActivitySummaryRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    duration_seconds: 3000,
    moving_seconds: 2900,
    distance_meters: 10000,
    elevation_gain_meters: 120,
    elevation_loss_meters: 80,
    calories: 500,
    avg_heart_rate: 145,
    max_heart_rate: 172,
    avg_power: 210,
    max_power: 430,
    normalized_power: 235,
    avg_cadence: 88,
    max_cadence: 112,
    avg_speed_mps: 3.45,
    max_speed_mps: 5.1,
    normalized_speed_mps: 3.5,
    normalized_graded_speed_mps: 3.6,
    avg_temperature: null,
    avg_swolf: null,
    efficiency_factor: null,
    aerobic_decoupling: null,
    pool_length: null,
    total_strokes: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildActivityImportRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    provider: "wahoo",
    external_id: "external-activity-1",
    device_manufacturer: "Wahoo",
    device_product: "ELEMNT",
    activity_file_path: "activities/file.fit",
    activity_file_size: 1234,
    import_source: null,
    import_file_type: "fit",
    import_original_file_name: "ride.fit",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildActivityFileIngestionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    source: "mobile_recording",
    provider: null,
    external_id: null,
    file_path: null,
    file_size: 123456,
    file_type: "fit",
    status: "pending_upload",
    attempt_count: 0,
    last_error_code: null,
    last_error_message: null,
    requested_at: new Date("2026-01-01T00:00:00.000Z"),
    started_at: null,
    completed_at: null,
    failed_at: null,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function findInsertedValue(db: any, tableName: string) {
  return db.__spies.insertValues.mock.calls.find(
    ([insertedTableName]: [string, unknown]) => insertedTableName === tableName,
  )?.[1];
}

function buildActivityGeometryRow(overrides: Record<string, unknown> = {}) {
  return {
    activity_id: ACTIVITY_ID,
    profile_id: OWNER_ID,
    polyline: "split-polyline",
    map_bounds: { north: 1, south: 0, east: 1, west: 0 },
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function getTableName(table: unknown) {
  if (table && typeof table === "object") {
    const candidate =
      (table as any)?._?.name ??
      (table as any)?._?.baseName ??
      (table as any)?.config?.name ??
      (table as any)?.name;

    if (typeof candidate === "string") return candidate;

    for (const symbol of Object.getOwnPropertySymbols(table)) {
      const value = (table as any)[symbol];
      if (typeof value === "string" && /^[a-z_]+$/i.test(value)) return value;
    }
  }

  return "unknown";
}

function toSql(fragment: unknown) {
  return pgDialect.sqlToQuery(fragment as any).sql;
}

function createCaller(db: any, userId = OWNER_ID) {
  return activitiesRouter.createCaller({
    db,
    session: {
      user: {
        id: userId,
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function createSequencedFn(values: unknown[]) {
  const fn = vi.fn();

  for (const value of values) {
    fn.mockResolvedValueOnce(value);
  }

  return fn;
}

function createDbMock(options: {
  activityRows?: any[];
  likeRows?: Array<{ entity_id: string; likes_count: number; has_liked: boolean }>;
  totalRows?: Array<{ total: number }>;
  joinedRows?: any[];
  activitySummaryRows?: any[];
  activityImportRows?: any[];
  activityGeometryRows?: any[];
  activityLapRows?: any[];
  currentArtifactRows?: any[];
  sessionRpeEvidenceRows?: any[];
  profileRows?: any[];
  integrationRows?: any[];
  providerSyncRows?: any[];
  queryActivitiesFindFirst?: any[];
  queryActivityFileIngestionsFindFirst?: any[];
  queryActivityGeometryFindFirst?: any[];
  queryActivityImportsFindFirst?: any[];
  queryActivitySummariesFindFirst?: any[];
  queryEventsFindFirst?: any[];
  queryLikesFindFirst?: any[];
  executeRows?: Array<{ id: string }>;
  insertedRowsByTable?: Record<string, unknown[]>;
  updatedRows?: any[];
  transactionError?: Error;
  onTssScanBatch?: (batchNumber: number) => void;
}) {
  const insertValues = vi.fn();
  const deleteWhere = vi.fn(() => Promise.resolve());
  const offset = vi.fn();
  const selectWhere = vi.fn();
  const tssLimit = vi.fn();
  let transactionActivityRows: any[] | undefined;
  let tssScanIndex = 0;
  let tssScanBatchNumber = 0;
  const limit = vi.fn((limitValue: number) => {
    const limitedRows = (options.activityRows ?? []).slice(0, limitValue);
    return {
      offset: (offsetValue: number) => {
        offset(offsetValue);
        return Promise.resolve(
          (options.activityRows ?? []).slice(offsetValue, offsetValue + limitValue),
        );
      },
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(limitedRows).then(onFulfilled),
    };
  });
  const orderBy = vi.fn((...args: unknown[]) => {
    if (transactionActivityRows !== undefined && args.length === 2) {
      return {
        limit: tssLimit.mockImplementation((limitValue: number) => {
          const rows = [...(transactionActivityRows ?? options.activityRows ?? [])].sort(
            (a, b) => b.started_at.getTime() - a.started_at.getTime() || b.id.localeCompare(a.id),
          );
          const batch = rows.slice(tssScanIndex, tssScanIndex + limitValue);
          tssScanIndex += batch.length;
          tssScanBatchNumber += 1;
          options.onTssScanBatch?.(tssScanBatchNumber);
          return Promise.resolve(batch);
        }),
      };
    }

    return {
      limit,
      then: (onFulfilled: (value: unknown[]) => unknown) =>
        Promise.resolve(options.activityRows ?? []).then(onFulfilled),
    };
  });

  function rowsForTable(tableName: string) {
    if (tableName === "profiles") {
      return options.profileRows ?? [{ planningTimezone: "America/New_York" }];
    }
    if (tableName === "integrations") return options.integrationRows ?? [];
    if (tableName === "provider_sync_state") return options.providerSyncRows ?? [];
    if (tableName === "activity_summaries") return options.activitySummaryRows ?? [];
    if (tableName === "activity_imports") return options.activityImportRows ?? [];
    if (tableName === "activity_geometry") return options.activityGeometryRows ?? [];
    if (tableName === "activity_laps") return options.activityLapRows ?? [];
    if (tableName === "activity_artifact_links") return options.currentArtifactRows ?? [];
    if (tableName === "activity_session_rpe_evidence") return options.sessionRpeEvidenceRows ?? [];
    if (tableName === "events") return options.queryEventsFindFirst ?? [];
    return options.activityRows ?? [];
  }

  const db = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      if (fields && "total" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(options.totalRows ?? [{ total: 0 }])),
          })),
        };
      }

      if (fields && "entity_id" in fields) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn(() => Promise.resolve(options.likeRows ?? [])),
            })),
          })),
        };
      }

      if (fields && "payload" in fields) {
        return {
          from: vi.fn((table: unknown) => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(rowsForTable(getTableName(table)))),
            })),
          })),
        };
      }

      if (fields && "activity" in fields) {
        const where = vi.fn(() => ({
          orderBy,
          limit: vi.fn(() => Promise.resolve(options.joinedRows ?? options.activityRows ?? [])),
        }));
        return {
          from: vi.fn(() => ({
            where,
            leftJoin: vi.fn(() => {
              const joinedBuilder = {
                where,
              };
              return joinedBuilder;
            }),
          })),
        };
      }

      return {
        from: vi.fn((table: unknown) => {
          const builder = {
            leftJoin: vi.fn(() => builder),
            innerJoin: vi.fn(() => builder),
            where: vi.fn((condition: unknown) => {
              selectWhere(condition);
              const rows = rowsForTable(getTableName(table));
              const resolveRows = () => Promise.resolve(rows);
              return {
                limit: vi.fn(resolveRows),
                orderBy:
                  getTableName(table) === "activities"
                    ? orderBy
                    : getTableName(table) === "activity_session_rpe_evidence"
                      ? vi.fn(() => Promise.resolve(rows))
                      : vi.fn(() => ({ limit: vi.fn(resolveRows) })),
                then: (onFulfilled: (value: unknown[]) => unknown) =>
                  Promise.resolve(rows).then(onFulfilled),
              };
            }),
          };

          return builder;
        }),
      };
    }),
    execute: vi.fn(async () => ({ rows: options.executeRows ?? [] })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const tableName = getTableName(table);
        insertValues(tableName, values);

        const insertBuilder = {
          onConflictDoUpdate: vi.fn(() => insertBuilder),
          onConflictDoNothing: vi.fn(() => insertBuilder),
          returning: vi.fn(() =>
            Promise.resolve(
              options.insertedRowsByTable?.[tableName] ??
                (tableName === "activity_artifacts"
                  ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]
                  : tableName === "activity_artifact_links"
                    ? [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
                    : (options.executeRows ?? [])),
            ),
          ),
        };
        return insertBuilder;
      }),
    })),
    transaction: vi.fn(
      async (callback: (tx: unknown) => unknown, _config?: Record<string, unknown>) => {
        if (options.transactionError) throw options.transactionError;
        transactionActivityRows = [...(options.activityRows ?? [])];
        tssScanIndex = 0;
        tssScanBatchNumber = 0;
        try {
          return await callback(db);
        } finally {
          transactionActivityRows = undefined;
        }
      },
    ),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve(options.updatedRows ?? [])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: deleteWhere,
    })),
    query: {
      activities: {
        findFirst: createSequencedFn(options.queryActivitiesFindFirst ?? []),
      },
      activityFileIngestions: {
        findFirst: createSequencedFn(options.queryActivityFileIngestionsFindFirst ?? []),
      },
      activityGeometry: {
        findFirst: createSequencedFn(options.queryActivityGeometryFindFirst ?? []),
      },
      activityImports: {
        findFirst: createSequencedFn(options.queryActivityImportsFindFirst ?? []),
      },
      activitySummaries: {
        findFirst: createSequencedFn(options.queryActivitySummariesFindFirst ?? []),
      },
      events: {
        findFirst: createSequencedFn(options.queryEventsFindFirst ?? []),
      },
      likes: {
        findFirst: createSequencedFn(options.queryLikesFindFirst ?? []),
      },
    },
    __spies: {
      deleteWhere,
      limit,
      offset,
      orderBy,
      selectWhere,
      tssLimit,
      insertValues,
    },
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockArtifactStorage.verifyAcceptedActivityArtifact.mockImplementation(
    async (_storage: unknown, input: unknown) => input,
  );
  activityCategories.clear();
  mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
  mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([]);
  mockActivityAnalysis.loadActivitySegmentsByActivityId.mockImplementation(
    async (_db: unknown, activityIds: string[]) =>
      new Map(
        activityIds.map((activityId) => [
          activityId,
          [buildSegmentReadRow(activityId, 0, activityCategories.get(activityId) ?? "run")],
        ]),
      ),
  );
  mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({});
  mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue({
    stress: {
      tss: 50,
      tss_identity: RUN_TSS_IDENTITY,
      intensity_factor: 0.8,
      method: "run_pace_threshold",
      unavailable_reason: null,
      trimp: null,
    },
    zones: { hr: [], power: [] },
    computed_as_of: "2026-01-01T00:00:00.000Z",
  });
});

describe("activitiesRouter", () => {
  it("returns authenticated profile-scoped common Load history through the Core output contract", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T16:00:00.000Z"));
    try {
      const coverageCompletedAt = new Date("2026-07-21T16:00:00.000Z");
      const result = await createCaller(
        createDbMock({
          integrationRows: [{ id: "wahoo-history", provider: "wahoo" }],
          providerSyncRows: [
            {
              integrationId: "wahoo-history",
              lastSucceededAt: coverageCompletedAt,
              lastFailedAt: null,
              consecutiveFailures: 0,
              highWatermark: coverageCompletedAt,
              metadata: {
                activityHistoryCoverage: {
                  start: "2026-01-01T00:00:00.000Z",
                  end: "2026-07-21T04:00:00.000Z",
                },
              },
            },
          ],
        }),
      ).commonLoadHistory();

      expect(result.status).toBe("available");
      if (result.status !== "available") throw new Error("Available common Load history expected");
      expect(result.points).toHaveLength(84);
      expect(result.points.at(-1)).toMatchObject({ date: "2026-07-20", dailyLoad: 0 });
      expect(mockActivityAnalysis.buildActivitySegmentDerivedSummaries).toHaveBeenCalledWith({
        store: { kind: "activity-analysis-store" },
        profileId: OWNER_ID,
        activities: [],
      });

      const unauthenticatedCaller = activitiesRouter.createCaller({
        db: createDbMock({}),
        session: null,
        headers: new Headers(),
        clientType: "test",
        trpcSource: "vitest",
      } as any);
      await expect(
        unauthenticatedCaller.commonLoadHistory({
          current_planning_date: "2026-07-21",
          planning_timezone: "America/New_York",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns explicit abstention when the profile planning timezone is missing", async () => {
    const result = await createCaller(
      createDbMock({ profileRows: [{ planningTimezone: null }] }),
    ).commonLoadHistory();

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "invalid_input",
      context: { path: "planningTimezone" },
    });
  });

  it("rejects a planning date that differs from the server-derived profile-local date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T16:00:00.000Z"));
    try {
      await expect(
        createCaller(createDbMock({})).commonLoadHistory({
          current_planning_date: "2026-07-22",
          planning_timezone: "America/New_York",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists paginated owned activities with like and derived summaries", async () => {
    const rows = [buildActivityRow()];
    const derived = {
      tss: 72,
      tss_identity: RUN_TSS_IDENTITY,
      intensity_factor: 0.81,
      method: "run_pace_threshold" as const,
      unavailable_reason: null,
      computed_as_of: "2026-01-10T09:00:00.000Z",
    };
    const db = createDbMock({
      activityRows: rows,
      likeRows: [{ entity_id: ACTIVITY_ID, likes_count: 3, has_liked: true }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, derived]]),
    );

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result.items).toEqual([
      {
        ...rows[0],
        laps: [],
        likes_count: 3,
        has_liked: true,
        derived,
        segment_loads: [],
        activity_kind: "single",
        activity_segment_count: 1,
        activity_categories: ["run"],
        matched_category_summary: null,
      },
    ]);
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OWNER_ID,
        activities: [expect.objectContaining({ id: ACTIVITY_ID, segments: expect.any(Array) })],
      }),
    );
    expect(toSql(db.__spies.selectWhere.mock.calls[0]?.[0])).not.toContain("select count(*)");
  });

  it("filters by multisport composition and returns category-safe discovery DTOs", async () => {
    const activity = buildActivityRow();
    const segments = [
      buildSegmentReadRow(ACTIVITY_ID, 0, "bike", {
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
          distanceMeters: 1_000,
        },
      }),
      buildSegmentReadRow(ACTIVITY_ID, 1, "run", {
        active_ms: 2_000,
        moving_ms: 1_800,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 2_000, movingMs: 1_800 },
          distanceMeters: 500,
        },
      }),
      buildSegmentReadRow(ACTIVITY_ID, 2, "run", {
        active_ms: 3_000,
        moving_ms: 2_700,
        summary: {
          version: 1,
          timing: { timingCoverage: "complete", activeMs: 3_000, movingMs: 2_700 },
          distanceMeters: 700,
        },
      }),
    ];
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, segments]]),
    );
    mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue(
      segments.slice(1).map((segment, index) => ({
        activity_id: ACTIVITY_ID,
        segment_id: segment.id,
        category: "run",
        tss: index === 0 ? 20 : 30,
        tss_identity: RUN_TSS_IDENTITY,
        intensity_factor: 0.8,
        method: "run_pace_threshold",
        unavailable_reason: null,
        computed_as_of: "2026-01-10T09:00:00.000Z",
        dedupe_key: segment.id,
        load_stream_key: "run:pace",
      })),
    );
    const db = createDbMock({ activityRows: [activity], totalRows: [{ total: 1 }] });

    const result = await createCaller(db).listPaginated({
      activity_category: "run",
      composition_mode: "multisport_only",
    });

    expect(result.items[0]).toMatchObject({
      activity_kind: "multisport",
      activity_segment_count: 3,
      activity_categories: ["bike", "run", "run"],
      matched_category_summary: {
        segment_count: 2,
        distance_meters: 1_200,
        active_ms: 5_000,
        moving_ms: 4_500,
        tss: 50,
        tss_identity: RUN_TSS_IDENTITY,
      },
      segment_loads: [
        expect.objectContaining({
          segment_id: segments[1]?.id,
          category: "run",
          tss: 20,
          intensity_factor: 0.8,
        }),
        expect.objectContaining({
          segment_id: segments[2]?.id,
          category: "run",
          tss: 30,
          intensity_factor: 0.8,
        }),
      ],
    });
    const whereSql = toSql(db.__spies.selectWhere.mock.calls[0]?.[0]);
    expect(whereSql).toContain('"activity_segments"."category" =');
    expect(whereSql).toContain("select count(*)");
    expect(whereSql).toContain("> 1");
  });

  it.each([
    { sort_by: "distance" as const, expected: [ACTIVITY_ID_2, ACTIVITY_ID, ACTIVITY_ID_3] },
    { sort_by: "duration" as const, expected: [ACTIVITY_ID_2, ACTIVITY_ID, ACTIVITY_ID_3] },
    { sort_by: "tss" as const, expected: [ACTIVITY_ID, ACTIVITY_ID_2, ACTIVITY_ID_3] },
  ])("sorts $sort_by by matched-category values with nulls last", async ({ sort_by, expected }) => {
    const rows = [
      buildActivityRow({ id: ACTIVITY_ID }),
      buildActivityRow({ id: ACTIVITY_ID_2 }),
      buildActivityRow({ id: ACTIVITY_ID_3 }),
    ];
    const segmentByActivityId = new Map([
      [
        ACTIVITY_ID,
        [
          buildSegmentReadRow(ACTIVITY_ID, 0, "run", {
            active_ms: 1_000,
            moving_ms: 900,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
              distanceMeters: 100,
            },
          }),
        ],
      ],
      [
        ACTIVITY_ID_2,
        [
          buildSegmentReadRow(ACTIVITY_ID_2, 0, "run", {
            active_ms: 2_000,
            moving_ms: 1_800,
            summary: {
              version: 1,
              timing: { timingCoverage: "complete", activeMs: 2_000, movingMs: 1_800 },
              distanceMeters: 200,
            },
          }),
        ],
      ],
      [
        ACTIVITY_ID_3,
        [
          buildSegmentReadRow(ACTIVITY_ID_3, 0, "run", {
            timing_coverage: "unavailable",
            active_ms: null,
            moving_ms: null,
            summary: { version: 1, timing: { timingCoverage: "unavailable" } },
          }),
        ],
      ],
    ]);
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockImplementation(
      async (_db: unknown, activityIds: string[]) =>
        new Map(
          activityIds.map((activityId) => [activityId, segmentByActivityId.get(activityId) ?? []]),
        ),
    );
    mockActivityAnalysis.buildActivitySegmentDerivedSummaries.mockResolvedValue([
      {
        activity_id: ACTIVITY_ID,
        segment_id: segmentByActivityId.get(ACTIVITY_ID)![0]!.id,
        category: "run",
        tss: 30,
        tss_identity: RUN_TSS_IDENTITY,
        intensity_factor: 0.8,
        method: "run_pace_threshold",
        unavailable_reason: null,
        computed_as_of: "2026-01-10T09:00:00.000Z",
        load_stream_key: "run:pace",
      },
      {
        activity_id: ACTIVITY_ID_2,
        segment_id: segmentByActivityId.get(ACTIVITY_ID_2)![0]!.id,
        category: "run",
        tss: 10,
        tss_identity: RUN_TSS_IDENTITY,
        intensity_factor: 0.7,
        method: "run_pace_threshold",
        unavailable_reason: null,
        computed_as_of: "2026-01-10T09:00:00.000Z",
        load_stream_key: "run:pace",
      },
    ]);
    const db = createDbMock({ activityRows: rows, totalRows: [{ total: rows.length }] });

    const result = await createCaller(db).listPaginated({
      activity_category: "run",
      sort_by,
      sort_order: "desc",
      limit: 3,
    });

    expect(result.items.map((item) => item.id)).toEqual(expected);
    expect(result.items.at(-1)?.matched_category_summary).toMatchObject({
      distance_meters: null,
      active_ms: null,
      tss: null,
    });
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("uses canonical parent values in paginated list responses", async () => {
    const rows = [
      buildActivityRow({
        distance_meters: 1,
        elapsed_ms: 2_000,
        active_ms: 2_000,
        moving_ms: 1_900,
        provider: null,
        external_id: null,
        polyline: "legacy-polyline",
        map_bounds: { legacy: true },
      }),
    ];
    const db = createDbMock({
      activityRows: rows,
      activitySummaryRows: [
        buildActivitySummaryRow({
          distance_meters: 12345,
          duration_seconds: 3600,
        }),
      ],
      activityImportRows: [
        buildActivityImportRow({
          provider: "wahoo",
          external_id: "split-external-id",
        }),
      ],
      activityGeometryRows: [
        buildActivityGeometryRow({
          polyline: "split-polyline",
          map_bounds: { split: true },
        }),
      ],
    });

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result.items[0]).toMatchObject({
      distance_meters: 1,
      elapsed_ms: 2_000,
      active_ms: 2_000,
      moving_ms: 1_900,
      provider: null,
      external_id: null,
      polyline: "legacy-polyline",
      map_bounds: { legacy: true },
    });
  });

  it("sorts paginated distance and duration queries by canonical parent values", async () => {
    const db = createDbMock({
      activityRows: [buildActivityRow()],
      totalRows: [{ total: 1 }],
      activitySummaryRows: [buildActivitySummaryRow({ distance_meters: 5000 })],
    });
    const caller = createCaller(db);

    await caller.listPaginated({
      sort_by: "distance",
      sort_order: "asc",
    });
    await caller.listPaginated({
      sort_by: "duration",
      sort_order: "desc",
    });

    const orderSql = db.__spies.orderBy.mock.calls.flat().map(toSql).join("\n");
    expect(orderSql).toContain('"activities"."distance_meters"');
    expect(orderSql).toContain(
      'coalesce("activities"."active_ms", "activities"."elapsed_ms") desc',
    );
  });

  it("sorts paginated results by derived tss before slicing", async () => {
    const rows = [
      buildActivityRow({
        id: ACTIVITY_ID,
        name: "Easy Run",
        started_at: new Date("2026-01-12T08:00:00.000Z"),
        finished_at: new Date("2026-01-12T08:30:00.000Z"),
      }),
      buildActivityRow({
        id: ACTIVITY_ID_2,
        name: "Big Ride",
        category: "bike",
        started_at: new Date("2026-01-11T08:00:00.000Z"),
        finished_at: new Date("2026-01-11T10:00:00.000Z"),
      }),
      buildActivityRow({
        id: ACTIVITY_ID_3,
        name: "Tempo Run",
        started_at: new Date("2026-01-10T08:00:00.000Z"),
        finished_at: new Date("2026-01-10T08:50:00.000Z"),
      }),
    ];
    const db = createDbMock({
      activityRows: rows,
      totalRows: [{ total: 3 }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([
        [
          ACTIVITY_ID,
          {
            tss: 20,
            tss_identity: RUN_TSS_IDENTITY,
            intensity_factor: 0.65,
            method: "run_pace_threshold",
            unavailable_reason: null,
            computed_as_of: "2026-01-12T09:00:00.000Z",
          },
        ],
        [
          ACTIVITY_ID_2,
          {
            tss: 95,
            tss_identity: BIKE_TSS_IDENTITY,
            intensity_factor: 0.92,
            method: "power_threshold",
            unavailable_reason: null,
            computed_as_of: "2026-01-11T10:00:00.000Z",
          },
        ],
        [
          ACTIVITY_ID_3,
          {
            tss: 60,
            tss_identity: RUN_TSS_IDENTITY,
            intensity_factor: 0.78,
            method: "run_pace_threshold",
            unavailable_reason: null,
            computed_as_of: "2026-01-10T09:00:00.000Z",
          },
        ],
        [
          ACTIVITY_ID,
          {
            tss: 20,
            tss_identity: RUN_TSS_IDENTITY,
            intensity_factor: 0.65,
            method: "run_pace_threshold",
            unavailable_reason: null,
            computed_as_of: "2026-01-12T09:00:00.000Z",
          },
        ],
      ]),
    );

    const caller = createCaller(db);
    const result = await caller.listPaginated({
      limit: 2,
      cursor: "index:1",
      sort_by: "tss",
      sort_order: "desc",
    });

    expect(result.total).toBe(3);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeUndefined();
    expect(result.items.map((item: any) => item.id)).toEqual([ACTIVITY_ID_3, ACTIVITY_ID]);
    expect(db.__spies.tssLimit).toHaveBeenCalledWith(3);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("deep-pages globally sorted TSS with keyset scan plans, bounded query counts, and stable ties", async () => {
    const rows = Array.from({ length: 5_000 }, (_, index) =>
      buildActivityRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        name: `Activity ${index}`,
        started_at: new Date(Date.UTC(2025, 0, 1) + index * 1000),
        finished_at: new Date(Date.UTC(2025, 0, 1) + index * 1000 + 500),
      }),
    );
    const tssById = new Map(
      rows.map((row, index) => [row.id, index < 5 ? null : Math.floor(index / 2)]),
    );
    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockImplementation(
      async ({ activities: batch }: { activities: Array<{ id: string }> }) =>
        new Map(
          batch.map((activity) => [
            activity.id,
            {
              tss: tssById.get(activity.id) ?? null,
              tss_identity: tssById.get(activity.id) == null ? null : RUN_TSS_IDENTITY,
              intensity_factor: tssById.get(activity.id) == null ? null : 0.8,
              method: tssById.get(activity.id) == null ? null : "run_pace_threshold",
              unavailable_reason: tssById.get(activity.id) == null ? "threshold_missing" : null,
              computed_as_of: "2026-01-01T00:00:00.000Z",
            },
          ]),
        ),
    );
    const expected = (sortOrder: "asc" | "desc") =>
      rows
        .map((activity) => ({ activity, tss: tssById.get(activity.id) ?? null }))
        .sort((a, b) => {
          if (a.tss !== b.tss) {
            if (a.tss === null) return 1;
            if (b.tss === null) return -1;
            return sortOrder === "asc" ? a.tss - b.tss : b.tss - a.tss;
          }
          return (
            b.activity.started_at.getTime() - a.activity.started_at.getTime() ||
            a.activity.id.localeCompare(b.activity.id)
          );
        })
        .map(({ activity }) => activity.id);
    const benchmarkSamples: number[] = [];

    for (const testCase of [
      { offset: 4_900, limit: 20, sortOrder: "asc" as const },
      { offset: 4_950, limit: 10, sortOrder: "desc" as const },
      { offset: 4_975, limit: 15, sortOrder: "desc" as const },
    ]) {
      const db = createDbMock({ activityRows: rows, totalRows: [{ total: rows.length }] });
      const benchmarkStart = performance.now();
      const result = await createCaller(db).listPaginated({
        limit: testCase.limit,
        cursor: `index:${testCase.offset}`,
        sort_by: "tss",
        sort_order: testCase.sortOrder,
      });
      benchmarkSamples.push(performance.now() - benchmarkStart);

      expect(result.items.map((item) => item.id)).toEqual(
        expected(testCase.sortOrder).slice(testCase.offset, testCase.offset + testCase.limit),
      );
      expect(result.total).toBe(5_000);
      expect(result.hasMore).toBe(testCase.offset + testCase.limit < 5_000);
      expect(result.nextCursor).toBe(
        testCase.offset + testCase.limit < 5_000
          ? `index:${testCase.offset + testCase.limit}`
          : undefined,
      );
      expect(db.__spies.offset).not.toHaveBeenCalled();
      expect(db.__spies.tssLimit).toHaveBeenCalledTimes(25);
      expect(db.__spies.tssLimit.mock.calls.every(([value]) => value === 200)).toBe(true);
      expect(db.__spies.orderBy).toHaveBeenCalledTimes(25);
      const orderSql = db.__spies.orderBy.mock.calls[0]?.map(toSql).join(" ") ?? "";
      expect(orderSql).toContain('"activities"."started_at" desc');
      expect(orderSql).toContain('"activities"."id" desc');
      const keysetWhereSql = toSql(db.__spies.selectWhere.mock.calls[1]?.[0]);
      expect(keysetWhereSql).toContain('"activities"."started_at" <');
      expect(keysetWhereSql).toContain('"activities"."id" <');
    }

    benchmarkSamples.sort((a, b) => a - b);
    const p95 = benchmarkSamples[Math.ceil(benchmarkSamples.length * 0.95) - 1] ?? 0;
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledTimes(3);
    expect(p95, `5,000-row deep TSS pagination p95=${p95.toFixed(2)}ms`).toBeLessThan(750);
  });

  it("keeps an internal TSS scan on one snapshot when an activity is inserted concurrently", async () => {
    const rows = Array.from({ length: 401 }, (_, index) =>
      buildActivityRow({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
        started_at: new Date(Date.UTC(2026, 0, 1) + index * 1000),
        finished_at: new Date(Date.UTC(2026, 0, 1) + index * 1000 + 500),
      }),
    );
    const concurrentlyInserted = buildActivityRow({
      id: "99999999-9999-4999-8999-999999999999",
      started_at: new Date(Date.UTC(2026, 0, 1) + 150_500),
      finished_at: new Date(Date.UTC(2026, 0, 1) + 151_000),
    });
    const db = createDbMock({
      activityRows: rows,
      totalRows: [{ total: rows.length }],
      onTssScanBatch: (batchNumber) => {
        if (batchNumber === 1) rows.push(concurrentlyInserted);
      },
    });
    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockImplementation(
      async ({ activities: candidates }: { activities: Array<{ id: string }> }) =>
        new Map(
          candidates.map((activity, index) => [
            activity.id,
            {
              tss: index,
              tss_identity: RUN_TSS_IDENTITY,
              intensity_factor: 0.8,
              method: "run_pace_threshold",
              unavailable_reason: null,
              computed_as_of: "2026-01-01T00:00:00.000Z",
            },
          ]),
        ),
    );

    const result = await createCaller(db).listPaginated({
      limit: 50,
      cursor: "index:350",
      sort_by: "tss",
      sort_order: "asc",
    });

    const derivedCandidates = mockActivityAnalysis.buildActivityDerivedSummaryMap.mock.calls[0]?.[0]
      .activities as Array<{ id: string }>;
    expect(derivedCandidates).toHaveLength(401);
    expect(new Set(derivedCandidates.map(({ id }) => id)).size).toBe(401);
    expect(derivedCandidates.map(({ id }) => id)).not.toContain(concurrentlyInserted.id);
    expect(result.total).toBe(401);
    expect(db.__spies.tssLimit).toHaveBeenCalledTimes(3);
    expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "repeatable read",
      accessMode: "read only",
    });
  });

  it("rejects unbounded exact TSS sorts above the documented history ceiling", async () => {
    const db = createDbMock({ totalRows: [{ total: 10_001 }] });

    await expect(
      createCaller(db).listPaginated({ sort_by: "tss", sort_order: "desc" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "TSS sorting supports at most 10000 matching activities; narrow the activity filters.",
    });
    expect(db.__spies.orderBy).not.toHaveBeenCalled();
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).not.toHaveBeenCalled();
  });

  it("creates an activity linked to a planned-activity event", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Long Ride",
      category: "bike",
    });
    const db = createDbMock({
      queryEventsFindFirst: [{ activity_plan_id: PLAN_ID }],
      executeRows: [{ id: ACTIVITY_ID }],
      queryActivitiesFindFirst: [createdActivity],
    });

    const caller = createCaller(db);
    const result = await caller.create({
      profile_id: OWNER_ID,
      eventId: EVENT_ID,
      name: "Long Ride",
      notes: "Outdoor endurance",
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T11:00:00.000Z",
      segmentSet: singleSegmentSet("bike", 7_200_000),
      acceptedArtifact: ACCEPTED_ARTIFACT,
      summary: { distanceMeters: 50000 },
    });

    expect(result).toEqual(createdActivity);
    expect(db.select).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects native submission when accepted artifact bytes cannot be verified", async () => {
    mockArtifactStorage.verifyAcceptedActivityArtifact.mockRejectedValueOnce(
      new Error("digest mismatch"),
    );
    const db = createDbMock({});
    await expect(
      createCaller(db).create({
        profile_id: OWNER_ID,
        name: "Unverified activity",
        startedAt: "2026-01-15T09:00:00.000Z",
        finishedAt: "2026-01-15T10:00:00.000Z",
        segmentSet: singleSegmentSet("bike"),
        acceptedArtifact: ACCEPTED_ARTIFACT,
        summary: { distanceMeters: 0 },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Accepted activity artifact could not be verified",
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("persists canonical temperature and pool-length metrics when creating an activity", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      category: "swim",
      avg_temperature: 21.5,
      pool_length: 25,
    });
    const db = createDbMock({
      executeRows: [{ id: ACTIVITY_ID }],
      queryActivitiesFindFirst: [createdActivity],
    });

    await createCaller(db).create({
      profile_id: OWNER_ID,
      name: "Pool session",
      notes: null,
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T10:00:00.000Z",
      segmentSet: singleSegmentSet("swim"),
      acceptedArtifact: ACCEPTED_ARTIFACT,
      summary: { distanceMeters: 2000, avgTemperature: 21.5, poolLength: 25 },
    });

    expect(findInsertedValue(db, "activities")).toMatchObject({
      avg_temperature: 21.5,
      pool_length: 25,
    });
  });

  it("creates an activity from a mobile execution manifest with an accepted artifact", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      category: "run",
      is_private: true,
      started_at: new Date("2026-01-15T09:00:00.000Z"),
      finished_at: new Date("2026-01-15T10:00:00.000Z"),
    });
    const ingestion = buildActivityFileIngestionRow({ status: "ready" });
    const db = createDbMock({
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
      queryActivitiesFindFirst: [createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
      queryActivitySummariesFindFirst: [
        buildActivitySummaryRow({
          activity_id: ACTIVITY_ID,
          duration_seconds: 3600,
          moving_seconds: 3500,
          distance_meters: 10000,
          calories: 640,
        }),
      ],
    });

    const caller = createCaller(db);
    const result = await caller.createFromRecordingSummary({
      profileId: OWNER_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      is_private: true,
      activityPlanId: PLAN_ID,
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T10:00:00.000Z",
      executionManifest: recordingExecutionManifest(),
      acceptedArtifact: ACCEPTED_ARTIFACT,
      summary: { distanceMeters: 10000, calories: 640 },
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      is_private: true,
      elapsed_ms: 2_700_000,
      active_ms: 2_700_000,
      moving_ms: 2_650_000,
      distance_meters: 9000,
      calories: null,
      ingestion: {
        id: ingestion.id,
        status: "ready",
        source: "mobile_recording",
      },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(findInsertedValue(db, "activities")).toMatchObject({
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      is_private: true,
      elapsed_ms: 3_600_000,
      active_ms: 3_600_000,
      moving_ms: 3_500_000,
      timing_coverage: "complete",
      distance_meters: 10000,
      calories: 640,
    });
    expect(findInsertedValue(db, "activity_file_ingestions")).toMatchObject({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      source: "mobile_recording",
      status: "ready",
    });
  });

  it("persists an ordered multisport execution manifest without parent sport transport", async () => {
    const bikeSegmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const transitionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const runSegmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, category: "bike" });
    const ingestion = buildActivityFileIngestionRow({ status: "ready" });
    const db = createDbMock({
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
      queryActivitiesFindFirst: [createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
    });

    await createCaller(db).createFromRecordingSummary({
      ...recordingCreateInput(),
      executionManifest: {
        ...recordingExecutionManifest(),
        occurrences: [
          {
            ...recordingExecutionManifest("bike").occurrences[0]!,
            segmentId: bikeSegmentId,
            completedAt: "2026-01-15T09:25:00.000Z",
            activeSeconds: 1500,
            movingSeconds: 1450,
          },
          {
            ...recordingExecutionManifest().occurrences[0]!,
            occurrenceId: "occurrence-transition",
            globalOrdinal: 1,
            segmentId: transitionId,
            role: "transition",
            category: null,
            startedAt: "2026-01-15T09:25:00.000Z",
            completedAt: "2026-01-15T09:30:00.000Z",
            activeSeconds: 300,
            movingSeconds: 300,
            distanceMeters: 0,
          },
          {
            ...recordingExecutionManifest("run").occurrences[0]!,
            occurrenceId: "occurrence-run",
            globalOrdinal: 2,
            segmentId: runSegmentId,
            startedAt: "2026-01-15T09:30:00.000Z",
            completedAt: "2026-01-15T10:00:00.000Z",
            activeSeconds: 1800,
            movingSeconds: 1750,
          },
        ],
      },
    });

    expect(findInsertedValue(db, "activity_segments")).toEqual([
      expect.objectContaining({
        id: bikeSegmentId,
        ordinal: 0,
        role: "activity",
        category: "bike",
      }),
      expect.objectContaining({ id: transitionId, ordinal: 1, role: "transition", category: null }),
      expect.objectContaining({ id: runSegmentId, ordinal: 2, role: "activity", category: "run" }),
    ]);
  });

  it("rejects recording summary creation for another profile", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(OTHER_ID),
        name: "Other Run",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the existing activity for a repeated recording session", async () => {
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, profile_id: OWNER_ID });
    const ingestion = buildActivityFileIngestionRow({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
    });
    const db = createDbMock({
      queryActivitiesFindFirst: [createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
    });
    const caller = createCaller(db);

    const result = await caller.createFromRecordingSummary({
      ...recordingCreateInput(),
      recordingSessionId: ACTIVITY_ID,
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      ingestion: { id: ingestion.id, source: ingestion.source, status: ingestion.status },
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns the committed activity when concurrent creation loses the insert race", async () => {
    const createdActivity = buildActivityRow({ id: ACTIVITY_ID, profile_id: OWNER_ID });
    const ingestion = buildActivityFileIngestionRow({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
    });
    const db = createDbMock({
      queryActivitiesFindFirst: [undefined, createdActivity],
      queryActivityFileIngestionsFindFirst: [ingestion],
      transactionError: new Error("duplicate key"),
    });
    const caller = createCaller(db);

    const result = await caller.createFromRecordingSummary({
      ...recordingCreateInput(),
      recordingSessionId: "profile-activity-session",
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      ingestion: { id: ingestion.id },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects recording manifests outside the parent time range", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(),
        name: "Bad Run",
        executionManifest: { ...recordingExecutionManifest(), occurrences: [] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.createFromRecordingSummary({
        ...recordingCreateInput(),
        name: "Backwards Run",
        startedAt: "2026-01-15T10:00:00.000Z",
        finishedAt: "2026-01-15T09:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("redacts derived load for an accessible activity owned by another athlete", async () => {
    const finishedAt = new Date("2026-01-09T08:45:00.000Z");
    const activity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OTHER_ID,
      activity_plan_id: PLAN_ID,
      name: "Shared Run",
      started_at: new Date("2026-01-09T08:00:00.000Z"),
      finished_at: finishedAt,
      avg_heart_rate: 150,
      max_heart_rate: 175,
    });
    const activityPlan = buildActivityPlanRow();
    const privateDerived = {
      stress: {
        tss: null,
        tss_identity: null,
        intensity_factor: null,
        method: null,
        unavailable_reason: "private_data" as const,
        trimp: null,
        trimp_source: null,
        training_effect: null,
      },
      zones: { hr: [], power: [] },
      computed_as_of: activity.started_at.toISOString(),
    };
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OTHER_ID,
          is_private: false,
          content_visibility: "public",
        },
      ],
      joinedRows: [{ activity, activityPlan }],
      likeRows: [{ entity_id: ACTIVITY_ID, likes_count: 5, has_liked: true }],
      sessionRpeEvidenceRows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          profileId: OTHER_ID,
          activityId: ACTIVITY_ID,
          recordedAt: new Date("2026-01-09T08:46:00.000Z"),
          correctedAt: null,
          rpe: 8,
          scale: "borg_cr10",
          scaleVersion: "1",
          source: "manual",
          operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          correctionOfId: null,
          provenance: { observation_type: "completed_session_rpe" },
          createdAt: new Date("2026-01-09T08:46:00.000Z"),
        },
      ],
    });

    mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({
      baseline: "context",
    });
    const caller = createCaller(db, OWNER_ID);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result).toEqual({
      activity: {
        ...activity,
        laps: [],
        likes_count: 5,
        activity_plans: null,
        segments: expect.any(Array),
        activity_kind: "single",
        activity_segment_count: 1,
        activity_categories: ["run"],
        matched_category_summary: null,
        current_artifact: null,
        ingestion: null,
        effective_session_rpe: null,
      },
      has_liked: true,
      derived: privateDerived,
      segment_loads: [],
    });
    expect(mockActivityAnalysis.resolveActivityContextAsOf).not.toHaveBeenCalled();
    expect(mockActivityAnalysis.analyzeActivityDerivedMetrics).not.toHaveBeenCalled();
  });

  it("returns the latest effective session RPE evidence only to the activity owner", async () => {
    const activity = buildActivityRow({ profile_id: OWNER_ID });
    const firstEvidenceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const effectiveEvidenceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const db = createDbMock({
      queryActivitiesFindFirst: [
        { profile_id: OWNER_ID, is_private: false, content_visibility: "public" },
      ],
      joinedRows: [{ activity, activityPlan: null }],
      sessionRpeEvidenceRows: [
        {
          id: firstEvidenceId,
          profileId: OWNER_ID,
          activityId: ACTIVITY_ID,
          recordedAt: new Date("2026-01-10T08:46:00.000Z"),
          correctedAt: null,
          rpe: 6,
          scale: "borg_cr10",
          scaleVersion: "1",
          source: "user",
          operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          correctionOfId: null,
          provenance: { observation_type: "completed_session_rpe", entered_by: "athlete" },
          createdAt: new Date("2026-01-10T08:46:00.000Z"),
        },
        {
          id: effectiveEvidenceId,
          profileId: OWNER_ID,
          activityId: ACTIVITY_ID,
          recordedAt: new Date("2026-01-10T08:47:00.000Z"),
          correctedAt: new Date("2026-01-10T08:48:00.000Z"),
          rpe: 7,
          scale: "borg_cr10",
          scaleVersion: "1",
          source: "manual",
          operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          correctionOfId: firstEvidenceId,
          provenance: {
            observation_type: "completed_session_rpe",
            entered_by: "athlete",
            correction_of_id: firstEvidenceId,
          },
          createdAt: new Date("2026-01-10T08:48:00.000Z"),
        },
      ],
    });

    const result = await createCaller(db).getById({ id: ACTIVITY_ID });

    expect(result.activity.effective_session_rpe).toEqual({
      id: effectiveEvidenceId,
      rpe: 7,
      scale: "borg_cr10",
      scale_version: "1",
      source: "manual",
      recorded_at: new Date("2026-01-10T08:47:00.000Z"),
      corrected_at: new Date("2026-01-10T08:48:00.000Z"),
      provenance: {
        observation_type: "completed_session_rpe",
        entered_by: "athlete",
        correction_of_id: firstEvidenceId,
      },
    });
  });

  it("uses canonical parent detail values and preserves lap order", async () => {
    const activity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      distance_meters: 1,
      elapsed_ms: 2_000,
      active_ms: 2_000,
      moving_ms: 1_900,
      provider: "wahoo",
      external_id: "legacy-external-id",
      polyline: "legacy-polyline",
      map_bounds: { legacy: true },
      laps: [{ legacy: true }],
      normalized_power: 999,
    });
    const canonicalSegment = buildSegmentReadRow(ACTIVITY_ID, 0, "run", {
      summary: {
        version: 1,
        timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
        normalizedPowerWatts: 247.5,
      },
    });
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([[ACTIVITY_ID, [canonicalSegment]]]),
    );
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OWNER_ID,
          is_private: false,
        },
      ],
      joinedRows: [{ activity, activityPlan: null }],
      queryActivitySummariesFindFirst: [
        buildActivitySummaryRow({
          distance_meters: 22222,
          duration_seconds: 3333,
        }),
      ],
      queryActivityImportsFindFirst: [
        buildActivityImportRow({
          external_id: "split-external-id",
        }),
      ],
      queryActivityGeometryFindFirst: [
        buildActivityGeometryRow({
          polyline: "split-polyline",
          map_bounds: { split: true },
        }),
      ],
      activityLapRows: [],
      currentArtifactRows: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          digest_algorithm: "sha256",
          digest: "a".repeat(64),
          byte_size: 123456,
          media_type: "application/vnd.ant.fit",
          format: "fit",
          original_name: "activity.fit",
          availability: "accepted",
          first_accepted_at: new Date("2026-01-10T09:00:00.000Z"),
        },
      ],
    });

    const caller = createCaller(db);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result.activity).toMatchObject({
      distance_meters: 1,
      elapsed_ms: 2_000,
      active_ms: 2_000,
      moving_ms: 1_900,
      normalized_power: 248,
      external_id: "legacy-external-id",
      polyline: "legacy-polyline",
      map_bounds: { legacy: true },
      laps: [{ legacy: true }],
      segments: expect.any(Array),
      current_artifact: expect.objectContaining({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        availability: "accepted",
      }),
    });
    expect(result.activity.segments).toEqual([canonicalSegment]);
    expect(result.activity).toMatchObject({
      activity_kind: "single",
      activity_segment_count: 1,
      activity_categories: ["run"],
      matched_category_summary: null,
    });
  });

  it("updates an owned activity", async () => {
    const updated = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      name: "Renamed Run",
      notes: "Felt strong",
      is_private: true,
    });
    const db = createDbMock({
      updatedRows: [updated],
    });

    const caller = createCaller(db);
    const result = await caller.update({
      id: ACTIVITY_ID,
      name: "Renamed Run",
      notes: "Felt strong",
      is_private: true,
    });

    expect(result).toEqual(updated);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("strictly rejects legacy normalized_power updates without persisting them", async () => {
    const db = createDbMock({ updatedRows: [buildActivityRow()] });

    await expect(
      createCaller(db).update({ id: ACTIVITY_ID, normalized_power: 999 } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("projects divergent parent normalized_power from canonical segments in list DTOs", async () => {
    const row = buildActivityRow({ normalized_power: 999, category: "bike" });
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([
        [
          ACTIVITY_ID,
          [
            buildSegmentReadRow(ACTIVITY_ID, 0, "bike", {
              summary: {
                version: 1,
                timing: { timingCoverage: "complete", activeMs: 1_000, movingMs: 900 },
                normalizedPowerWatts: 247.5,
              },
            }),
          ],
        ],
      ]),
    );

    const result = await createCaller(createDbMock({ activityRows: [row] })).listPaginated({});
    expect(result.items[0]?.normalized_power).toBe(248);
  });

  it("returns null normalized_power for malformed or ambiguous canonical segments", async () => {
    const rows = [
      buildActivityRow({ id: ACTIVITY_ID, normalized_power: 999 }),
      buildActivityRow({ id: ACTIVITY_ID_2, normalized_power: 999 }),
      buildActivityRow({ id: ACTIVITY_ID_3, normalized_power: 999 }),
    ];
    mockActivityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(
      new Map([
        [ACTIVITY_ID, [{ ...buildSegmentReadRow(ACTIVITY_ID, 0, "bike"), summary: {} }]],
        [ACTIVITY_ID_2, [{ ...buildSegmentReadRow(ACTIVITY_ID_2, 0, "bike"), role: "transition" }]],
        [
          ACTIVITY_ID_3,
          [
            buildSegmentReadRow(ACTIVITY_ID_3, 0, "bike"),
            buildSegmentReadRow(ACTIVITY_ID_3, 1, "run"),
          ],
        ],
      ]),
    );

    const result = await createCaller(createDbMock({ activityRows: rows })).listPaginated({
      limit: 3,
    });
    expect(result.items.map((item) => item.normalized_power)).toEqual([null, null, null]);
  });

  it("deletes an owned activity", async () => {
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          id: ACTIVITY_ID,
          profile_id: OWNER_ID,
        },
      ],
    });

    const caller = createCaller(db);
    const result = await caller.delete({ id: ACTIVITY_ID });

    expect(result).toEqual({ success: true, deletedActivityId: ACTIVITY_ID });
    expect(db.__spies.deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("rejects non-ISO paginated list date filters at the router boundary", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.listPaginated({
        date_from: "not-a-date",
        date_to: "2026-01-31T23:59:59.999Z",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects non-ISO activity upload timestamps", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.create({
        profile_id: OWNER_ID,
        eventId: null,
        name: "Long Ride",
        notes: null,
        startedAt: "2026-01-15",
        finishedAt: "2026-01-15T11:00:00.000Z",
        segmentSet: singleSegmentSet("bike", 7_200_000),
        acceptedArtifact: ACCEPTED_ARTIFACT,
        summary: { distanceMeters: 50000 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed activity rows before returning paginated list results", async () => {
    const db = createDbMock({
      activityRows: [
        {
          ...buildActivityRow(),
          id: "not-a-uuid",
        },
      ],
    });
    const caller = createCaller(db);

    await expect(
      caller.listPaginated({
        date_from: "2026-01-01T00:00:00.000Z",
        date_to: "2026-01-31T23:59:59.999Z",
      }),
    ).rejects.toThrow();
  });
});
