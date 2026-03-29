import { createApiContext } from "@repo/api/context";
import { resolveAuthSessionFromHeaders } from "@repo/auth/server";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function createWebTrpcContext(opts: {
  headers: Headers;
  supabase: SupabaseClient<Database>;
}) {
  const apiContext = await createApiContext({
    headers: opts.headers,
    auth: {
      resolveSession: () => resolveAuthSessionFromHeaders(opts.headers),
    },
    supabase: opts.supabase,
  });

  return {
    ...apiContext,
    authSession: apiContext.authSession,
    session: apiContext.session,
  };
}
