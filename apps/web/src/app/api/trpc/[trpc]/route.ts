import { appRouter, createApiContext } from "@repo/api/server";
import { resolveAuthSession } from "@repo/auth/server";
import { db } from "@repo/db/client";
import { fetchRequestHandler as fetchApiRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const headersList = await headers();
  const cookieStore = await cookies();

  // Create a Supabase client with SERVICE ROLE KEY for full database access
  // This is safe because:
  // 1. Service role key is only used server-side (never exposed to client)
  // 2. API auth middleware validates authentication
  // 3. All queries explicitly filter by ctx.session.user.id
  const supabase = createServiceRoleClient({
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored in Server Components; web auth is resolved via Better Auth.
        }
      },
    },
  });

  return fetchApiRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: async () =>
      createApiContext({
        headers: headersList,
        auth: {
          resolveSession: resolveAuthSession,
        },
        db,
        supabase,
      }),
  });
}
