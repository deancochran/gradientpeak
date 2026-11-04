import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coachingAccess: vi.fn(),
  listMine: vi.fn(),
  create: vi.fn(),
  managementCapabilities: vi.fn(),
  listStaff: vi.fn(),
  listAthletes: vi.fn(),
  createApiContext: vi.fn(),
  resolveAuthSessionFromHeaders: vi.fn(),
  headers: new Headers({ cookie: "session=test" }),
  db: { name: "test-db" },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    return {
      validator: (validate: (input: unknown) => unknown) => ({
        handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
          Object.assign(async ({ data }: { data: unknown }) => handler({ data: validate(data) }), {
            method,
          }),
      }),
    };
  },
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => mocks.headers,
}));

vi.mock("@repo/api/server", () => ({
  appRouter: {
    createCaller: () => ({
      organizations: {
        coachingAccess: mocks.coachingAccess,
        listMine: mocks.listMine,
        create: mocks.create,
        managementCapabilities: mocks.managementCapabilities,
        lifecycle: {
          staff: { list: mocks.listStaff },
          adminRoster: { list: mocks.listAthletes },
        },
      },
    }),
  },
  createApiContext: mocks.createApiContext,
}));

vi.mock("@repo/auth/server", () => ({
  resolveAuthSessionFromHeaders: mocks.resolveAuthSessionFromHeaders,
}));

vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import {
  createCoachingOrganization,
  loadMyOrganizations,
  loadOrganizationCoachingAccess,
  loadOrganizationManagementOverview,
} from "./server-functions";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

describe("loadOrganizationCoachingAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.coachingAccess.mockResolvedValue({ status: "forbidden" });
    mocks.listMine.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.managementCapabilities.mockResolvedValue({ status: "forbidden" });
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

  it("uses POST transport for identity-scoped reads so a shared GET cache cannot replay them", () => {
    expect((loadOrganizationCoachingAccess as unknown as { method: string }).method).toBe("POST");
    expect((loadMyOrganizations as unknown as { method: string }).method).toBe("POST");
    expect((loadOrganizationManagementOverview as unknown as { method: string }).method).toBe(
      "POST",
    );
  });
});

describe("organization management server boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.create.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      membershipId: "membership-1",
    });
    mocks.managementCapabilities.mockResolvedValue({
      status: "granted",
      membershipId: "membership-1",
      isRootOwner: false,
      operations: [
        {
          operation: "read_administrative_roster",
          outcome: "eligible",
          requiresFullAthleteAuthorization: false,
        },
      ],
    });
    mocks.listStaff.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.listAthletes.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
  });

  it("creates only a validated organization payload through the request-bound caller", async () => {
    await createCoachingOrganization({
      data: {
        organizationId: ORGANIZATION_ID,
        name: "Summit Coaching",
        slug: "summit-coaching",
        timezone: "UTC",
      },
    });

    expect(mocks.create).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      name: "Summit Coaching",
      slug: "summit-coaching",
      timezone: "UTC",
    });
    await expect(
      createCoachingOrganization({ data: { organizationId: ORGANIZATION_ID, name: "x" } as never }),
    ).rejects.toThrow();
    await expect(
      createCoachingOrganization({
        data: {
          organizationId: ORGANIZATION_ID,
          name: "Summit Coaching",
          slug: "summit-coaching",
          timezone: "Mars/Olympus",
        },
      }),
    ).rejects.toThrow("Timezone must be a valid IANA timezone");
  });

  it("loads staff and roster only after current administrative capability is eligible", async () => {
    await expect(
      loadOrganizationManagementOverview({ data: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toMatchObject({ status: "granted", canReadAdministrativeRoster: true });

    expect(mocks.listStaff).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      limit: 20,
      cursor: null,
    });
    expect(mocks.listAthletes).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      limit: 20,
      cursor: null,
    });
  });

  it("does not request administrative people records after membership access is lost", async () => {
    mocks.managementCapabilities.mockResolvedValue({ status: "forbidden" });

    await expect(
      loadOrganizationManagementOverview({ data: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toEqual({ status: "forbidden" });

    expect(mocks.listStaff).not.toHaveBeenCalled();
    expect(mocks.listAthletes).not.toHaveBeenCalled();
  });

  it("fails closed to the access-lost state when roster authority is revoked after capability evaluation", async () => {
    mocks.listStaff.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));

    await expect(
      loadOrganizationManagementOverview({ data: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toEqual({ status: "forbidden" });
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
