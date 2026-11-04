import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authSessionMiddleware, resolveRouteAuthSession } from "../lib/auth/route-guards";

export const Route = createFileRoute("/_coaching")({
  server: {
    middleware: [authSessionMiddleware],
  },
  beforeLoad: async ({ location, serverContext }) => {
    const session = await resolveRouteAuthSession(serverContext);

    if (!session?.user) {
      throw redirect({
        to: "/auth/login",
        search: { flash: undefined, flashType: undefined, redirect: location.href },
      });
    }
  },
  component: CoachingAuthenticatedBoundary,
});

function CoachingAuthenticatedBoundary() {
  return <Outlet />;
}
