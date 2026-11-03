import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ cookie: "session=test" }),
  db: { name: "test-db" },
  resolveAuthSessionFromHeaders: vi.fn(),
  createApiContext: vi.fn(),
  listStaff: vi.fn(),
  endMembership: vi.fn(),
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
        lifecycle: { staff: { list: mocks.listStaff }, endMembership: mocks.endMembership },
      },
    }),
  },
}));

import { endOrganizationStaffMembership, loadOrganizationStaff } from "./staff-server-functions";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "22222222-2222-4222-8222-222222222222";
const CORRELATION_ID = "33333333-3333-4333-8333-333333333333";

describe("staff server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionFromHeaders.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.createApiContext.mockResolvedValue({ session: { user: { id: "profile-1" } } });
    mocks.listStaff.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.endMembership.mockResolvedValue({ membershipId: MEMBERSHIP_ID, status: "ended" });
  });

  it("uses the request-bound authenticated API caller for the requested organization page", async () => {
    await expect(
      loadOrganizationStaff({ data: { organizationId: ORGANIZATION_ID, limit: 20, cursor: null } }),
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
      limit: 20,
      cursor: null,
    });
  });

  it("fails closed when the authoritative roster read loses access", async () => {
    mocks.listStaff.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(
      loadOrganizationStaff({ data: { organizationId: ORGANIZATION_ID, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("fails closed for an expired or revoked session instead of exposing a roster error", async () => {
    mocks.listStaff.mockRejectedValue(
      Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }),
    );
    await expect(
      loadOrganizationStaff({ data: { organizationId: ORGANIZATION_ID, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("validates command payloads before building an authenticated context", async () => {
    await expect(
      endOrganizationStaffMembership({
        data: {
          organizationId: ORGANIZATION_ID,
          membershipId: MEMBERSHIP_ID,
          reason: "other",
          correlationId: CORRELATION_ID,
        } as never,
      }),
    ).rejects.toThrow();
    expect(mocks.createApiContext).not.toHaveBeenCalled();
  });

  it("passes the stable terminal-operation correlation id to the API authority", async () => {
    await endOrganizationStaffMembership({
      data: {
        organizationId: ORGANIZATION_ID,
        membershipId: MEMBERSHIP_ID,
        reason: "staff_departure",
        correlationId: CORRELATION_ID,
      },
    });
    expect(mocks.endMembership).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      membershipId: MEMBERSHIP_ID,
      reason: "staff_departure",
      correlationId: CORRELATION_ID,
    });
    expect((loadOrganizationStaff as unknown as { method: string }).method).toBe("POST");
    expect((endOrganizationStaffMembership as unknown as { method: string }).method).toBe("POST");
  });

  it("returns access-lost for an expired command session rather than an uncertain retry", async () => {
    mocks.endMembership.mockRejectedValue(
      Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }),
    );
    await expect(
      endOrganizationStaffMembership({
        data: {
          organizationId: ORGANIZATION_ID,
          membershipId: MEMBERSHIP_ID,
          reason: "staff_departure",
          correlationId: CORRELATION_ID,
        },
      }),
    ).resolves.toEqual({ status: "access_lost" });
  });
});
