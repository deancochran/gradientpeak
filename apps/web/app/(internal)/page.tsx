import { HydrateClient, trpc } from "@/lib/trpc/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  try {
    // Use the server-side tRPC client
    const user = await trpc.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }

    return (
      <HydrateClient>
        <div className="flex h-svh w-full items-center justify-center gap-2">
          <p>
            Hello <span>{user.email}</span>
          </p>
        </div>
      </HydrateClient>
    );
  } catch {
    redirect("/auth/login");
  }
}
