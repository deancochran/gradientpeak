import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_ID = "22222222-2222-4222-8222-222222222222";
const ROUTE_ID_2 = "33333333-3333-4333-8333-333333333333";
const UPDATED_ROUTE_ID = "44444444-4444-4444-8444-444444444444";
const UPLOADED_ROUTE_ID = "55555555-5555-4555-8555-555555555555";
const STORED_ROUTE_CONTENT = "<gpx>route</gpx>";
const STORED_ROUTE_SHA256 = createHash("sha256").update(STORED_ROUTE_CONTENT, "utf8").digest("hex");

const mockStorage = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

const mockRouteParser = vi.hoisted(() => ({
  parseRouteWithFormat: vi.fn(),
  validateRoute: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn() }));
const mockOwnedRouteMirror = vi.hoisted(() => vi.fn());

const mockCore = vi.hoisted(() => ({
  calculateRouteStats: vi.fn(),
  simplifyCoordinates: vi.fn(),
  encodePolyline: vi.fn(),
  encodeElevationPolyline: vi.fn(),
}));

vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: {
      from: () => ({
        upload: mockStorage.upload,
        download: mockStorage.download,
        remove: mockStorage.remove,
      }),
    },
  }),
}));

vi.mock("../../lib/routes/route-parser", () => ({
  parseRouteWithFormat: mockRouteParser.parseRouteWithFormat,
  validateRoute: mockRouteParser.validateRoute,
}));

vi.mock("../../lib/logger", () => ({ logger: mockLogger }));
vi.mock("../../lib/provider-sync/owned-routes", () => ({
  enqueueWahooOwnedRouteMirror: mockOwnedRouteMirror,
}));

vi.mock("@repo/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@repo/core")>();

  return {
    ...actual,
    calculateRouteStats: mockCore.calculateRouteStats,
    simplifyCoordinates: mockCore.simplifyCoordinates,
    encodePolyline: mockCore.encodePolyline,
    encodeElevationPolyline: mockCore.encodeElevationPolyline,
  };
});

import { routesRouter } from "../routes";

function createCaller(db: any, userId = OWNER_ID) {
  const dbWithTransaction = {
    ...db,
    transaction:
      db.transaction ??
      vi.fn(async (operation: (transaction: typeof db) => Promise<unknown>) => operation(db)),
  };
  return routesRouter.createCaller({
    db: dbWithTransaction,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function createRouteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTE_ID,
    profile_id: OWNER_ID,
    name: "River Loop",
    description: "Steady weekend route",
    file_path: `${OWNER_ID}/route.gpx`,
    storage_state: "ready",
    total_distance: 42195,
    total_ascent: 550,
    total_descent: 540,
    polyline: "encoded-preview",
    elevation_polyline: "encoded-elevation",
    is_system_template: false,
    is_public: false,
    created_at: new Date("2026-02-01T10:00:00.000Z"),
    updated_at: new Date("2026-02-02T10:00:00.000Z"),
    ...overrides,
  };
}

function createSelectWithLimit(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        for: vi.fn(() => ({ limit })),
        limit,
      })),
    })),
  };
}

function createGroupedSelect(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({ groupBy: vi.fn().mockResolvedValue(result) })),
    })),
  };
}

function withUploadLifecycle<T extends Record<string, unknown>>(
  db: T,
  readyRoute = createRouteRow({
    id: UPLOADED_ROUTE_ID,
    file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
    file_sha256: createHash("sha256").update("<gpx />", "utf8").digest("hex"),
  }),
) {
  return {
    select: vi.fn(() => createSelectWithLimit([])),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ ...readyRoute, storage_state: "ready" }]),
        })),
      })),
    })),
    ...db,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.upload.mockResolvedValue({ error: null });
  mockStorage.download.mockResolvedValue({ error: null, data: null });
  mockStorage.remove.mockResolvedValue({ error: null });
  mockOwnedRouteMirror.mockResolvedValue(null);
  mockRouteParser.parseRouteWithFormat.mockImplementation((content: string, fileType?: string) => ({
    format:
      fileType === "tcx" || (fileType === "xml" && content.includes("TrainingCenterDatabase"))
        ? "tcx"
        : "gpx",
    route: {
      coordinates: [
        { latitude: 40.1, longitude: -74.1, altitude: 10 },
        { latitude: 40.2, longitude: -74.2, altitude: 20 },
      ],
    },
  }));
  mockRouteParser.validateRoute.mockReturnValue({ valid: true, errors: [] });
  mockCore.calculateRouteStats.mockReturnValue({
    totalDistance: 1000,
    totalAscent: 40,
    totalDescent: 35,
  });
  mockCore.simplifyCoordinates.mockImplementation((coordinates) => coordinates);
  mockCore.encodePolyline.mockReturnValue("encoded-polyline");
  mockCore.encodeElevationPolyline.mockReturnValue("encoded-elevation");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routesRouter", () => {
  it("lists owned routes with like state and pagination cursor", async () => {
    const firstRoute = createRouteRow();
    const secondRoute = createRouteRow({
      id: ROUTE_ID_2,
      name: "Hill Repeats",
      created_at: new Date("2026-01-31T10:00:00.000Z"),
      updated_at: new Date("2026-02-01T10:00:00.000Z"),
    });
    const thirdRoute = createRouteRow({
      id: UPDATED_ROUTE_ID,
      name: "Long Climb",
      created_at: new Date("2026-01-30T10:00:00.000Z"),
      updated_at: new Date("2026-01-31T10:00:00.000Z"),
    });

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue([firstRoute, secondRoute, thirdRoute]),
              })),
            })),
          })),
        }))
        .mockImplementationOnce(() =>
          createGroupedSelect([{ entity_id: ROUTE_ID, likes_count: 1, has_liked: true }]),
        )
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi
              .fn()
              .mockResolvedValue([
                { id: OWNER_ID, username: "Owner", avatar_url: "https://example.com/avatar.png" },
              ]),
          })),
        })),
    };

    const caller = createCaller(db);
    const result = await caller.list({ limit: 2, search: "Loop" });

    expect(result).toEqual({
      items: [
        {
          ...firstRoute,
          created_at: "2026-02-01T10:00:00.000Z",
          updated_at: "2026-02-02T10:00:00.000Z",
          has_liked: true,
          likes_count: 1,
          owner: { id: OWNER_ID, username: "Owner", avatar_url: "https://example.com/avatar.png" },
        },
        {
          ...secondRoute,
          created_at: "2026-01-31T10:00:00.000Z",
          updated_at: "2026-02-01T10:00:00.000Z",
          has_liked: false,
          likes_count: 0,
          owner: { id: OWNER_ID, username: "Owner", avatar_url: "https://example.com/avatar.png" },
        },
      ],
      nextCursor: "index:2",
    });
  });

  it("rejects unknown list input keys at the boundary", async () => {
    const db = {
      select: vi.fn(),
    };

    const caller = createCaller(db);

    await expect(caller.list({ limit: 2, unexpected: true } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("accepts infinite-query direction metadata", async () => {
    const db = {
      select: vi.fn().mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    };

    const caller = createCaller(db);

    await expect(caller.list({ limit: 20, direction: "forward" } as never)).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
  });

  it("rejects unsafe or excessively deep route cursors", async () => {
    const caller = createCaller({ select: vi.fn() });

    for (const cursor of ["index:10001", "index:999999999999999999999999"]) {
      await expect(caller.list({ cursor, limit: 20 })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("accepts owner scope filtering metadata", async () => {
    const db = {
      select: vi.fn().mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      })),
    };

    const caller = createCaller(db);

    await expect(caller.list({ limit: 20, ownerScope: "own" } as never)).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
  });

  it("uses an index offset for explicitly sorted discovery pages", async () => {
    const offset = vi.fn().mockResolvedValue([]);
    const db = {
      select: vi.fn().mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({ offset })),
            })),
          })),
        })),
      })),
    };
    const caller = createCaller(db);

    await expect(
      caller.list({ limit: 20, ownerScope: "all", sort_by: "distance_desc" }),
    ).resolves.toEqual({
      items: [],
      nextCursor: undefined,
    });
    expect(offset).toHaveBeenCalledWith(0);
  });

  it("gets a single owned route with like state", async () => {
    const route = createRouteRow();
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() =>
          createGroupedSelect([{ entity_id: ROUTE_ID, likes_count: 1, has_liked: true }]),
        )
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi
              .fn()
              .mockResolvedValue([
                { id: OWNER_ID, username: "Owner", avatar_url: "https://example.com/avatar.png" },
              ]),
          })),
        })),
    };

    const caller = createCaller(db);
    const result = await caller.get({ id: ROUTE_ID });

    expect(result).toEqual({
      ...route,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
      has_liked: true,
      likes_count: 1,
      owner: { id: OWNER_ID, username: "Owner", avatar_url: "https://example.com/avatar.png" },
    });
  });

  it("gets a public system route even when it has no owner profile", async () => {
    const route = createRouteRow({
      profile_id: null,
      is_public: true,
      is_system_template: true,
    });
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => createGroupedSelect([]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([]),
          })),
        })),
    };

    const caller = createCaller(db, "99999999-9999-4999-8999-999999999999");
    const result = await caller.get({ id: ROUTE_ID });

    expect(result.owner).toBeNull();
    expect(result.is_system_template).toBe(true);
    expect(result.is_public).toBe(true);
  });

  it("loads full route coordinates from stored GPX content", async () => {
    const route = createRouteRow({ file_sha256: STORED_ROUTE_SHA256 });
    const fileData = {
      text: vi.fn().mockResolvedValue(STORED_ROUTE_CONTENT),
    };
    mockStorage.download.mockResolvedValue({ error: null, data: fileData });

    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectWithLimit([route])),
    };

    const caller = createCaller(db);
    const result = await caller.loadFull({ id: ROUTE_ID });

    expect(mockStorage.download).toHaveBeenCalledWith(`${OWNER_ID}/route.gpx`);
    expect(fileData.text).toHaveBeenCalled();
    expect(mockRouteParser.parseRouteWithFormat).toHaveBeenCalledWith("<gpx>route</gpx>", "gpx");
    expect(result).toEqual({
      id: ROUTE_ID,
      name: "River Loop",
      coordinates: [
        { latitude: 40.1, longitude: -74.1, altitude: 10 },
        { latitude: 40.2, longitude: -74.2, altitude: 20 },
      ],
      totalDistance: 42195,
      totalAscent: 550,
      totalDescent: 540,
    });
  });

  it("loads full coordinates for a public system route", async () => {
    const route = createRouteRow({
      profile_id: null,
      file_path: "system/route.gpx",
      file_sha256: STORED_ROUTE_SHA256,
      is_public: true,
      is_system_template: true,
    });
    const fileData = {
      text: vi.fn().mockResolvedValue(STORED_ROUTE_CONTENT),
    };
    mockStorage.download.mockResolvedValue({ error: null, data: fileData });

    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectWithLimit([route])),
    };

    const caller = createCaller(db, "99999999-9999-4999-8999-999999999999");
    const result = await caller.loadFull({ id: ROUTE_ID });

    expect(mockStorage.download).toHaveBeenCalledWith("system/route.gpx");
    expect(result.id).toBe(ROUTE_ID);
  });

  it("loads full coordinates through a contextual route geometry grant", async () => {
    const route = createRouteRow({
      profile_id: "99999999-9999-4999-8999-999999999999",
      file_sha256: STORED_ROUTE_SHA256,
      is_public: false,
      is_system_template: false,
    });
    const fileData = {
      text: vi.fn().mockResolvedValue(STORED_ROUTE_CONTENT),
    };
    mockStorage.download.mockResolvedValue({ error: null, data: fileData });

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() =>
          createSelectWithLimit([
            {
              id: route.id,
              ownerProfileId: route.profile_id,
              isPublic: false,
              isSystem: false,
              storageState: "ready",
            },
          ]),
        )
        .mockImplementationOnce(() =>
          createSelectWithLimit([
            {
              accessLevel: "read_geometry",
              sourceType: "event",
              sourceId: "77777777-7777-4777-8777-777777777777",
            },
          ]),
        ),
    };

    const caller = createCaller(db);
    const result = await caller.loadFull({ id: ROUTE_ID });

    expect(mockStorage.download).toHaveBeenCalledWith(`${OWNER_ID}/route.gpx`);
    expect(result.id).toBe(ROUTE_ID);
  });

  it("rejects invalid parsed coordinates from stored route files", async () => {
    const route = createRouteRow({ file_sha256: STORED_ROUTE_SHA256 });
    const fileData = {
      text: vi.fn().mockResolvedValue(STORED_ROUTE_CONTENT),
    };

    mockStorage.download.mockResolvedValue({ error: null, data: fileData });
    mockRouteParser.parseRouteWithFormat.mockReturnValue({
      format: "gpx",
      route: { coordinates: [{ latitude: 40.1, longitude: -74.1, altitude: Number.NaN }] },
    });

    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectWithLimit([route])),
    };

    const caller = createCaller(db);

    await expect(caller.loadFull({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored route file contained invalid route data",
    });
  });

  it("rejects stored route bytes that do not match the durable content hash", async () => {
    const route = createRouteRow({ file_sha256: STORED_ROUTE_SHA256 });
    mockStorage.download.mockResolvedValue({
      error: null,
      data: { text: vi.fn().mockResolvedValue("<gpx>tampered</gpx>") },
    });
    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectWithLimit([route])),
    };

    await expect(createCaller(db).loadFull({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Stored route file failed its integrity check",
    });
    expect(mockRouteParser.parseRouteWithFormat).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith("Route file integrity check failed", {
      event: "route_storage_integrity_failed",
      path: `${OWNER_ID}/route.gpx`,
      routeId: ROUTE_ID,
    });
  });

  it("uploads a parsed route, stores the file, and persists derived metadata", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "New Route",
      description: "Uploaded from file",
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      file_sha256: createHash("sha256").update("<gpx>upload</gpx>", "utf8").digest("hex"),
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });

    const db = withUploadLifecycle(
      {
        insert: vi.fn(() => ({
          values: vi.fn((row: Record<string, unknown>) => ({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...insertedRoute, ...row, storage_state: "upload_pending" }]),
          })),
        })),
      },
      insertedRoute,
    );

    const caller = createCaller(db);
    const result = await caller.upload({
      idempotencyKey: UPLOADED_ROUTE_ID,
      name: "New Route",
      description: "Uploaded from file",
      fileContent: "<gpx>upload</gpx>",
      fileName: "new-route.gpx",
    });

    expect(mockRouteParser.validateRoute).toHaveBeenCalled();
    expect(mockCore.calculateRouteStats).toHaveBeenCalled();
    expect(mockStorage.upload).toHaveBeenCalledWith(
      `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      "<gpx>upload</gpx>",
      {
        contentType: "application/gpx+xml",
        upsert: true,
      },
    );
    expect(mockOwnedRouteMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRouteUpdatedAt: expect.any(String),
        operation: "upsert",
        profileId: OWNER_ID,
        routeId: UPLOADED_ROUTE_ID,
        transaction: db,
      }),
    );
    expect(result).toEqual({
      ...Object.fromEntries(Object.entries(insertedRoute).filter(([key]) => key !== "file_sha256")),
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });
  });

  it("replays a committed upload by client id without duplicating storage or persistence", async () => {
    const existingRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "Replay Route",
      description: "Same upload",
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      file_sha256: createHash("sha256").update("<gpx>upload</gpx>", "utf8").digest("hex"),
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });
    const db = {
      select: vi.fn(() => createSelectWithLimit([existingRoute])),
      insert: vi.fn(),
    };

    await expect(
      createCaller(db).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Replay Route",
        description: "Same upload",
        fileContent: "<gpx>upload</gpx>",
        fileName: "new-route.gpx",
      }),
    ).resolves.toEqual({
      ...Object.fromEntries(Object.entries(existingRoute).filter(([key]) => key !== "file_sha256")),
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a reused upload operation id when the payload differs", async () => {
    const existingRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "Replay Route",
      description: "Same upload",
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      file_sha256: createHash("sha256").update("<gpx>upload</gpx>", "utf8").digest("hex"),
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });
    const db = {
      select: vi.fn(() => createSelectWithLimit([existingRoute])),
      insert: vi.fn(),
    };

    await expect(
      createCaller(db).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Replay Route",
        description: "Same upload",
        fileContent: "<gpx>different</gpx>",
        fileName: "new-route.gpx",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Upload request conflicts with an existing route",
    });
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("re-reads a matching winning claim after a concurrent insert", async () => {
    const winningRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "Concurrent Route",
      description: null,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      file_sha256: createHash("sha256").update("<gpx />", "utf8").digest("hex"),
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([]))
        .mockImplementationOnce(() => createSelectWithLimit([winningRoute])),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(new Error("duplicate key")),
        })),
      })),
    };

    await expect(
      createCaller(db).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Concurrent Route",
        description: null,
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).resolves.toMatchObject({ id: UPLOADED_ROUTE_ID, storage_state: "ready" });
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("uploads TCX routes through the TCX parser and stores TCX content type", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "New Route",
      description: "Uploaded from TCX",
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
      file_sha256: createHash("sha256").update("<TrainingCenterDatabase />", "utf8").digest("hex"),
    });

    const db = withUploadLifecycle(
      {
        insert: vi.fn(() => ({
          values: vi.fn((row: Record<string, unknown>) => ({
            returning: vi
              .fn()
              .mockResolvedValue([{ ...insertedRoute, ...row, storage_state: "upload_pending" }]),
          })),
        })),
      },
      insertedRoute,
    );

    const caller = createCaller(db);
    await caller.upload({
      idempotencyKey: UPLOADED_ROUTE_ID,
      name: "New Route",
      description: "Uploaded from TCX",
      fileContent: "<TrainingCenterDatabase />",
      fileName: "new-route.tcx",
    });

    expect(mockRouteParser.parseRouteWithFormat).toHaveBeenCalledWith(
      "<TrainingCenterDatabase />",
      "tcx",
    );
    expect(mockStorage.upload).toHaveBeenCalledWith(
      `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
      "<TrainingCenterDatabase />",
      {
        contentType: "application/vnd.garmin.tcx+xml",
        upsert: true,
      },
    );
  });

  it("canonicalizes XML uploads from their sniffed route format", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "XML route",
      description: null,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
      file_sha256: createHash("sha256").update("<TrainingCenterDatabase />", "utf8").digest("hex"),
    });
    const values = vi.fn((row: Record<string, unknown>) => ({
      returning: vi
        .fn()
        .mockResolvedValue([{ ...insertedRoute, ...row, storage_state: "upload_pending" }]),
    }));
    const db = withUploadLifecycle(
      {
        insert: vi.fn(() => ({
          values,
        })),
      },
      insertedRoute,
    );
    const content = "<TrainingCenterDatabase />";

    await createCaller(db).upload({
      idempotencyKey: UPLOADED_ROUTE_ID,
      name: "XML route",
      description: "   ",
      fileContent: content,
      fileName: "route.xml",
    });

    expect(mockStorage.upload).toHaveBeenCalledWith(
      `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
      content,
      {
        contentType: "application/vnd.garmin.tcx+xml",
        upsert: true,
      },
    );
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("rejects oversize UTF-8 content before parsing or storage", async () => {
    const caller = createCaller({ insert: vi.fn() });
    const oversize = `é${"a".repeat(10_485_759)}`;

    await expect(
      caller.upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Too large",
        fileContent: oversize,
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRouteParser.parseRouteWithFormat).not.toHaveBeenCalled();
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("accepts exactly 10 MiB before invoking the parser", async () => {
    mockRouteParser.parseRouteWithFormat.mockImplementationOnce(() => {
      throw new Error("parse marker");
    });
    const caller = createCaller({ insert: vi.fn() });

    await expect(
      caller.upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Exact size",
        fileContent: `<gpx>${"a".repeat(10_485_749)}</gpx>`,
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRouteParser.parseRouteWithFormat).toHaveBeenCalledOnce();
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("rejects unsafe filenames at the input boundary", async () => {
    const caller = createCaller({ insert: vi.fn() });

    await expect(
      caller.upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Unsafe",
        fileContent: "<gpx />",
        fileName: "../route.gpx",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRouteParser.parseRouteWithFormat).not.toHaveBeenCalled();
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("does not upload when route parsing fails", async () => {
    mockRouteParser.parseRouteWithFormat.mockImplementationOnce(() => {
      throw new Error("private parser detail");
    });

    await expect(
      createCaller({ insert: vi.fn() }).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Broken",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid route file" });
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("does not touch storage when the durable upload claim cannot be persisted", async () => {
    const db = withUploadLifecycle({
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(new Error("secret db detail")),
        })),
      })),
    });

    await expect(
      createCaller(db).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Claim failure",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to prepare route upload; retry with the same file",
    });
    expect(mockStorage.upload).not.toHaveBeenCalled();
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });

  it("uses client operation UUIDs for distinct storage paths and database IDs", async () => {
    const insertedIds: string[] = [];
    for (const idempotencyKey of [ROUTE_ID_2, UPDATED_ROUTE_ID]) {
      const readyRoute = createRouteRow({
        id: idempotencyKey,
        name: "Same clock",
        description: null,
        file_path: `${OWNER_ID}/${idempotencyKey}.gpx`,
        file_sha256: createHash("sha256").update("<gpx />", "utf8").digest("hex"),
      });
      const db = withUploadLifecycle(
        {
          insert: vi.fn(() => ({
            values: vi.fn((row: Record<string, unknown> & { id: string }) => {
              insertedIds.push(row.id);
              return {
                returning: vi
                  .fn()
                  .mockResolvedValue([{ ...readyRoute, ...row, storage_state: "upload_pending" }]),
              };
            }),
          })),
        },
        readyRoute,
      );
      await createCaller(db).upload({
        idempotencyKey,
        name: "Same clock",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      });
    }

    expect(mockStorage.upload.mock.calls.map(([path]) => path)).toEqual([
      `${OWNER_ID}/${ROUTE_ID_2}.gpx`,
      `${OWNER_ID}/${UPDATED_ROUTE_ID}.gpx`,
    ]);
    expect(insertedIds).toEqual([ROUTE_ID_2, UPDATED_ROUTE_ID]);
  });

  it("resumes the same durable upload claim after finalization fails", async () => {
    const fileContent = "<gpx />";
    let storedRoute: ReturnType<typeof createRouteRow> | null = null;
    let finalizationAttempt = 0;
    const insert = vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          storedRoute = createRouteRow({ ...row, storage_state: "upload_pending" });
          return [storedRoute];
        }),
      })),
    }));
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            finalizationAttempt += 1;
            if (finalizationAttempt === 1) throw new Error("database unavailable");
            storedRoute = createRouteRow({ ...storedRoute, storage_state: "ready" });
            return [storedRoute];
          }),
        })),
      })),
    }));
    const db = {
      select: vi.fn(() => createSelectWithLimit(storedRoute ? [storedRoute] : [])),
      insert,
      update,
    };
    const input = {
      idempotencyKey: UPLOADED_ROUTE_ID,
      name: "Resumable upload",
      description: null,
      fileContent,
      fileName: "route.gpx",
    };

    await expect(createCaller(db).upload(input)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Route upload is stored but not finalized; retry with the same file",
    });
    await expect(createCaller(db).upload(input)).resolves.toMatchObject({
      id: UPLOADED_ROUTE_ID,
      storage_state: "ready",
    });
    expect(insert).toHaveBeenCalledOnce();
    expect(mockStorage.upload).toHaveBeenCalledTimes(2);
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });

  it("returns a matching route when a concurrent retry wins finalization", async () => {
    const pendingRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      name: "Concurrent Route",
      description: null,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      file_sha256: createHash("sha256").update("<gpx />", "utf8").digest("hex"),
      storage_state: "upload_pending",
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });
    const readyRoute = { ...pendingRoute, storage_state: "ready" };
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([pendingRoute]))
        .mockImplementationOnce(() => createSelectWithLimit([readyRoute])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })),
        })),
      })),
    };

    await expect(
      createCaller(db).upload({
        idempotencyKey: UPLOADED_ROUTE_ID,
        name: "Concurrent Route",
        description: null,
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).resolves.toMatchObject({ id: UPLOADED_ROUTE_ID, storage_state: "ready" });
    expect(mockStorage.upload).toHaveBeenCalledOnce();
    expect(mockOwnedRouteMirror).not.toHaveBeenCalled();
  });

  it("updates owned route metadata without clearing an omitted description and queues a mirror", async () => {
    const updatedRoute = createRouteRow({ name: "Renamed Loop" });
    const set = vi.fn((_changes: Record<string, unknown>) => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([updatedRoute]) })),
    }));
    const db = {
      select: vi.fn(() => createSelectWithLimit([{ id: ROUTE_ID }])),
      update: vi.fn(() => ({ set })),
    };

    await expect(createCaller(db).update({ id: ROUTE_ID, name: "Renamed Loop" })).resolves.toEqual({
      ...updatedRoute,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });

    const [changes] = set.mock.calls[0] ?? [];
    expect(changes).toMatchObject({ name: "Renamed Loop", updated_at: expect.any(Date) });
    expect(changes).not.toHaveProperty("description");
    expect(mockOwnedRouteMirror).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRouteUpdatedAt: expect.any(String),
        operation: "upsert",
        profileId: OWNER_ID,
        routeId: ROUTE_ID,
        transaction: db,
      }),
    );
  });

  it("deletes an unused route and removes its stored file", async () => {
    const route = createRouteRow();
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ ...route, storage_state: "deletion_pending" }]),
        })),
      })),
    }));
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ value: 0 }]),
          })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ value: 0 }]),
          })),
        })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: ROUTE_ID }]),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      update,
    };

    const caller = createCaller(db);
    const result = await caller.delete({ id: ROUTE_ID });

    expect(result).toEqual({ success: true });
    expect(mockOwnedRouteMirror).toHaveBeenCalledWith({
      db: expect.any(Object),
      operation: "delete",
      profileId: OWNER_ID,
      routeId: ROUTE_ID,
      transaction: db,
    });
    expect(mockStorage.remove).toHaveBeenCalledWith([`${OWNER_ID}/route.gpx`]);
    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("replays deletion only for an owner-scoped durable receipt", async () => {
    const receiptDb = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([]))
        .mockImplementationOnce(() => createSelectWithLimit([{ routeId: ROUTE_ID }])),
    };
    await expect(createCaller(receiptDb).delete({ id: ROUTE_ID })).resolves.toEqual({
      success: true,
    });
    expect(mockStorage.remove).not.toHaveBeenCalled();

    const missingDb = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([]))
        .mockImplementationOnce(() => createSelectWithLimit([])),
    };
    await expect(createCaller(missingDb).delete({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Route not found",
    });
  });

  it("keeps a durable deletion claim when storage removal fails", async () => {
    mockStorage.remove.mockResolvedValueOnce({ error: { message: "private storage detail" } });
    const route = createRouteRow();
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ ...route, storage_state: "deletion_pending" }]),
        })),
      })),
    }));
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: ROUTE_ID }]) })),
      })),
      update,
    };

    await expect(createCaller(db).delete({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Route file deletion is pending; retry route deletion",
    });
    expect(mockLogger.error).toHaveBeenCalledWith("Route storage deletion failed", {
      event: "route_storage_deletion_failed",
      bucket: "gpx-routes",
      path: `${OWNER_ID}/route.gpx`,
      correlationId: `route-delete:${ROUTE_ID}`,
      routeId: ROUTE_ID,
      failureKind: "storage_error_result",
    });
  });

  it("keeps deletion resumable when its remote-delete job cannot be persisted", async () => {
    mockOwnedRouteMirror.mockRejectedValueOnce(new Error("queue unavailable"));
    const route = createRouteRow();
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: ROUTE_ID }]) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...route, storage_state: "deletion_pending" }]),
          })),
        })),
      })),
    };

    await expect(createCaller(db).delete({ id: ROUTE_ID })).rejects.toThrow("queue unavailable");
    expect(db.delete).toHaveBeenCalledOnce();
    expect(mockStorage.remove).toHaveBeenCalledWith([`${OWNER_ID}/route.gpx`]);
  });

  it("returns a conflict without deleting when events still link the route", async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([createRouteRow()]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 1 }]) })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 1 }]) })),
        })),
      delete: vi.fn(),
    };

    await expect(createCaller(db).delete({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "Cannot delete route because it is used by 2 events. Please remove the route from those events first.",
    });
    expect(db.delete).not.toHaveBeenCalled();
    expect(mockOwnedRouteMirror).not.toHaveBeenCalled();
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });
});
