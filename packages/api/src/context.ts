import {
  type AuthSession,
  type AuthSessionLookupInput,
  createAuthSessionLookupInputFromHeaders,
} from "@repo/auth/session";
import type { DrizzleDbClient } from "@repo/db/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiSessionResolver = (input: AuthSessionLookupInput) => Promise<AuthSession | null>;
export type ApiClientType = AuthSessionLookupInput["clientType"];

export interface ApiContextAuth {
  lookupInput: AuthSessionLookupInput;
  session: AuthSession | null;
}

export interface CreateApiContextOptions {
  headers: Headers;
  auth?: {
    session?: AuthSession | null;
    resolveSession?: ApiSessionResolver;
  };
  db?: DrizzleDbClient;
  supabase?: SupabaseClient;
}

export type Context = ApiContext;

/**
 * Temporary bridge during the API DB cutover.
 * New code should rely on `ctx.db` and auth session state instead.
 */
export type LegacySupabaseContext = Pick<ApiContext, "supabase">;

export async function createApiContext(opts: CreateApiContextOptions) {
  const authLookupInput = createAuthSessionLookupInputFromHeaders(opts.headers);

  let authSession = opts.auth?.session ?? null;

  if (!authSession && opts.auth?.resolveSession) {
    authSession = await opts.auth.resolveSession(authLookupInput);
  }

  return {
    auth: {
      lookupInput: authLookupInput,
      session: authSession,
    },
    authSession,
    clientType: authLookupInput.clientType,
    db: opts.db,
    headers: opts.headers,
    session: authSession,
    supabase: opts.supabase as SupabaseClient,
    trpcSource: opts.headers.get("x-api-source") || "server",
  };
}

export type ApiContext = Awaited<ReturnType<typeof createApiContext>>;
