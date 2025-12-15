import type { Database } from "@repo/supabase";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

const getSession = async (
  headers: Headers,
  supabase: SupabaseClient<Database>,
): Promise<Session | null> => {
  // Check for Authorization header first (mobile/API clients)
  const authHeader = headers.get("authorization");

  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    if (token) {
      const { data, error: userError } = await supabase.auth.getUser(token);

      if (!userError && data.user) {
        return {
          access_token: token,
          refresh_token: "", // Not available this way
          user: data.user,
          token_type: "bearer",
          expires_in: 0, // Not available this way
          expires_at: 0, // Not available this way
        };
      }
    }
  }

  // Fallback to session from cookies (for web clients)
  // Note: This only works if supabase is a cookie-aware SSR client
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (session && !error) {
      return session;
    }
  } catch (err) {
    // getSession() might not be available on all supabase client types
    console.warn("Could not get session from cookies:", err);
  }

  return null;
};

export async function createTRPCContext(opts: {
  headers: Headers;
  supabase: SupabaseClient<Database>;
}) {
  const session = await getSession(opts.headers, opts.supabase);
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
