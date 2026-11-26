import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { afterEach, expect, it, vi } from "vitest";
import { createApiClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("delivers primary data without waiting for a slow optional query in the same batch", async () => {
  let finishSecondary: () => void = () => undefined;
  const secondary = new Promise<void>((resolve) => {
    finishSecondary = resolve;
  });
  const t = initTRPC.create({ transformer: superjson });
  const router = t.router({
    profiles: t.router({ get: t.procedure.query(() => ({ id: "primary" })) }),
    goals: t.router({
      getById: t.procedure.query(async () => {
        await secondary;
        return { id: "secondary" };
      }),
    }),
  });
  const transport = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request(input, init),
      router,
      createContext: () => ({}),
    }),
  );
  vi.stubGlobal("fetch", transport);
  const client = createApiClient();
  let secondaryFinished = false;
  const slow = client.goals.getById.query({ id: "secondary" }).then(() => {
    secondaryFinished = true;
  });
  const fast = client.profiles.get.query();
  try {
    const result = await Promise.race([
      fast,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Primary blocked by secondary batch member")), 1000),
      ),
    ]);
    expect(result).toEqual({ id: "primary" });
    expect(secondaryFinished).toBe(false);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0]?.[0])).toContain("goals.getById,profiles.get");
  } finally {
    finishSecondary();
    await Promise.all([slow, fast]);
  }
});
