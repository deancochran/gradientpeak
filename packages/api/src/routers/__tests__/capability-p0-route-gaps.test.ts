import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const ROUTE_ID = "22222222-2222-4222-8222-222222222222";

const storageRemove = vi.hoisted(() => vi.fn());
vi.mock("../../storage-service", () => ({
  getApiStorageService: () => ({
    storage: { from: () => ({ remove: storageRemove }) },
  }),
}));
vi.mock("../../lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { routesRouter } from "../routes";

function selectChain(result: unknown) {
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

function route() {
  return {
    id: ROUTE_ID,
    profile_id: OWNER_ID,
    name: "River Loop",
    description: null,
    file_path: `${OWNER_ID}/river-loop.gpx`,
    storage_state: "ready",
    total_distance: 1000,
    total_ascent: 20,
    total_descent: 18,
    polyline: "encoded",
    elevation_polyline: "encoded-elevation",
    is_system_template: false,
    is_public: false,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function caller(db: Record<string, unknown>) {
  const context = {
    db: {
      ...db,
      transaction: vi.fn(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db)),
    },
    session: { user: { id: OWNER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  };
  return routesRouter.createCaller(context as never);
}

describe("P0 route capability API boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageRemove.mockResolvedValue({ error: null });
  });

  it("deletes an owned unused route, removes its stored file, and returns a stable result", async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ ...route(), storage_state: "deletion_pending" }]),
        })),
      })),
    }));
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => selectChain([route()]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        })),
      update,
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: ROUTE_ID }]) })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    };

    await expect(caller(db).delete({ id: ROUTE_ID })).resolves.toEqual({ success: true });
    expect(storageRemove).toHaveBeenCalledWith([`${OWNER_ID}/river-loop.gpx`]);
    expect(db.delete).toHaveBeenCalledTimes(3);
  });

  it("rejects deletion when the route is still linked to events before touching storage", async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => selectChain([route()]))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 1 }]) })),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ value: 0 }]) })),
        })),
      delete: vi.fn(),
    };

    await expect(caller(db).delete({ id: ROUTE_ID })).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("used by 1 event"),
    });
    expect(storageRemove).not.toHaveBeenCalled();
  });
});
