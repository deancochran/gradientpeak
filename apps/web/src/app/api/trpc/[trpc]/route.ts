import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { fetchRequestHandler as fetchApiRequestHandler } from "@trpc/server/adapters/fetch";
import { headers } from "next/headers";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const headersList = await headers();

  return fetchApiRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: async () =>
      createApiContext({
        headers: headersList,
        auth: {
          resolveSession: resolveAuthSession,
        },
        db,
      }),
  });
}
