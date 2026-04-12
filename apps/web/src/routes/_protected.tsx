import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
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
        search: { redirect: location.href },
      });
    }
  },
  component: ProtectedLayout,
});

function ProtectedLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <ProtectedHeader />
      <main className="flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
