import { createServerCaller } from "@/lib/trpc/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const _next = searchParams.get("next");
  const next = _next?.startsWith("/") ? _next : "/";

  if (token_hash && type) {
    try {
      const trpc = await createServerCaller();
      await trpc.auth.verifyOtp({
        type,
        token_hash,
      });

      // redirect user to specified redirect URL or root of app
      redirect(next);
    } catch (error: unknown) {
      // redirect the user to an error page with some instructions
      const message =
        error instanceof Error ? error.message : "Verification failed";
      redirect(`/auth/error?error=${message}`);
    }
  }

  // redirect the user to an error page with some instructions
  redirect(`/auth/error?error=No token hash or type`);
}
