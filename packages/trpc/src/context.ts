import type { Database } from "@repo/supabase";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

const getUserFromHeader = async (
  headers: Headers,
  supabase: SupabaseClient<Database>,
): Promise<Session | null> => {
  const authHeader = headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    return null;
  }

  if (data.user) {
    return {
      access_token: token,
      refresh_token: "", // Not available this way
      user: data.user,
      token_type: "bearer",
      expires_in: 0, // Not available this way
      expires_at: 0, // Not available this way
    };
  }

  return null;
};

export async function createTRPCContext(opts: {
  headers: Headers;
  supabase: SupabaseClient<Database>;
}) {
  const session = await getUserFromHeader(opts.headers, opts.supabase);
  const clientType = opts.headers.get("x-client-type") || "web";
  const trpcSource = opts.headers.get("x-trpc-source") || "nextjs";

  return {
    supabase: opts.supabase,
    headers: opts.headers,
    session: session,
    clientType,
    trpcSource,
  };
}
export type Context = Awaited<ReturnType<typeof createTRPCContext>>;
