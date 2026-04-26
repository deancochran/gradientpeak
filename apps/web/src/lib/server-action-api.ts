import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { getRequestHeaders } from "@tanstack/react-start/server";

export async function createServerActionCaller() {
  const headers = getRequestHeaders();
  const session = await resolveAuthSessionFromHeaders(headers);
  const context = await createApiContext({
    headers,
    auth: {
      session,
    },
  });

  return appRouter.createCaller(context);
}
