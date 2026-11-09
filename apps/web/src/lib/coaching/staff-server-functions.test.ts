import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ cookie: "session=test" }),
  db: { name: "test-db" },
  resolveAuthSessionFromHeaders: vi.fn(),
  createApiContext: vi.fn(),
  listStaff: vi.fn(),
  offboardingImpact: vi.fn(),
  suspendMembership: vi.fn(),
  resumeMembership: vi.fn(),
  grantRole: vi.fn(),
  revokeRole: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => ({
    validator: (validate: (input: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
        Object.assign(async ({ data }: { data: unknown }) => handler({ data: validate(data) }), {
          method,
        }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/auth/server", () => ({
  resolveAuthSessionFromHeaders: mocks.resolveAuthSessionFromHeaders,
}));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));
vi.mock("@repo/api/server", () => ({
  createApiContext: mocks.createApiContext,
  appRouter: {
    createCaller: () => ({
      organizations: {
        lifecycle: {
          staff: { list: mocks.listStaff, offboardingImpact: mocks.offboardingImpact },
          suspendMembership: mocks.suspendMembership,
          resumeMembership: mocks.resumeMembership,
        },
        staffRoles: { grant: mocks.grantRole, revoke: mocks.revokeRole },
      },
    }),
  },
}));

import {
  grantOrganizationStaffRole,
  loadOrganizationStaff,
  loadOrganizationStaffOffboardingImpact,
  revokeOrganizationStaffRole,
  suspendOrganizationStaffMembership,
} from "./staff-server-functions";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "22222222-2222-4222-8222-222222222222";
const CORRELATION_ID = "33333333-3333-4333-8333-333333333333";

describe("staff server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.listStaff.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.offboardingImpact.mockResolvedValue({
      target: { membershipId: MEMBERSHIP_ID },
      assignedAthleteCount: 0,
      assignedAthletes: [],
      nextCursor: null,
      hasMore: false,
      resourceInventory: { status: "unavailable" },
    });
    mocks.suspendMembership.mockResolvedValue({
      membershipId: MEMBERSHIP_ID,
      operationId: CORRELATION_ID,
      status: "suspended",
    });
    mocks.grantRole.mockResolvedValue({
      membershipId: MEMBERSHIP_ID,
      role: "coach",
      status: "granted",
    });
  });

  it("uses the request-bound authenticated API caller for the requested organization page", async () => {
    await expect(
      loadOrganizationStaff({
        data: { organizationId: ORGANIZATION_ID, status: "active", limit: 20, cursor: null },
      }),
    ).resolves.toEqual({
      status: "granted",
      page: { items: [], nextCursor: null, hasMore: false },
    });
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "profile-1" } } },
      db: mocks.db,
    });
    expect(mocks.listStaff).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      status: "active",
      limit: 20,
      cursor: null,
    });
  });

  it("fails closed when the authoritative roster read loses access", async () => {
    mocks.listStaff.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(
      loadOrganizationStaff({
        data: { organizationId: ORGANIZATION_ID, status: "active", limit: 20, cursor: null },
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("fails closed for an expired or revoked session instead of exposing a roster error", async () => {
    mocks.listStaff.mockRejectedValue(
      Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }),
    );
    await expect(
      loadOrganizationStaff({
        data: { organizationId: ORGANIZATION_ID, status: "active", limit: 20, cursor: null },
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("binds the read-only offboarding impact preview to the requested organization and membership", async () => {
    await expect(
      loadOrganizationStaffOffboardingImpact({
        data: {
          organizationId: ORGANIZATION_ID,
          membershipId: MEMBERSHIP_ID,
          limit: 20,
          cursor: null,
        },
      }),
    ).resolves.toMatchObject({ status: "granted", impact: { assignedAthleteCount: 0 } });
    expect(mocks.offboardingImpact).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      membershipId: MEMBERSHIP_ID,
      limit: 20,
      cursor: null,
    });
  });

  it("fails closed when preview authorization changes", async () => {
    mocks.offboardingImpact.mockRejectedValue(
      Object.assign(new Error("revoked"), { code: "FORBIDDEN" }),
    );
    await expect(
      loadOrganizationStaffOffboardingImpact({
        data: {
          organizationId: ORGANIZATION_ID,
          membershipId: MEMBERSHIP_ID,
          limit: 20,
          cursor: null,
        },
      }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("forwards exact suspension and role commands to authoritative procedures", async () => {
    await suspendOrganizationStaffMembership({
      data: {
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        operationId: CORRELATION_ID,
        reason: "administrative_review",
      },
    });
    await grantOrganizationStaffRole({
      data: {
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        operationId: CORRELATION_ID,
        role: "coach",
      },
    });
    expect(mocks.suspendMembership).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      membershipId: MEMBERSHIP_ID,
      operationId: CORRELATION_ID,
      reason: "administrative_review",
    });
    expect(mocks.grantRole).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      membershipId: MEMBERSHIP_ID,
      operationId: CORRELATION_ID,
      role: "coach",
    });
    await expect(
      revokeOrganizationStaffRole({
        data: {
          organizationId: ORGANIZATION_ID,
          membershipId: MEMBERSHIP_ID,
          operationId: CORRELATION_ID,
          role: "other",
        } as never,
      }),
    ).rejects.toThrow();
  });
});
