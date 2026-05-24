import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { getWebAuthSession } from "./client";

const authSessionMiddleware = createMiddleware({ type: "request" }).server(
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

export async function redirectAuthenticatedUser(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  const session = serverContext?.session ?? (await getWebAuthSession());

  if (session?.user) {
    throw redirect({ to: "/" });
  }
}
