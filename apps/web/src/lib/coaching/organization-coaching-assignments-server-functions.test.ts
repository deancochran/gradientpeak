import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  staff: vi.fn(),
  assign: vi.fn(),
  change: vi.fn(),
  end: vi.fn(),
  context: vi.fn(),
  session: vi.fn(),
  headers: new Headers(),
  db: {},
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => ({
    validator: (validator: (data: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => Promise<unknown>) =>
        Object.assign(({ data }: { data: unknown }) => handler({ data: validator(data) }), {
          method,
        }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.session }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));
vi.mock("@repo/api/server", () => ({
  createApiContext: mocks.context,
  appRouter: {
    createCaller: () => ({
      organizations: {
        coachingAssignments: {
          list: mocks.list,
          assign: mocks.assign,
          change: mocks.change,
          end: mocks.end,
        },
        lifecycle: { staff: { list: mocks.staff } },
      },
    }),
  },
}));

import {
  assignOrganizationCoach,
  loadOrganizationCoachingAssignments,
} from "./organization-coaching-assignments-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111",
  engagementId = "22222222-2222-4222-8222-222222222222",
  coachMembershipId = "33333333-3333-4333-8333-333333333333",
  operationId = "44444444-4444-4444-8444-444444444444",
  digest = "a".repeat(64);
describe("organization coaching assignment server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "profile" } });
    mocks.context.mockResolvedValue({});
    mocks.list.mockResolvedValue({ items: [], stateDigest: digest });
    mocks.staff.mockResolvedValue({
      items: [
        {
          membershipId: coachMembershipId,
          roleKeys: ["coach"],
          identity: { displayName: "Casey Coach", username: "casey" },
        },
        {
          membershipId: "55555555-5555-4555-8555-555555555555",
          roleKeys: ["admin"],
          identity: { displayName: "Admin", username: null },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
  });
  it("reads assignments and filters candidates from the authoritative active staff DTO", async () => {
    await expect(
      loadOrganizationCoachingAssignments({ data: { organizationId, engagementId } }),
    ).resolves.toMatchObject({
      status: "granted",
      candidates: { items: [{ membershipId: coachMembershipId, label: "Casey Coach" }] },
    });
    expect(mocks.staff).toHaveBeenCalledWith({
      organizationId,
      status: "active",
      limit: 50,
      cursor: null,
    });
  });
  it("passes the state digest and operation ID without accepting injected fields", async () => {
    await assignOrganizationCoach({
      data: {
        organizationId,
        engagementId,
        coachMembershipId,
        assignmentKind: "primary",
        operationId,
        expectedStateDigest: digest,
      },
    });
    expect(mocks.assign).toHaveBeenCalledWith({
      organizationId,
      engagementId,
      coachMembershipId,
      assignmentKind: "primary",
      operationId,
      expectedStateDigest: digest,
    });
    expect(() =>
      assignOrganizationCoach({
        data: {
          organizationId,
          engagementId,
          coachMembershipId,
          assignmentKind: "primary",
          operationId,
          expectedStateDigest: digest,
          profileId: "x",
        } as never,
      }),
    ).toThrow();
  });
  it("fails closed when authority is gone", async () => {
    mocks.list.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(
      loadOrganizationCoachingAssignments({ data: { organizationId, engagementId } }),
    ).resolves.toEqual({ status: "forbidden" });
  });
});
