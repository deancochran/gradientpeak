import { HydrateClient, createServerCaller } from "@/lib/trpc/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  try {
    console.log("🏠 Home page: Attempting to get user...");

    // Use the server caller instead of the proxy
    const trpc = await createServerCaller();
    const user = await trpc.auth.getUser();

    console.log(
      "🏠 Home page: User result:",
      user ? "✅ User found" : "❌ No user",
    );

    if (!user) {
      console.log("🏠 Home page: No user, redirecting to login");
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
  } catch (error) {
    console.log("🏠 Home page: Error getting user:", error);
    redirect("/auth/login");
  }
}
