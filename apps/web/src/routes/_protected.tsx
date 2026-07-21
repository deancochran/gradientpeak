import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ProtectedHeader } from "../components/protected/protected-header";
import {
  authSessionMiddleware,
  getProtectedAccessRedirect,
  resolveRouteAuthSession,
  resolveRouteProfileState,
} from "../lib/auth/route-guards";

export const Route = createFileRoute("/_protected")({
  server: {
    middleware: [authSessionMiddleware],
  },
  beforeLoad: async ({ location, serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);
    const initialDecision = getProtectedAccessRedirect(session, true, location.href);

    if (initialDecision?.destination === "login") {
      throw redirect({
        to: "/auth/login",
        search: { flash: undefined, flashType: undefined, redirect: location.href },
      });
    }
    if (initialDecision?.destination === "verify") {
      throw redirect({
        to: "/auth/verify",
        search: {
          email: undefined,
          flash: undefined,
          flashType: undefined,
          source: undefined,
        },
      });
    }

    const decision = getProtectedAccessRedirect(
      session,
      await resolveRouteProfileState(serverContext),
      location.href,
    );
    if (decision?.destination === "onboarding") {
      throw redirect({
        to: "/onboarding",
        search: { flash: undefined, flashType: undefined, redirect: decision.redirectTo },
      });
    }

    return { authUserId: session?.user.id };
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return (
    <div className="gp-protected-shell flex min-h-screen flex-col">
      <ProtectedHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
