import {
  type AuthSession,
  type AuthSessionLookupInput,
  authSessionLookupInputSchema,
} from "@repo/auth/session";
import type { DbClientLike } from "@repo/db/client";
import type { Database } from "@repo/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApiSessionResolver = (input: AuthSessionLookupInput) => Promise<AuthSession | null>;

export interface CreateApiContextOptions {
  headers: Headers;
  auth?: {
    session?: AuthSession | null;
    resolveSession?: ApiSessionResolver;
  };
  db?: DbClientLike;
  supabase?: SupabaseClient<Database>;
}

function getClientType(headers: Headers): AuthSessionLookupInput["clientType"] {
  const rawClientType = headers.get("x-client-type");

  switch (rawClientType) {
    case "mobile":
    case "server":
      return rawClientType;
    default:
      return "web";
  }
}

function buildAuthSessionLookupInput(headers: Headers): AuthSessionLookupInput {
  return authSessionLookupInputSchema.parse({
    authorizationHeader: headers.get("authorization") ?? undefined,
    cookieHeader: headers.get("cookie") ?? undefined,
    clientType: getClientType(headers),
  });
}

export async function createApiContext(opts: CreateApiContextOptions) {
  const authLookupInput = buildAuthSessionLookupInput(opts.headers);

  let authSession = opts.auth?.session ?? null;

  if (!authSession && opts.auth?.resolveSession) {
    authSession = await opts.auth.resolveSession(authLookupInput);
  }

  return {
    authSession,
    clientType: authLookupInput.clientType,
    db: opts.db,
    headers: opts.headers,
    session: authSession,
    supabase: opts.supabase as SupabaseClient<Database>,
    trpcSource: opts.headers.get("x-trpc-source") || "server",
  };
}

export type ApiContext = Awaited<ReturnType<typeof createApiContext>>;
