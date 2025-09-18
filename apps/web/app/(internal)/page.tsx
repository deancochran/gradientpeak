import { trpc } from "@/lib/trpc/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  try {
    const { user } = await trpc.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }

    return (
      <div className="flex h-svh w-full items-center justify-center gap-2">
        <p>
          Hello <span>{user.email}</span>
        </p>
      </div>
    );
  } catch {
    redirect("/auth/login");
  }
}
