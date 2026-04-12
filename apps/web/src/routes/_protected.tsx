import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { ProtectedHeader } from "../components/protected/protected-header";
import { getWebAuthSession } from "../lib/auth/client";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ location }) => {
    const session = await getWebAuthSession();

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
