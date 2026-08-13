import type { AuthSession } from "@repo/auth/session";
import type { OnboardingStatus } from "@repo/core/schemas/onboarding";
import { redirect } from "@tanstack/react-router";
import { createMiddleware, createServerFn } from "@tanstack/react-start";

import { getWebAuthSession } from "./client";

export const authSessionMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, request }) => {
    const { resolveAuthSessionFromHeaders } = await import("@repo/auth/server");
    const session = await resolveAuthSessionFromHeaders(new Headers(request.headers));
    let onboardingStatus: OnboardingStatus | null = null;

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
      onboardingStatus = profile.onboarding_status;
    }

    return next({
      context: {
        onboardingStatus,
        session,
      },
    });
  },
);

export const publicAuthPageMiddleware = [authSessionMiddleware];

export const loadRouteProfileState = createServerFn({ method: "GET" }).handler(async () => {
  const { createServerActionCaller } = await import("../server-action-api");
  const profile = await (await createServerActionCaller()).profiles.get();
  return { onboardingStatus: profile.onboarding_status };
});

export function getProtectedAccessRedirect(
  session: AuthSession | null,
  onboardingStatus: OnboardingStatus | null,
  requestedDestination: string,
) {
  if (!session?.user) {
    return { destination: "login" as const, redirectTo: requestedDestination };
  }
  if (!session.user.emailVerified) {
    return { destination: "verify" as const };
  }
  if (onboardingStatus !== "completed") {
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

export function resolveRouteOnboardingStatus(serverContext?: {
  onboardingStatus?: OnboardingStatus | null;
}) {
  return serverContext?.onboardingStatus ?? null;
}

export async function resolveRouteProfileState(serverContext?: {
  onboardingStatus?: OnboardingStatus | null;
}) {
  const serverValue = resolveRouteOnboardingStatus(serverContext);
  if (serverValue !== null) return serverValue;
  return (await loadRouteProfileState()).onboardingStatus;
}

export async function redirectAuthenticatedUser(serverContext?: {
  session?: Awaited<ReturnType<typeof getWebAuthSession>>;
}) {
  const session = await resolveRouteAuthSession(serverContext);

  if (session?.user) {
    throw redirect({ to: "/" });
  }
}
