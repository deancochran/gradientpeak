import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { getWebAuthSession } from "./client";

export const authSessionMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, request }) => {
    const { resolveAuthSessionFromHeaders } = await import("@repo/auth/server");
    const session = await resolveAuthSessionFromHeaders(new Headers(request.headers));

    return next({
      context: {
        session,
      },
    });
  },
);

export const publicAuthPageMiddleware = [authSessionMiddleware];

export async function resolveRouteAuthSession(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  if (serverContext && "session" in serverContext) {
    return serverContext.session ?? null;
  }

  return getWebAuthSession();
}

export async function redirectAuthenticatedUser(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  const session = await resolveRouteAuthSession(serverContext);

  if (session?.user) {
    throw redirect({ to: "/" });
  }
}
