import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getServerActionTrpcSource } from "./contract-epoch-middleware";

export async function createServerActionCaller() {
  const { db } = await import("@repo/db/client");
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  const context = await createApiContext({
    headers,
    trpcSource: getServerActionTrpcSource(headers),
    auth: {
      session,
    },
    db,
  });

  return appRouter.createCaller(context);
}
