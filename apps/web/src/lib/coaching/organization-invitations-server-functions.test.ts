import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers({ cookie: "session=test" }),
  db: { name: "test-db" },
  resolve: vi.fn(),
  context: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  capabilities: vi.fn(),
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
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolve }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));
vi.mock("@repo/api/server", () => ({
  createApiContext: mocks.context,
  appRouter: {
    createCaller: () => ({
      organizations: {
        managementCapabilities: mocks.capabilities,
        invitations: {
          listForOrganization: mocks.list,
          create: mocks.create,
          revoke: mocks.revoke,
        },
      },
    }),
  },
}));

import {
  createOrganizationInvitation,
  loadOrganizationInvitations,
  revokeOrganizationInvitation,
} from "./organization-invitations-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const invitationId = "22222222-2222-4222-8222-222222222222";

describe("organization invitation server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ user: { id: "profile-1" } });
    mocks.context.mockResolvedValue({});
    mocks.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.capabilities.mockResolvedValue({ status: "granted", isRootOwner: false, operations: [] });
    mocks.create.mockResolvedValue({
      invitationId,
      token: "token",
      createdAt: new Date(),
      expiresAt: new Date(),
    });
    mocks.revoke.mockResolvedValue({ invitationId, status: "revoked" });
  });
  it("uses the request session to load a bounded organization page", async () => {
    await expect(
      loadOrganizationInvitations({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toEqual({
      status: "granted",
      canInviteAdministrators: false,
      page: { items: [], nextCursor: null, hasMore: false },
    });
    expect(mocks.list).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
  });
  it("rejects ambiguous recipient payloads before creating an authenticated caller", async () => {
    await expect(
      createOrganizationInvitation({
        data: {
          organizationId,
          kind: "staff",
          requestedRole: "coach",
          recipientProfileId: null,
          recipientEmail: null,
          expiresAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("rejects both recipients, invalid recipients, role-kind mismatches, and extra keys before the caller", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    const invalidInputs = [
      {
        organizationId,
        kind: "staff",
        requestedRole: "coach",
        recipientProfileId: "33333333-3333-4333-8333-333333333333",
        recipientEmail: "both@example.test",
        expiresAt,
      },
      {
        organizationId,
        kind: "staff",
        requestedRole: "coach",
        recipientProfileId: null,
        recipientEmail: "not-an-email",
        expiresAt,
      },
      {
        organizationId,
        kind: "athlete",
        requestedRole: "coach",
        recipientProfileId: null,
        recipientEmail: "athlete@example.test",
        expiresAt,
      },
      {
        organizationId,
        kind: "athlete",
        requestedRole: null,
        recipientProfileId: null,
        recipientEmail: "athlete@example.test",
        expiresAt,
        unexpected: true,
      },
    ];
    for (const data of invalidInputs)
      await expect(createOrganizationInvitation({ data })).rejects.toThrow();
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it.each([
    { kind: "staff" as const, requestedRole: "coach" as const },
    { kind: "athlete" as const, requestedRole: null },
  ])("accepts a valid $kind profile recipient through the strict validator", async (variant) => {
    const data = {
      organizationId,
      ...variant,
      recipientProfileId: "33333333-3333-4333-8333-333333333333",
      recipientEmail: null,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    };
    await createOrganizationInvitation({ data });
    expect(mocks.context).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(data);
  });
  it("preserves the role/null discriminant and returns a token only from creation", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    await createOrganizationInvitation({
      data: {
        organizationId,
        kind: "athlete",
        requestedRole: null,
        recipientProfileId: null,
        recipientEmail: "athlete@example.test",
        expiresAt,
      },
    });
    expect(mocks.create).toHaveBeenCalledWith({
      organizationId,
      kind: "athlete",
      requestedRole: null,
      recipientProfileId: null,
      recipientEmail: "athlete@example.test",
      expiresAt,
    });
  });
  it("fails closed on lost read and mutation access", async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error("lost"), { code: "FORBIDDEN" }));
    mocks.revoke.mockRejectedValue(Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }));
    await expect(
      loadOrganizationInvitations({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      revokeOrganizationInvitation({ data: { organizationId, invitationId } }),
    ).resolves.toEqual({ status: "access_lost" });
  });
});
