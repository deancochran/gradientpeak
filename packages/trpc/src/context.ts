import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createTRPCContext(opts: {
  headers: Headers;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await opts.supabase.auth.getSession();
  const clientType = opts.headers.get("x-client-type") || "web";
  const trpcSource = opts.headers.get("x-trpc-source") || "nextjs";

  return {
    supabase: opts.supabase,
    headers: opts.headers,
    session: data?.session,
    clientType,
    trpcSource,
  };
}
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
