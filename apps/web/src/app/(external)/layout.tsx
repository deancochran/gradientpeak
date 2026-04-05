import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ExternalAuthGuard } from "@/components/auth/external-auth-guard";
import { Navbar } from "@/components/nav-bar";

export const metadata: Metadata = {
  title: "Account",
};

export default async function ExternalLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveAuthSessionFromHeaders(new Headers(await headers()));

  if (session?.user) {
    redirect("/");
  }

  return (
    <>
      <Navbar />
      <ExternalAuthGuard>{children}</ExternalAuthGuard>
    </>
  );
}
