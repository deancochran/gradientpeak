import { createServerCaller } from "@/lib/trpc/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  try {
    const trpc = await createServerCaller();
    const {
      user: { data, error },
    } = await trpc.auth.getUser();

    if (!data) {
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
