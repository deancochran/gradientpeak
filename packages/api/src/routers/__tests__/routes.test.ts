import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_ID = "22222222-2222-4222-8222-222222222222";
const ROUTE_ID_2 = "33333333-3333-4333-8333-333333333333";
const UPDATED_ROUTE_ID = "44444444-4444-4444-8444-444444444444";
const UPLOADED_ROUTE_ID = "55555555-5555-4555-8555-555555555555";

const mockStorage = vi.hoisted(() => ({
  upload: vi.fn(),
  download: vi.fn(),
  remove: vi.fn(),
}));

const mockRouteParser = vi.hoisted(() => ({
  parseRoute: vi.fn(),
  validateRoute: vi.fn(),
}));

const mockCore = vi.hoisted(() => ({
  calculateRouteStats: vi.fn(),
  simplifyCoordinates: vi.fn(),
  encodePolyline: vi.fn(),
  encodeElevationPolyline: vi.fn(),
}));

const mockRandomUUID = vi.hoisted(() => vi.fn(() => UPLOADED_ROUTE_ID));

vi.mock("node:crypto", () => ({
  randomUUID: mockRandomUUID,
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
  parseRoute: mockRouteParser.parseRoute,
  validateRoute: mockRouteParser.validateRoute,
}));

vi.mock("@repo/core", () => ({
  calculateRouteStats: mockCore.calculateRouteStats,
  simplifyCoordinates: mockCore.simplifyCoordinates,
  encodePolyline: mockCore.encodePolyline,
  encodeElevationPolyline: mockCore.encodeElevationPolyline,
}));

import { routesRouter } from "../routes";

function createCaller(db: any, userId = OWNER_ID) {
  return routesRouter.createCaller({
    db,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function createRouteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTE_ID,
    idx: 1,
    profile_id: OWNER_ID,
    name: "River Loop",
    description: "Steady weekend route",
    activity_category: "bike",
    file_path: `${OWNER_ID}/route.gpx`,
    total_distance: 42195,
    total_ascent: 550,
    total_descent: 540,
    polyline: "encoded-preview",
    elevation_polyline: "encoded-elevation",
    likes_count: null,
    source: "manual",
    is_public: false,
    created_at: new Date("2026-02-01T10:00:00.000Z"),
    updated_at: new Date("2026-02-02T10:00:00.000Z"),
    ...overrides,
  };
}

function createSelectWithLimit(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.upload.mockResolvedValue({ error: null });
  mockStorage.download.mockResolvedValue({ error: null, data: null });
  mockStorage.remove.mockResolvedValue({ error: null });
  mockRouteParser.parseRoute.mockReturnValue({
    coordinates: [
      { latitude: 40.1, longitude: -74.1, altitude: 10 },
      { latitude: 40.2, longitude: -74.2, altitude: 20 },
    ],
  });
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
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ entity_id: ROUTE_ID }]),
          })),
        })),
    };

    const caller = createCaller(db);
    const result = await caller.list({ limit: 2, activityCategory: "bike", search: "Loop" });

    expect(result).toEqual({
      items: [
        {
          ...firstRoute,
          created_at: "2026-02-01T10:00:00.000Z",
          updated_at: "2026-02-02T10:00:00.000Z",
          has_liked: true,
        },
        {
          ...secondRoute,
          created_at: "2026-01-31T10:00:00.000Z",
          updated_at: "2026-02-01T10:00:00.000Z",
          has_liked: false,
        },
      ],
      nextCursor: "2026-01-31T10:00:00.000Z_33333333-3333-4333-8333-333333333333",
    });
  });

  it("rejects unknown list input keys at the boundary", async () => {
    const db = {
      select: vi.fn(),
    };

    const caller = createCaller(db);

    await expect(
      caller.list({ limit: 2, activityCategory: "bike", unexpected: true } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
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

  it("gets a single owned route with like state", async () => {
    const route = createRouteRow();
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => createSelectWithLimit([{ id: "like-id" }])),
    };

    const caller = createCaller(db);
    const result = await caller.get({ id: ROUTE_ID });

    expect(result).toEqual({
      ...route,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
      has_liked: true,
    });
  });

  it("loads full route coordinates from stored GPX content", async () => {
    const route = createRouteRow();
    const fileData = {
      text: vi.fn().mockResolvedValue("<gpx>route</gpx>"),
    };
    mockStorage.download.mockResolvedValue({ error: null, data: fileData });

    const db = {
      select: vi.fn().mockImplementationOnce(() => createSelectWithLimit([route])),
    };

    const caller = createCaller(db);
    const result = await caller.loadFull({ id: ROUTE_ID });

    expect(mockStorage.download).toHaveBeenCalledWith(`${OWNER_ID}/route.gpx`);
    expect(fileData.text).toHaveBeenCalled();
    expect(mockRouteParser.parseRoute).toHaveBeenCalledWith("<gpx>route</gpx>", "gpx");
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
      activityCategory: "bike",
    });
  });

  it("rejects invalid parsed coordinates from stored route files", async () => {
    const route = createRouteRow();
    const fileData = {
      text: vi.fn().mockResolvedValue("<gpx>route</gpx>"),
    };

    mockStorage.download.mockResolvedValue({ error: null, data: fileData });
    mockRouteParser.parseRoute.mockReturnValue({
      coordinates: [{ latitude: 40.1, longitude: -74.1, altitude: Number.NaN }],
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

  it("uploads a parsed route, stores the file, and persists derived metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_706_000_000_000);

    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      file_path: `${OWNER_ID}/1706000000000.gpx`,
      total_distance: 1000,
      total_ascent: 40,
      total_descent: 35,
      polyline: "encoded-polyline",
      elevation_polyline: "encoded-elevation",
    });

    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([insertedRoute]),
        })),
      })),
    };

    const caller = createCaller(db);
    const result = await caller.upload({
      name: "New Route",
      description: "Uploaded from file",
      activityCategory: "bike",
      fileContent: "<gpx>upload</gpx>",
      fileName: "new-route.gpx",
      source: "gpx-import",
    });

    expect(mockRouteParser.validateRoute).toHaveBeenCalled();
    expect(mockCore.calculateRouteStats).toHaveBeenCalled();
    expect(mockStorage.upload).toHaveBeenCalledWith(
      `${OWNER_ID}/1706000000000.gpx`,
      "<gpx>upload</gpx>",
      {
        contentType: "application/gpx+xml",
        upsert: false,
      },
    );
    expect(result).toEqual({
      ...insertedRoute,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });
  });

  it("deletes an unused route and removes its stored file", async () => {
    const route = createRouteRow();
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
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
    };

    const caller = createCaller(db);
    const result = await caller.delete({ id: ROUTE_ID });

    expect(result).toEqual({ success: true });
    expect(mockStorage.remove).toHaveBeenCalledWith([`${OWNER_ID}/route.gpx`]);
  });

  it("updates owned route metadata and returns serialized timestamps", async () => {
    const updatedRoute = createRouteRow({
      id: UPDATED_ROUTE_ID,
      name: "Updated Route",
      description: "Fresh description",
    });
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([{ id: UPDATED_ROUTE_ID }])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([updatedRoute]),
          })),
        })),
      })),
    };

    const caller = createCaller(db);
    const result = await caller.update({
      id: UPDATED_ROUTE_ID,
      name: "Updated Route",
      description: "Fresh description",
    });

    expect(result).toEqual({
      ...updatedRoute,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });
  });
});
