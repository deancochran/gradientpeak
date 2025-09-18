import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createTRPCContext(opts: {
  headers: Headers;
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await opts.supabase.auth.getSession();

  return {
    supabase: opts.supabase,
    headers: opts.headers,
    session: data?.session,
  };
}
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
