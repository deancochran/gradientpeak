import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pgDialect = new PgDialect();

const mockActivityAnalysis = vi.hoisted(() => ({
  analyzeActivityDerivedMetrics: vi.fn(),
  buildActivityDerivedSummaryMap: vi.fn(),
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
}));

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

vi.mock("../../lib/activity-analysis", () => ({
  buildActivityDerivedSummaryMap: mockActivityAnalysis.buildActivityDerivedSummaryMap,
  mapActivityToDerivedResponse: mockActivityAnalysis.mapActivityToDerivedResponse,
  mapActivityToListDerivedResponse: mockActivityAnalysis.mapActivityToListDerivedResponse,
  resolveActivityContextAsOf: mockActivityAnalysis.resolveActivityContextAsOf,
}));

vi.mock("../../utils/profile-estimation-state", () => ({
  markProfileAnalysisDirty: vi.fn(async () => undefined),
}));

import { activitiesRouter } from "../activities";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVITY_ID = "33333333-3333-4333-8333-333333333333";
const ACTIVITY_ID_2 = "44444444-4444-4444-8444-444444444444";
const ACTIVITY_ID_3 = "55555555-5555-4555-8555-555555555555";
const EVENT_ID = "66666666-6666-4666-8666-666666666666";
const PLAN_ID = "77777777-7777-4777-8777-777777777777";

function buildActivityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVITY_ID,
    idx: 1,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    profile_id: OWNER_ID,
    activity_plan_id: null,
    name: "Morning Run",
    type: "run",
    provider: null,
    external_id: null,
    started_at: new Date("2026-01-10T08:00:00.000Z"),
    finished_at: new Date("2026-01-10T08:45:00.000Z"),
    duration_seconds: 2700,
    moving_seconds: 2650,
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
    activity_file_path: null,
    activity_file_size: null,
    import_source: null,
    import_file_type: null,
    import_original_file_name: null,
    notes: null,
    polyline: null,
    laps: null,
    map_bounds: null,
    likes_count: null,
    is_private: false,
    ...overrides,
  };
}

function buildActivityPlanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    idx: 0,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-02T00:00:00.000Z"),
    profile_id: OWNER_ID,
    route_id: null,
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
    likes_count: null,
    is_public: false,
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
  likeRows?: Array<{ entity_id: string }>;
  totalRows?: Array<{ total: number }>;
  joinedRows?: any[];
  activitySummaryRows?: any[];
  activityImportRows?: any[];
  activityGeometryRows?: any[];
  activityLapRows?: any[];
  queryActivitiesFindFirst?: any[];
  queryActivityGeometryFindFirst?: any[];
  queryActivityImportsFindFirst?: any[];
  queryActivitySummariesFindFirst?: any[];
  queryEventsFindFirst?: any[];
  queryLikesFindFirst?: any[];
  executeRows?: Array<{ id: string }>;
  insertedRowsByTable?: Record<string, unknown[]>;
  updatedRows?: any[];
}) {
  const insertValues = vi.fn();
  const deleteWhere = vi.fn(() => Promise.resolve());
  const offset = vi.fn(() => Promise.resolve(options.activityRows ?? []));
  const limit = vi.fn(() => ({
    offset,
    then: (onFulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve(options.activityRows ?? []).then(onFulfilled),
  }));
  const orderBy = vi.fn((..._args: unknown[]) => ({
    limit,
    then: (onFulfilled: (value: unknown[]) => unknown) =>
      Promise.resolve(options.activityRows ?? []).then(onFulfilled),
  }));

  function rowsForTable(tableName: string) {
    if (tableName === "activity_summaries") return options.activitySummaryRows ?? [];
    if (tableName === "activity_imports") return options.activityImportRows ?? [];
    if (tableName === "activity_geometry") return options.activityGeometryRows ?? [];
    if (tableName === "activity_laps") return options.activityLapRows ?? [];
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
            where: vi.fn(() => Promise.resolve(options.likeRows ?? [])),
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
        return {
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => {
              const joinedBuilder = {
                where: vi.fn(() => ({
                  orderBy,
                  limit: vi.fn(() => Promise.resolve(options.joinedRows ?? [])),
                })),
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
            where: vi.fn(() => {
              const rows = rowsForTable(getTableName(table));
              const resolveRows = () => Promise.resolve(rows);
              return {
                limit: vi.fn(resolveRows),
                orderBy:
                  getTableName(table) === "activities"
                    ? orderBy
                    : vi.fn(() => Promise.resolve(rows)),
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

        return {
          returning: vi.fn(() =>
            Promise.resolve(options.insertedRowsByTable?.[tableName] ?? options.executeRows ?? []),
          ),
        };
      }),
    })),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
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
      insertValues,
    },
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(new Map());
  mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({});
  mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue({
    stress: {
      tss: 50,
      intensity_factor: 0.8,
      trimp: null,
    },
    zones: { hr: [], power: [] },
    computed_as_of: "2026-01-01T00:00:00.000Z",
  });
});

describe("activitiesRouter", () => {
  it("lists owned activities with like and derived summaries", async () => {
    const rows = [buildActivityRow()];
    const derived = {
      tss: 72,
      intensity_factor: 0.81,
      computed_as_of: "2026-01-10T09:00:00.000Z",
    };
    const db = createDbMock({
      activityRows: rows,
      likeRows: [{ entity_id: ACTIVITY_ID }],
    });

    mockActivityAnalysis.buildActivityDerivedSummaryMap.mockResolvedValue(
      new Map([[ACTIVITY_ID, derived]]),
    );

    const caller = createCaller(db);
    const result = await caller.list({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result).toEqual([
      {
        ...rows[0],
        has_liked: true,
        derived,
      },
    ]);
    expect(mockActivityAnalysis.buildActivityDerivedSummaryMap).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OWNER_ID,
        activities: rows,
      }),
    );
  });

  it("overlays split summary import and geometry values in list responses", async () => {
    const rows = [
      buildActivityRow({
        distance_meters: 1,
        duration_seconds: 2,
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
    const result = await caller.list({
      date_from: "2026-01-01T00:00:00.000Z",
      date_to: "2026-01-31T23:59:59.999Z",
    });

    expect(result[0]).toMatchObject({
      distance_meters: 12345,
      duration_seconds: 3600,
      provider: "wahoo",
      external_id: "split-external-id",
      polyline: "split-polyline",
      map_bounds: { split: true },
    });
  });

  it("sorts paginated distance and duration queries by split summary values with legacy fallback", async () => {
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
    expect(orderSql).toContain('"activity_summaries"."distance_meters"');
    expect(orderSql).toContain('"activity_summaries"."duration_seconds" desc');
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
        type: "bike",
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
        [ACTIVITY_ID, { tss: 20 }],
        [
          ACTIVITY_ID_2,
          {
            tss: 95,
            intensity_factor: 0.92,
            computed_as_of: "2026-01-11T10:00:00.000Z",
          },
        ],
        [
          ACTIVITY_ID_3,
          {
            tss: 60,
            intensity_factor: 0.78,
            computed_as_of: "2026-01-10T09:00:00.000Z",
          },
        ],
        [
          ACTIVITY_ID,
          {
            tss: 20,
            intensity_factor: 0.65,
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
    expect(db.__spies.limit).toHaveBeenCalledWith(3);
  });

  it("caps paginated tss candidate loading", async () => {
    const db = createDbMock({
      activityRows: [buildActivityRow()],
      totalRows: [{ total: 1000 }],
    });
    const caller = createCaller(db);

    await caller.listPaginated({
      limit: 50,
      cursor: "index:900",
      sort_by: "tss",
      sort_order: "desc",
    });

    expect(db.__spies.limit).toHaveBeenCalledWith(500);
  });

  it("creates an activity linked to a planned-activity event", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Long Ride",
      type: "bike",
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
      type: "bike",
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T11:00:00.000Z",
      durationSeconds: 7200,
      movingSeconds: 7100,
      distanceMeters: 50000,
      metrics: {},
    });

    expect(result).toEqual(createdActivity);
    expect(db.select).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("creates an activity from a mobile recording summary with pending ingestion", async () => {
    const createdActivity = buildActivityRow({
      id: ACTIVITY_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      type: "run",
      is_private: true,
      started_at: new Date("2026-01-15T09:00:00.000Z"),
      finished_at: new Date("2026-01-15T10:00:00.000Z"),
    });
    const ingestion = buildActivityFileIngestionRow();
    const db = createDbMock({
      insertedRowsByTable: {
        activities: [createdActivity],
        activity_file_ingestions: [ingestion],
      },
    });

    const caller = createCaller(db);
    const result = await caller.createFromRecordingSummary({
      profileId: OWNER_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      is_private: true,
      activityType: "run",
      activityPlanId: PLAN_ID,
      startedAt: "2026-01-15T09:00:00.000Z",
      finishedAt: "2026-01-15T10:00:00.000Z",
      durationSeconds: 3600,
      movingSeconds: 3500,
      distanceMeters: 10000,
      calories: 640,
      localFileMetadata: {
        fileType: "fit",
        fileSize: 123456,
        filePath: null,
      },
    });

    expect(result).toMatchObject({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      is_private: true,
      duration_seconds: 3600,
      moving_seconds: 3500,
      distance_meters: 10000,
      calories: 640,
      ingestion: {
        id: ingestion.id,
        status: "pending_upload",
        source: "mobile_recording",
      },
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(findInsertedValue(db, "activities")).toMatchObject({
      profile_id: OWNER_ID,
      activity_plan_id: PLAN_ID,
      name: "Recorder Run",
      notes: "Phone GPS",
      type: "run",
      is_private: true,
    });
    expect(findInsertedValue(db, "activity_summaries")).toMatchObject({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      duration_seconds: 3600,
      moving_seconds: 3500,
      distance_meters: 10000,
      calories: 640,
    });
    expect(findInsertedValue(db, "activity_file_ingestions")).toMatchObject({
      activity_id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      source: "mobile_recording",
      status: "pending_upload",
      file_type: "fit",
      file_size: 123456,
      file_path: null,
    });
  });

  it("rejects recording summary creation for another profile", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        profileId: OTHER_ID,
        name: "Other Run",
        activityType: "run",
        startedAt: "2026-01-15T09:00:00.000Z",
        finishedAt: "2026-01-15T10:00:00.000Z",
        durationSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10000,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects recording summary creation with invalid duration", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.createFromRecordingSummary({
        profileId: OWNER_ID,
        name: "Bad Run",
        activityType: "run",
        startedAt: "2026-01-15T09:00:00.000Z",
        finishedAt: "2026-01-15T10:00:00.000Z",
        durationSeconds: 0,
        movingSeconds: 0,
        distanceMeters: 0,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller.createFromRecordingSummary({
        profileId: OWNER_ID,
        name: "Backwards Run",
        activityType: "run",
        startedAt: "2026-01-15T10:00:00.000Z",
        finishedAt: "2026-01-15T09:00:00.000Z",
        durationSeconds: 3600,
        movingSeconds: 3500,
        distanceMeters: 10000,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns a derived activity response for an accessible activity", async () => {
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
    const derived = {
      stress: { tss: 88, intensity_factor: 0.91, trimp: null },
      zones: { hr: [], power: [] },
      computed_as_of: "2026-01-10T09:00:00.000Z",
    };
    const db = createDbMock({
      queryActivitiesFindFirst: [
        {
          profile_id: OTHER_ID,
          is_private: false,
        },
      ],
      joinedRows: [{ activity, activityPlan }],
      queryLikesFindFirst: [{ id: "like-1" }],
    });

    mockActivityAnalysis.resolveActivityContextAsOf.mockResolvedValue({
      baseline: "context",
    });
    mockActivityAnalysis.analyzeActivityDerivedMetrics.mockReturnValue(derived);

    const caller = createCaller(db, OWNER_ID);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result).toEqual({
      activity: {
        ...activity,
        activity_plans: {
          ...activityPlan,
          idx: 0,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-02T00:00:00.000Z",
        },
        ingestion: null,
      },
      has_liked: true,
      derived,
    });
    expect(mockActivityAnalysis.resolveActivityContextAsOf).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: OTHER_ID,
        activityTimestamp: finishedAt,
      }),
    );
  });

  it("prefers split activity detail values and treats empty split laps as authoritative", async () => {
    const activity = buildActivityRow({
      id: ACTIVITY_ID,
      profile_id: OWNER_ID,
      distance_meters: 1,
      duration_seconds: 2,
      provider: null,
      external_id: "legacy-external-id",
      polyline: "legacy-polyline",
      map_bounds: { legacy: true },
      laps: [{ legacy: true }],
    });
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
    });

    const caller = createCaller(db);
    const result = await caller.getById({ id: ACTIVITY_ID });

    expect(result.activity).toMatchObject({
      distance_meters: 22222,
      duration_seconds: 3333,
      external_id: "split-external-id",
      polyline: "split-polyline",
      map_bounds: { split: true },
      laps: [],
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

  it("rejects non-ISO list date filters at the router boundary", async () => {
    const caller = createCaller(createDbMock({}));

    await expect(
      caller.list({
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
        type: "bike",
        startedAt: "2026-01-15",
        finishedAt: "2026-01-15T11:00:00.000Z",
        durationSeconds: 7200,
        movingSeconds: 7100,
        distanceMeters: 50000,
        metrics: {},
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects malformed activity rows before returning list results", async () => {
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
      caller.list({
        date_from: "2026-01-01T00:00:00.000Z",
        date_to: "2026-01-31T23:59:59.999Z",
      }),
    ).rejects.toThrow();
  });
});
