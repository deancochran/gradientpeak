import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coachingAccess: vi.fn(),
  listMine: vi.fn(),
  createApiContext: vi.fn(),
  resolveAuthSessionFromHeaders: vi.fn(),
  headers: new Headers({ cookie: "session=test" }),
  db: { name: "test-db" },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler:
        (handler: (input: { data: unknown }) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => mocks.headers,
}));

vi.mock("@repo/api/server", () => ({
  appRouter: {
    createCaller: () => ({
      organizations: { coachingAccess: mocks.coachingAccess, listMine: mocks.listMine },
    }),
  },
  createApiContext: mocks.createApiContext,
}));

vi.mock("@repo/auth/server", () => ({
  resolveAuthSessionFromHeaders: mocks.resolveAuthSessionFromHeaders,
}));

vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import { loadMyOrganizations, loadOrganizationCoachingAccess } from "./server-functions";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

describe("loadOrganizationCoachingAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.coachingAccess.mockResolvedValue({ status: "forbidden" });
    mocks.listMine.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  });

  it("resolves the request session and calls the protected API with a complete DB context", async () => {
    await expect(
      loadOrganizationCoachingAccess({ data: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toEqual({ status: "forbidden" });

    expect(mocks.resolveAuthSessionFromHeaders).toHaveBeenCalledWith(mocks.headers);
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "profile-1" } } },
      db: mocks.db,
    });
    expect(mocks.coachingAccess).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it("rejects malformed or additional route input before creating an API context", async () => {
    await expect(
      loadOrganizationCoachingAccess({
        data: { organizationId: "not-a-uuid", profileId: "attacker" } as never,
      }),
    ).rejects.toThrow();

    expect(mocks.createApiContext).not.toHaveBeenCalled();
    expect(mocks.coachingAccess).not.toHaveBeenCalled();
  });
});

describe("loadMyOrganizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.listMine.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  });

  it("binds the request session and DB context before listing the requested page", async () => {
    await expect(
      loadMyOrganizations({ data: { limit: 20, cursor: "next-page" } }),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    expect(mocks.resolveAuthSessionFromHeaders).toHaveBeenCalledWith(mocks.headers);
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "profile-1" } } },
      db: mocks.db,
    });
    expect(mocks.listMine).toHaveBeenCalledWith({ limit: 20, cursor: "next-page" });
  });

  it("rejects invalid, incomplete, and additional inputs before creating an API context", async () => {
    await expect(
      loadMyOrganizations({ data: { limit: 51, cursor: null, profileId: "attacker" } as never }),
    ).rejects.toThrow();
    await expect(
      loadMyOrganizations({ data: { limit: 20, cursor: null, profileId: "attacker" } as never }),
    ).rejects.toThrow();
    await expect(loadMyOrganizations({ data: { limit: 20 } as never })).rejects.toThrow();

    expect(mocks.createApiContext).not.toHaveBeenCalled();
    expect(mocks.listMine).not.toHaveBeenCalled();
  });
});
