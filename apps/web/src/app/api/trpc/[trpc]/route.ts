import { Database } from "@repo/supabase";
import { appRouter, createTRPCContext } from "@repo/trpc/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { cookies, headers } from "next/headers";

export const GET = handler;
export const POST = handler;

async function handler(request: Request) {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");

  let supabase: SupabaseClient<Database>;

  if (authHeader?.startsWith("Bearer ")) {
    // Mobile / Expo client
    const token = authHeader.split(" ")[1];
    supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
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
  } else {
    // Web client (cookies)
    const cookieStore = await cookies();
    supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {}
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
}
