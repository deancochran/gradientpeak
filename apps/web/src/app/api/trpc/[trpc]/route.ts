import { Database } from "@repo/supabase";
import { appRouter, createTRPCContext } from "@repo/trpc/server";
import { createClient } from "@supabase/supabase-js";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { headers } from "next/headers";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const headersList = await headers();

  // Use service role key for all backend operations
  // Authorization is handled by protectedProcedure middleware + profile_id filtering
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        headers: headersList,
        supabase,
      }),
  });
}
