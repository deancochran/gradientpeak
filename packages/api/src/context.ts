import {
  type AuthSession,
  type AuthSessionLookupInput,
  createAuthSessionLookupInputFromHeaders,
} from "@repo/auth/session";
import type { DrizzleDbClient } from "@repo/db/client";

export type ApiSessionResolver = (input: AuthSessionLookupInput) => Promise<AuthSession | null>;
export type ApiClientType = AuthSessionLookupInput["clientType"];

export interface ApiContextAuth {
  lookupInput: AuthSessionLookupInput;
  session: AuthSession | null;
}

export interface CreateApiContextOptions {
  headers: Headers;
  /**
   * A network identity established by a server adapter, never a value read
   * from request headers. The Fetch adapter currently does not provide one.
   */
  trustedNetworkIdentity?: string;
  auth?: {
    session?: AuthSession | null;
    resolveSession?: ApiSessionResolver;
  };
  db?: DrizzleDbClient;
}

export type Context = ApiContext;

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
    trustedNetworkIdentity: opts.trustedNetworkIdentity,
    // Request headers are untrusted; adapters may add trusted context fields
    // explicitly, but no external header controls internal execution policy.
    trpcSource: "server",
  };
}

export type ApiContext = Awaited<ReturnType<typeof createApiContext>>;
