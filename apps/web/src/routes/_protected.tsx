import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

import { ProtectedHeader } from "../components/protected/protected-header";
import { getWebAuthSession } from "../lib/auth/client";

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

export const Route = createFileRoute("/_protected")({
  server: {
    middleware: [authSessionMiddleware],
  },
  beforeLoad: async ({ location, serverContext }) => {
    const session = serverContext?.session ?? (await getWebAuthSession());

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
