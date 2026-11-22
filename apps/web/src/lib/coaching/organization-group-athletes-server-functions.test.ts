import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  listLinks: vi.fn(),
  listRoster: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
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
          athletes: { list: mocks.listLinks, add: mocks.add, remove: mocks.remove },
        },
        lifecycle: { adminRoster: { list: mocks.listRoster } },
      },
    }),
  },
  createApiContext: mocks.createApiContext,
}));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolveSession }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import {
  addOrganizationGroupAthlete,
  loadOrganizationGroupAthleteWorkflow,
  removeOrganizationGroupAthlete,
} from "./organization-group-athletes-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const linkId = "33333333-3333-4333-8333-333333333333";
const engagementId = "44444444-4444-4444-8444-444444444444";

describe("organization group athlete server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSession.mockResolvedValue({ user: { id: "actor" } });
    mocks.createApiContext.mockResolvedValue({});
    mocks.get.mockResolvedValue({ id: groupId });
    mocks.listLinks.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.listRoster.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.add.mockResolvedValue({ id: linkId, status: "active" });
    mocks.remove.mockResolvedValue({ id: linkId, status: "ended" });
  });

  it("checks the active group before loading assignment and roster metadata", async () => {
    await loadOrganizationGroupAthleteWorkflow({
      data: { organizationId, groupId, limit: 20, cursor: null },
    });
    expect(mocks.get).toHaveBeenCalledWith({ organizationId, groupId });
    expect(mocks.listLinks).toHaveBeenCalledWith({
      organizationId,
      groupId,
      limit: 20,
      cursor: null,
    });
    expect(mocks.listRoster).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "actor" } } },
      db: mocks.db,
    });
  });

  it("passes only the authoritative link and engagement payloads", async () => {
    await addOrganizationGroupAthlete({ data: { organizationId, groupId, linkId, engagementId } });
    await removeOrganizationGroupAthlete({ data: { organizationId, groupId, linkId } });
    expect(mocks.add).toHaveBeenCalledWith({ organizationId, groupId, linkId, engagementId });
    expect(mocks.remove).toHaveBeenCalledWith({ organizationId, groupId, linkId });
  });

  it("rejects injected actor scope and fails closed after authorization loss", async () => {
    await expect(
      loadOrganizationGroupAthleteWorkflow({
        data: { organizationId, groupId, limit: 20, cursor: null, profileId: "injected" },
      }),
    ).rejects.toThrow();
    mocks.get.mockRejectedValue(Object.assign(new Error("archived"), { code: "NOT_FOUND" }));
    await expect(
      loadOrganizationGroupAthleteWorkflow({
        data: { organizationId, groupId, limit: 20, cursor: null },
      }),
    ).resolves.toEqual({ status: "forbidden" });
    expect(mocks.listLinks).not.toHaveBeenCalled();
    expect(mocks.listRoster).not.toHaveBeenCalled();
  });
});
