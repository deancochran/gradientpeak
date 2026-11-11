import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coachingAccess: vi.fn(),
  listMyInvitations: vi.fn(),
  listMine: vi.fn(),
  create: vi.fn(),
  operationalOverview: vi.fn(),
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
        invitations: { listMine: mocks.listMyInvitations },
        create: mocks.create,
        lifecycle: {
          operationalOverview: mocks.operationalOverview,
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
  loadMyPendingOrganizationInvitations,
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
    mocks.listMyInvitations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.operationalOverview.mockResolvedValue({
      activeStaff: 0,
      activeEngagements: 0,
      pausedEngagements: 0,
      activeEngagementsWithoutPrimary: 0,
    });
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
    expect((loadMyPendingOrganizationInvitations as unknown as { method: string }).method).toBe(
      "POST",
    );
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
    mocks.operationalOverview.mockResolvedValue({
      activeStaff: 3,
      activeEngagements: 21,
      pausedEngagements: 2,
      activeEngagementsWithoutPrimary: 4,
    });
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

  it("loads statement-authorized operational totals without roster-page counting", async () => {
    await expect(
      loadOrganizationManagementOverview({ data: { organizationId: ORGANIZATION_ID } }),
    ).resolves.toEqual({
      status: "granted",
      overview: {
        activeStaff: 3,
        activeEngagements: 21,
        pausedEngagements: 2,
        activeEngagementsWithoutPrimary: 4,
      },
    });
    expect(mocks.operationalOverview).toHaveBeenCalledWith({ organizationId: ORGANIZATION_ID });
  });

  it("fails closed when the aggregate statement finds no current administrator", async () => {
    mocks.operationalOverview.mockRejectedValue(
      Object.assign(new Error("revoked"), { code: "FORBIDDEN" }),
    );

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
    mocks.listMyInvitations.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
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

describe("loadMyPendingOrganizationInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
  });

  it("keeps only pending recipient-safe invitations separate from organization memberships", async () => {
    const pending = {
      invitationId: "11111111-1111-4111-8111-111111111111",
      organizationId: ORGANIZATION_ID,
      kind: "staff",
      requestedRole: "coach",
      status: "pending",
      expiresAt: new Date("2030-01-01"),
      createdAt: new Date("2029-01-01"),
    };
    mocks.listMyInvitations.mockResolvedValue({
      items: [
        pending,
        { ...pending, invitationId: "22222222-2222-4222-8222-222222222222", status: "accepted" },
      ],
      nextCursor: null,
      hasMore: false,
    });

    await expect(loadMyPendingOrganizationInvitations({ data: { limit: 20 } })).resolves.toEqual({
      invitations: [pending],
      hasMore: false,
    });
    expect(mocks.listMyInvitations).toHaveBeenCalledWith({ limit: 20, cursor: null });
  });

  it("preserves first-page pagination truth when later invitations exist", async () => {
    mocks.listMyInvitations.mockResolvedValue({
      items: [],
      nextCursor: "next-page",
      hasMore: true,
    });

    await expect(loadMyPendingOrganizationInvitations({ data: { limit: 20 } })).resolves.toEqual({
      invitations: [],
      hasMore: true,
    });
  });

  it("rejects malformed input before reading identity-scoped invitations", async () => {
    await expect(
      loadMyPendingOrganizationInvitations({ data: { limit: 51, cursor: "attacker" } as never }),
    ).rejects.toThrow();
    expect(mocks.createApiContext).not.toHaveBeenCalled();
  });
});
