import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import {
  AuthenticatedViewerBoundary,
  AuthProvider,
  AuthSessionRouteInvalidator,
} from "../components/providers/auth-provider";
import {
  authSessionMiddleware,
  resolveRouteAuthSession,
  toPublicAuthViewer,
} from "../lib/auth/route-guards";

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
    return { actorProfileId: session.user.id, authViewer: toPublicAuthViewer(session) };
  },
  component: CoachingAuthenticatedBoundary,
});

function CoachingAuthenticatedBoundary() {
  const { authViewer } = Route.useRouteContext();
  return (
    <AuthProvider initialViewer={authViewer}>
      <AuthSessionRouteInvalidator>
        <AuthenticatedViewerBoundary>
          <Outlet />
        </AuthenticatedViewerBoundary>
      </AuthSessionRouteInvalidator>
    </AuthProvider>
  );
}
