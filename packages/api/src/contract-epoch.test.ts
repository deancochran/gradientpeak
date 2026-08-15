import { describe, expect, it } from "vitest";

import { CONTRACT_EPOCH_HEADER, CURRENT_CONTRACT_EPOCH } from "./contract-epoch";
import { appRouter } from "./routers";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "./trpc";

const router = createTRPCRouter({
  publicEndpoint: publicProcedure.query(() => "accepted"),
  protectedEndpoint: protectedProcedure.query(() => "accepted"),
});

function createHttpCaller(headerValue?: string, duplicate = false) {
  const headers = new Headers();
  if (headerValue !== undefined) {
    headers.append(CONTRACT_EPOCH_HEADER, headerValue);
    if (duplicate) headers.append(CONTRACT_EPOCH_HEADER, headerValue);
  }

  return router.createCaller({
    headers,
    session: { user: { id: "user-1" } },
    trpcSource: "http",
  } as never);
}

describe("contract epoch", () => {
  it("pins the current hard-cut epoch", () => {
    expect(CURRENT_CONTRACT_EPOCH).toBe(2);
  });

  it("accepts the exact current epoch for public and protected procedures", async () => {
    const caller = createHttpCaller(String(CURRENT_CONTRACT_EPOCH));

    await expect(caller.publicEndpoint()).resolves.toBe("accepted");
    await expect(caller.protectedEndpoint()).resolves.toBe("accepted");
  });

  it.each([
    undefined,
    "",
    "01",
    "1.0",
    "1",
    "client-build-999",
  ])("rejects an unsupported epoch value %#", async (headerValue) => {
    await expect(createHttpCaller(headerValue).publicEndpoint()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Client contract epoch is unsupported",
    });
  });

  it("rejects duplicate epoch header values", async () => {
    await expect(
      createHttpCaller(String(CURRENT_CONTRACT_EPOCH), true).publicEndpoint(),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Client contract epoch is unsupported",
    });
  });

  it("keeps public-share tRPC procedures behind the epoch gate", async () => {
    const caller = appRouter.createCaller({
      headers: new Headers(),
      session: null,
      trpcSource: "http",
    } as never);

    await expect(
      caller.publicShare.activity({ id: "00000000-0000-4000-8000-000000000001" }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "Client contract epoch is unsupported",
    });
  });
});
