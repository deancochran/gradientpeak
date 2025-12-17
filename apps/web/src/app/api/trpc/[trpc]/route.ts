import { Database } from "@repo/supabase";
import { appRouter, createTRPCContext } from "@repo/trpc/server";
import { createServerClient } from "@supabase/ssr";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const headersList = await headers();
  const cookieStore = await cookies();

  // Create a Supabase client with SERVICE ROLE KEY for full database access
  // This is safe because:
  // 1. Service role key is only used server-side (never exposed to client)
  // 2. tRPC protectedProcedure middleware validates authentication
  // 3. All queries explicitly filter by ctx.session.user.id
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
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
