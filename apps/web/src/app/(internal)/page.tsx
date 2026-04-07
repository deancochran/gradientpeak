import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const session = await resolveAuthSessionFromHeaders(new Headers(await headers()));

  if (!session?.user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-[50svh] w-full items-center justify-center gap-2 rounded-xl border bg-card p-8 text-card-foreground shadow-sm">
      <p>
        Hello <span className="font-medium">{session.user.email}</span>
      </p>
    </div>
  );
}
