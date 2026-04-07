import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveAuthSessionFromHeaders(new Headers(await headers()));

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader />
      <main className="flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
