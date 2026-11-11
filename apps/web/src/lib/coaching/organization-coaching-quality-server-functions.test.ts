import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  session: vi.fn(),
  context: vi.fn(),
  headers: new Headers(),
  db: {},
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (validator: (value: unknown) => unknown) => ({
      handler:
        (handler: (input: { data: unknown }) => Promise<unknown>) =>
        ({ data }: { data: unknown }) =>
          handler({ data: validator(data) }),
    }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.session }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));
vi.mock("@repo/api/server", () => ({
  createApiContext: mocks.context,
  appRouter: {
    createCaller: () => ({ organizations: { coachingQuality: { overview: mocks.overview } } }),
  },
}));

import { loadOrganizationCoachingQuality } from "./organization-coaching-quality-server-functions";

const organizationId = "11111111-1111-4111-8111-111111111111";
describe("organization coaching quality server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "actor" } });
    mocks.context.mockResolvedValue({});
    mocks.overview.mockResolvedValue({ scopeKind: "assigned_engagements" });
  });
  it("validates the organization boundary and returns only the authoritative overview", async () => {
    await expect(loadOrganizationCoachingQuality({ data: { organizationId } })).resolves.toEqual({
      status: "granted",
      overview: { scopeKind: "assigned_engagements" },
    });
    expect(mocks.overview).toHaveBeenCalledWith({ organizationId });
    expect(() =>
      loadOrganizationCoachingQuality({
        data: { organizationId, actorProfileId: "injected" } as never,
      }),
    ).toThrow();
  });
  it("maps authorization loss to a data-free forbidden state", async () => {
    mocks.overview.mockRejectedValue(Object.assign(new Error("revoked"), { code: "FORBIDDEN" }));
    await expect(loadOrganizationCoachingQuality({ data: { organizationId } })).resolves.toEqual({
      status: "forbidden",
    });
  });
});
