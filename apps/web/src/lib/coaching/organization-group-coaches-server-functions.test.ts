import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  assign: vi.fn(),
  remove: vi.fn(),
  staff: vi.fn(),
  createApiContext: vi.fn(),
  resolveSession: vi.fn(),
  headers: new Headers(),
  db: {},
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validate: (value: unknown) => unknown) => ({
      handler:
        (handler: (input: { data: unknown }) => Promise<unknown>) =>
        async ({ data }: { data: unknown }) =>
          handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/api/server", () => ({
  appRouter: {
    createCaller: () => ({
      organizations: {
        organizationGroups: {
          get: mocks.get,
          coaches: { list: mocks.list, assign: mocks.assign, remove: mocks.remove },
        },
        lifecycle: { staff: { list: mocks.staff } },
      },
    }),
  },
  createApiContext: mocks.createApiContext,
}));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolveSession }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import {
  assignOrganizationGroupCoach,
  loadOrganizationGroupCoachCandidates,
  loadOrganizationGroupCoaches,
  loadOrganizationGroupCoachLinks,
  removeOrganizationGroupCoach,
} from "./organization-group-coaches-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";

describe("organization group coach server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSession.mockResolvedValue({ user: { id: "profile" } });
    mocks.createApiContext.mockResolvedValue({});
    mocks.get.mockResolvedValue({ id: groupId });
    mocks.list.mockResolvedValue({
      items: [{ id: linkId, membershipId }],
      nextCursor: null,
      hasMore: false,
    });
    mocks.staff.mockResolvedValue({
      items: [
        {
          membershipId,
          identity: { displayName: "Coach Ada", username: "ada" },
          roleKeys: ["coach"],
        },
        {
          membershipId: "55555555-5555-4555-8555-555555555555",
          identity: { displayName: "Administrator", username: "admin" },
          roleKeys: ["admin"],
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    mocks.assign.mockResolvedValue({ id: linkId, status: "active" });
    mocks.remove.mockResolvedValue({ id: linkId, status: "ended" });
  });

  it("independently checks the active group and exposes only effective coach-role candidates", async () => {
    await expect(
      loadOrganizationGroupCoaches({
        data: { organizationId, groupId, limit: 20, linkCursor: null, candidateCursor: null },
      }),
    ).resolves.toEqual({
      status: "granted",
      links: { items: [{ id: linkId, membershipId }], nextCursor: null, hasMore: false },
      candidates: {
        items: [{ membershipId, label: "Coach Ada" }],
        nextCursor: null,
        hasMore: false,
      },
    });
    expect(mocks.get).toHaveBeenCalledWith({ organizationId, groupId });
    expect(mocks.list).toHaveBeenCalledWith({ organizationId, groupId, limit: 20, cursor: null });
    expect(mocks.staff).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
  });

  it("returns one bounded candidate page and leaves the next cursor reachable", async () => {
    const nextMembershipId = "66666666-6666-4666-8666-666666666666";
    mocks.staff.mockResolvedValueOnce({
      items: [
        {
          membershipId: nextMembershipId,
          identity: { displayName: null, username: "later-coach" },
          roleKeys: ["coach"],
        },
      ],
      nextCursor: membershipId,
      hasMore: true,
    });
    await expect(
      loadOrganizationGroupCoaches({
        data: { organizationId, groupId, limit: 20, linkCursor: null, candidateCursor: null },
      }),
    ).resolves.toMatchObject({
      candidates: {
        items: [{ membershipId: nextMembershipId, label: "later-coach" }],
        nextCursor: membershipId,
        hasMore: true,
      },
    });
    expect(mocks.staff).toHaveBeenCalledTimes(1);
    await loadOrganizationGroupCoachCandidates({
      data: { organizationId, groupId, limit: 20, cursor: membershipId },
    });
    await loadOrganizationGroupCoachLinks({
      data: { organizationId, groupId, limit: 20, cursor: linkId },
    });
    expect(mocks.staff).toHaveBeenLastCalledWith({
      organizationId,
      limit: 20,
      cursor: membershipId,
    });
    expect(mocks.list).toHaveBeenLastCalledWith({
      organizationId,
      groupId,
      limit: 20,
      cursor: linkId,
    });
  });

  it("fails closed for group authorization loss and rejects malformed or injected commands", async () => {
    mocks.get.mockRejectedValue(Object.assign(new Error("archived"), { code: "NOT_FOUND" }));
    await expect(
      loadOrganizationGroupCoaches({
        data: { organizationId, groupId, limit: 20, linkCursor: null, candidateCursor: null },
      }),
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      assignOrganizationGroupCoach({
        data: { organizationId, groupId, linkId, membershipId, actorProfileId: "nope" } as never,
      }),
    ).rejects.toThrow();
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it("keeps the stable link and target payload for assign and link-only payload for remove", async () => {
    await assignOrganizationGroupCoach({ data: { organizationId, groupId, linkId, membershipId } });
    await removeOrganizationGroupCoach({ data: { organizationId, groupId, linkId } });
    expect(mocks.assign).toHaveBeenCalledWith({ organizationId, groupId, linkId, membershipId });
    expect(mocks.remove).toHaveBeenCalledWith({ organizationId, groupId, linkId });
  });

  it.each([
    "FORBIDDEN",
    "UNAUTHORIZED",
    "NOT_FOUND",
  ])("maps asynchronous %s assign and remove failures to forbidden", async (code) => {
    mocks.assign.mockRejectedValueOnce(Object.assign(new Error("denied"), { code }));
    mocks.remove.mockRejectedValueOnce(Object.assign(new Error("denied"), { code }));
    await expect(
      assignOrganizationGroupCoach({ data: { organizationId, groupId, linkId, membershipId } }),
    ).resolves.toEqual({ status: "forbidden" });
    await expect(
      removeOrganizationGroupCoach({ data: { organizationId, groupId, linkId } }),
    ).resolves.toEqual({ status: "forbidden" });
  });

  it("rethrows unexpected asynchronous assign and remove failures", async () => {
    mocks.assign.mockRejectedValueOnce(new Error("database unavailable"));
    mocks.remove.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(
      assignOrganizationGroupCoach({ data: { organizationId, groupId, linkId, membershipId } }),
    ).rejects.toThrow("database unavailable");
    await expect(
      removeOrganizationGroupCoach({ data: { organizationId, groupId, linkId } }),
    ).rejects.toThrow("database unavailable");
  });
});
