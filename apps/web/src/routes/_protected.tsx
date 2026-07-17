import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { ProtectedHeader } from "../components/protected/protected-header";
import { authSessionMiddleware, resolveRouteAuthSession } from "../lib/auth/route-guards";

export const Route = createFileRoute("/_protected")({
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
