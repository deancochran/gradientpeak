import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roster: vi.fn(),
  assignments: vi.fn(),
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
        coachingAssignments: { list: mocks.assignments },
        lifecycle: { adminRoster: { list: mocks.roster } },
      },
    }),
  },
}));

import { loadOrganizationAssignmentDirectory } from "./assignment-directory-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const engagementId = "22222222-2222-4222-8222-222222222222";
const coachMembershipId = "33333333-3333-4333-8333-333333333333";

describe("assignment directory server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "profile" } });
    mocks.context.mockResolvedValue({});
    mocks.roster.mockResolvedValue({
      items: [
        {
          engagementId,
          identity: { profileId: "profile-athlete", displayName: "Alex Athlete", username: "alex" },
          status: "active",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    mocks.assignments.mockResolvedValue({
      items: [
        {
          assignmentId: "44444444-4444-4444-8444-444444444444",
          coachMembershipId,
          assignmentKind: "primary",
          assignedAt: new Date("2026-11-08T00:00:00.000Z"),
          coachIdentity: {
            displayName: "Casey Coach",
            username: "casey",
            membershipStatus: "active",
          },
        },
      ],
      stateDigest: "a".repeat(64),
    });
  });

  it("uses authorized roster, staff, and per-engagement assignment reads to label direct responsibility", async () => {
    await expect(
      loadOrganizationAssignmentDirectory({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toMatchObject({
      status: "granted",
      items: [
        {
          engagementId,
          assignments: [{ assignmentKind: "primary", coachName: "Casey Coach" }],
        },
      ],
    });
    expect(mocks.roster).toHaveBeenCalledWith({
      organizationId,
      limit: 20,
      cursor: null,
      engagementStatus: null,
      withoutPrimaryAssignment: false,
    });
    expect(mocks.assignments).toHaveBeenCalledWith({ organizationId, engagementId });
  });

  it("fails closed if any authoritative assignment read is denied", async () => {
    mocks.assignments.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(
      loadOrganizationAssignmentDirectory({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("uses assignment identity beyond the first staff roster page instead of a generic fallback", async () => {
    mocks.assignments.mockResolvedValueOnce({
      items: [
        {
          assignmentId: "44444444-4444-4444-8444-444444444444",
          coachMembershipId,
          assignmentKind: "primary",
          assignedAt: new Date("2026-11-08T00:00:00.000Z"),
          coachIdentity: {
            displayName: "Coach Fifty One",
            username: "coach-51",
            membershipStatus: "active",
          },
        },
      ],
      stateDigest: "a".repeat(64),
    });
    await expect(
      loadOrganizationAssignmentDirectory({ data: { organizationId, limit: 20, cursor: null } }),
    ).resolves.toMatchObject({
      items: [{ assignments: [{ coachName: "Coach Fifty One" }] }],
    });
  });

  it("forwards the primary-gap and engagement-status filters to the authorized roster read", async () => {
    await loadOrganizationAssignmentDirectory({
      data: {
        organizationId,
        limit: 20,
        cursor: null,
        engagementStatus: "active",
        withoutPrimaryAssignment: true,
      },
    });
    expect(mocks.roster).toHaveBeenCalledWith({
      organizationId,
      limit: 20,
      cursor: null,
      engagementStatus: "active",
      withoutPrimaryAssignment: true,
    });
  });
});
