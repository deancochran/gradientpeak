import type { AuthSession } from "@repo/auth/session";
import { redirect } from "@tanstack/react-router";
import { createMiddleware, createServerFn } from "@tanstack/react-start";

import { getWebAuthSession } from "./client";

export const authSessionMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, request }) => {
    const { resolveAuthSessionFromHeaders } = await import("@repo/auth/server");
    const session = await resolveAuthSessionFromHeaders(new Headers(request.headers));
    let profileOnboarded: boolean | null = null;

    if (session?.user.emailVerified) {
      const [{ appRouter, createApiContext }, { db }] = await Promise.all([
        import("@repo/api/server"),
        import("@repo/db/client"),
      ]);
      const context = await createApiContext({
        headers: new Headers(request.headers),
        auth: { session },
        db,
      });
      const profile = await appRouter.createCaller(context).profiles.get();
      profileOnboarded = profile.onboarded === true;
    }

    return next({
      context: {
        profileOnboarded,
        session,
      },
    });
  },
);

export const publicAuthPageMiddleware = [authSessionMiddleware];

export const loadRouteProfileState = createServerFn({ method: "GET" }).handler(async () => {
  const { createServerActionCaller } = await import("../server-action-api");
  const profile = await (await createServerActionCaller()).profiles.get();
  return { onboarded: profile.onboarded === true };
});

export function getProtectedAccessRedirect(
  session: AuthSession | null,
  onboarded: boolean | null,
  requestedDestination: string,
) {
  if (!session?.user) {
    return { destination: "login" as const, redirectTo: requestedDestination };
  }
  if (!session.user.emailVerified) {
    return { destination: "verify" as const };
  }
  if (onboarded !== true) {
    return { destination: "onboarding" as const, redirectTo: requestedDestination };
  }
  return null;
}

export async function resolveRouteAuthSession(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  if (serverContext && "session" in serverContext) {
    return serverContext.session ?? null;
  }

  return getWebAuthSession();
}

export function resolveRouteProfileOnboarded(serverContext?: {
  profileOnboarded?: boolean | null;
}) {
  return serverContext?.profileOnboarded ?? null;
}

export async function resolveRouteProfileState(serverContext?: {
  profileOnboarded?: boolean | null;
}) {
  const serverValue = resolveRouteProfileOnboarded(serverContext);
  if (serverValue !== null) return serverValue;
  return (await loadRouteProfileState()).onboarded;
}

export async function redirectAuthenticatedUser(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  const session = await resolveRouteAuthSession(serverContext);

  if (session?.user) {
    throw redirect({ to: "/" });
  }
}
