import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: new Headers(),
  resolveSession: vi.fn(),
  contexts: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({ getRequestHeaders: () => mocks.headers }));
vi.mock("@repo/db/client", () => ({ db: {} }));
vi.mock("@repo/auth/server", () => ({ resolveAuthSessionFromHeaders: mocks.resolveSession }));
vi.mock("../contract-epoch-middleware", () => ({ getServerActionTrpcSource: () => "server" }));
vi.mock("@repo/api/server", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC.context<{ auth: { session: { user: { id: string } } | null } }>().create();
  return {
    createApiContext: mocks.contexts.mockImplementation(async (context) => context),
    appRouter: t.router({
      profiles: t.router({
        get: t.procedure.query(({ ctx }) => {
          if (!ctx.auth.session) throw new TRPCError({ code: "UNAUTHORIZED" });
          return { owner: ctx.auth.session.user.id };
        }),
      }),
    }),
  };
});

import { createServerApiClient } from "./server-client.server";

describe("SSR local API transport", () => {
  it("uses trusted request headers and isolates user context between routers", async () => {
    mocks.contexts.mockClear();
    mocks.resolveSession.mockImplementation(async (headers: Headers) => ({
      user: { id: headers.get("x-test-user") },
    }));
    const first = createServerApiClient();
    const second = createServerApiClient();
    mocks.headers = new Headers({ "x-test-user": "first" });
    expect(await first.profiles.get.query()).toEqual({ owner: "first" });
    mocks.headers = new Headers({ "x-test-user": "second" });
    expect(await second.profiles.get.query()).toEqual({ owner: "second" });
    expect(await first.profiles.get.query()).toEqual({ owner: "first" });
    expect(mocks.contexts).toHaveBeenCalledTimes(2);
  });

  it("preserves procedure authorization for anonymous SSR requests", async () => {
    mocks.resolveSession.mockResolvedValue(null);
    await expect(createServerApiClient().profiles.get.query()).rejects.toMatchObject({
      data: { code: "UNAUTHORIZED" },
    });
  });
});
