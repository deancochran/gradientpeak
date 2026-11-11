import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  archive: vi.fn(),
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
          list: mocks.list,
          get: mocks.get,
          create: mocks.create,
          archive: mocks.archive,
        },
      },
    }),
  },
  createApiContext: mocks.createApiContext,
}));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolveSession }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import {
  archiveOrganizationGroup,
  createOrganizationGroup,
  loadOrganizationGroup,
  loadOrganizationGroups,
} from "./organization-groups-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
describe("organization group server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSession.mockResolvedValue({ user: { id: "profile" } });
    mocks.createApiContext.mockResolvedValue({});
    mocks.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });
    mocks.get.mockResolvedValue({
      id: groupId,
      name: "Tempo",
      description: null,
      createdAt: new Date(),
    });
    mocks.create.mockResolvedValue({ id: groupId, status: "created" });
    mocks.archive.mockResolvedValue({ id: groupId, status: "archived" });
  });
  it("binds list reads to the explicit tenant and current session", async () => {
    await loadOrganizationGroups({ data: { organizationId, limit: 20, cursor: null } });
    expect(mocks.list).toHaveBeenCalledWith({ organizationId, limit: 20, cursor: null });
    expect(mocks.createApiContext).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "profile" } } },
      db: mocks.db,
    });
  });
  it("rejects injected scope and malformed commands before the API", async () => {
    await expect(
      loadOrganizationGroups({
        data: { organizationId, limit: 20, cursor: null, profileId: "x" } as never,
      }),
    ).rejects.toThrow();
    await expect(
      createOrganizationGroup({ data: { organizationId, groupId, name: " ", description: null } }),
    ).rejects.toThrow();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("passes stable create and archive identifiers without inventing an actor scope", async () => {
    await createOrganizationGroup({
      data: { organizationId, groupId, name: "Tempo", description: "Tuesday" },
    });
    await archiveOrganizationGroup({ data: { organizationId, groupId } });
    expect(mocks.create).toHaveBeenCalledWith({
      organizationId,
      groupId,
      name: "Tempo",
      description: "Tuesday",
    });
    expect(mocks.archive).toHaveBeenCalledWith({ organizationId, groupId });
  });
  it("fails closed for auth loss on reads and writes", async () => {
    mocks.get.mockRejectedValue(Object.assign(new Error("expired"), { code: "UNAUTHORIZED" }));
    mocks.archive.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(loadOrganizationGroup({ data: { organizationId, groupId } })).resolves.toEqual({
      status: "forbidden",
    });
    await expect(archiveOrganizationGroup({ data: { organizationId, groupId } })).resolves.toEqual({
      status: "forbidden",
    });
  });
});
