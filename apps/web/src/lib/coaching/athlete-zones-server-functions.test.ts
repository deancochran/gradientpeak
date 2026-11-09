import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  zones: vi.fn(),
  session: vi.fn(),
  context: vi.fn(),
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
    createCaller: () => ({ athleteIntelligence: { getCoachAthleteBikeZones: mocks.zones } }),
  },
  createApiContext: mocks.context,
}));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.session }));
vi.mock("@repo/db/client", () => ({ db: mocks.db }));

import { loadCoachAthleteBikeZones } from "./athlete-zones-server-functions";

const input = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  athleteProfileId: "22222222-2222-4222-8222-222222222222",
};
describe("loadCoachAthleteBikeZones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "request-actor" } });
    mocks.context.mockResolvedValue({});
    mocks.zones.mockResolvedValue({ sport: "bike" });
  });
  it("forwards only explicit organization and athlete IDs with the request session", async () => {
    await loadCoachAthleteBikeZones({ data: input });
    expect(mocks.zones).toHaveBeenCalledWith(input);
    expect(mocks.context).toHaveBeenCalledWith({
      headers: mocks.headers,
      auth: { session: { user: { id: "request-actor" } } },
      db: mocks.db,
    });
    await expect(
      loadCoachAthleteBikeZones({ data: { ...input, actorId: "injected" } as never }),
    ).rejects.toThrow();
  });
  it.each(["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"])("fails closed for %s", async (code) => {
    mocks.zones.mockRejectedValue(Object.assign(new Error(code), { code }));
    await expect(loadCoachAthleteBikeZones({ data: input })).resolves.toEqual({
      status: "forbidden",
    });
  });
  it("rethrows unexpected errors", async () => {
    mocks.zones.mockRejectedValue(new Error("upstream"));
    await expect(loadCoachAthleteBikeZones({ data: input })).rejects.toThrow("upstream");
  });
});
