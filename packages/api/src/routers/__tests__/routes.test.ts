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
  parseRouteWithFormat: vi.fn(),
  validateRoute: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({ error: vi.fn() }));

const mockCore = vi.hoisted(() => ({
  calculateRouteStats: vi.fn(),
  simplifyCoordinates: vi.fn(),
  encodePolyline: vi.fn(),
  encodeElevationPolyline: vi.fn(),
}));

const mockRandomUUID = vi.hoisted(() => vi.fn(() => UPLOADED_ROUTE_ID));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();

  return {
    ...actual,
    randomUUID: mockRandomUUID,
  };
});

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
    profile_id: OWNER_ID,
    name: "River Loop",
    description: "Steady weekend route",
    file_path: `${OWNER_ID}/route.gpx`,
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
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.upload.mockResolvedValue({ error: null });
  mockStorage.download.mockResolvedValue({ error: null, data: null });
  mockStorage.remove.mockResolvedValue({ error: null });
  mockRandomUUID.mockReturnValue(UPLOADED_ROUTE_ID);
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
      nextCursor: "2026-01-31T10:00:00.000Z_33333333-3333-4333-8333-333333333333",
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
      is_public: true,
      is_system_template: true,
    });
    const fileData = {
      text: vi.fn().mockResolvedValue("<gpx>route</gpx>"),
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
      is_public: false,
      is_system_template: false,
    });
    const fileData = {
      text: vi.fn().mockResolvedValue("<gpx>route</gpx>"),
    };
    mockStorage.download.mockResolvedValue({ error: null, data: fileData });

    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => createSelectWithLimit([route]))
        .mockImplementationOnce(() => createSelectWithLimit([route]))
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
    const route = createRouteRow();
    const fileData = {
      text: vi.fn().mockResolvedValue("<gpx>route</gpx>"),
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

  it("uploads a parsed route, stores the file, and persists derived metadata", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
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
        upsert: false,
      },
    );
    expect(result).toEqual({
      ...insertedRoute,
      created_at: "2026-02-01T10:00:00.000Z",
      updated_at: "2026-02-02T10:00:00.000Z",
    });
  });

  it("uploads TCX routes through the TCX parser and stores TCX content type", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
    });

    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([insertedRoute]),
        })),
      })),
    };

    const caller = createCaller(db);
    await caller.upload({
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
        upsert: false,
      },
    );
  });

  it("canonicalizes XML uploads from their sniffed route format", async () => {
    const insertedRoute = createRouteRow({
      id: UPLOADED_ROUTE_ID,
      file_path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.tcx`,
    });
    const values = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([insertedRoute]) }));
    const db = {
      insert: vi.fn(() => ({
        values,
      })),
    };
    const content = "<TrainingCenterDatabase />";

    await createCaller(db).upload({
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
        upsert: false,
      },
    );
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("rejects oversize UTF-8 content before parsing or storage", async () => {
    const caller = createCaller({ insert: vi.fn() });
    const oversize = `é${"a".repeat(10_485_759)}`;

    await expect(
      caller.upload({ name: "Too large", fileContent: oversize, fileName: "route.gpx" }),
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
      caller.upload({ name: "Unsafe", fileContent: "<gpx />", fileName: "../route.gpx" }),
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
        name: "Broken",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Invalid route file" });
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });

  it("removes the uploaded file and hides database details when persistence fails", async () => {
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockRejectedValue(new Error("secret db detail")),
        })),
      })),
    };

    await expect(
      createCaller(db).upload({
        name: "Cleanup",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save route" });
    expect(mockStorage.remove).toHaveBeenCalledOnce();
  });

  it("uses the route UUID for distinct storage paths and database IDs", async () => {
    mockRandomUUID.mockReturnValueOnce(ROUTE_ID_2).mockReturnValueOnce(UPDATED_ROUTE_ID);
    const values = vi.fn((_row: { id: string }) => ({
      returning: vi.fn().mockResolvedValue([createRouteRow({ id: UPLOADED_ROUTE_ID })]),
    }));
    const db = { insert: vi.fn(() => ({ values })) };
    const input = { name: "Same clock", fileContent: "<gpx />", fileName: "route.gpx" };

    await createCaller(db).upload(input);
    await createCaller(db).upload(input);

    expect(mockStorage.upload.mock.calls.map(([path]) => path)).toEqual([
      `${OWNER_ID}/${ROUTE_ID_2}.gpx`,
      `${OWNER_ID}/${UPDATED_ROUTE_ID}.gpx`,
    ]);
    expect(values.mock.calls.map(([row]) => row.id)).toEqual([ROUTE_ID_2, UPDATED_ROUTE_ID]);
  });

  it("logs a public-safe event when cleanup returns a storage error", async () => {
    mockStorage.remove.mockResolvedValue({ error: { message: "raw provider detail" } });
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockRejectedValue(new Error("db detail")) })),
      })),
    };

    await expect(
      createCaller(db).upload({
        name: "Cleanup",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save route" });
    expect(mockLogger.error).toHaveBeenCalledWith("Route upload cleanup failed", {
      event: "route_upload_cleanup_failed",
      bucket: "gpx-routes",
      path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      correlationId: `route-upload:${UPLOADED_ROUTE_ID}`,
      routeId: UPLOADED_ROUTE_ID,
      failureKind: "storage_error_result",
    });
  });

  it("logs a public-safe event when cleanup throws", async () => {
    mockStorage.remove.mockRejectedValue(new Error("raw provider detail"));
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockRejectedValue(new Error("db detail")) })),
      })),
    };

    await expect(
      createCaller(db).upload({
        name: "Cleanup",
        fileContent: "<gpx />",
        fileName: "route.gpx",
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to save route" });
    expect(mockLogger.error).toHaveBeenCalledWith("Route upload cleanup failed", {
      event: "route_upload_cleanup_failed",
      bucket: "gpx-routes",
      path: `${OWNER_ID}/${UPLOADED_ROUTE_ID}.gpx`,
      correlationId: `route-upload:${UPLOADED_ROUTE_ID}`,
      routeId: UPLOADED_ROUTE_ID,
      failureKind: "storage_exception",
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
