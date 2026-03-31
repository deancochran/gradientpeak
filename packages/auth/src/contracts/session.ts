import { z } from "zod";

export const authSessionTransportSchema = z.enum(["cookie", "bearer"]);

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  emailVerified: z.boolean(),
});

export const authSessionSchema = z.object({
  sessionId: z.string().min(1),
  user: authUserSchema,
  transport: authSessionTransportSchema,
  bearerToken: z.string().min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const authSessionLookupInputSchema = z.object({
  authorizationHeader: z.string().optional(),
  cookieHeader: z.string().optional(),
  clientType: z.enum(["web", "mobile", "server"]).default("web"),
});

export interface AuthSessionLike {
  user?: {
    id?: string | number | null;
    email?: string | null;
    emailVerified?: boolean | null;
  } | null;
  session?: {
    id?: string | number | null;
    expiresAt?: string | Date | null;
  } | null;
  bearerToken?: string | null;
}

function getHeader(headers: Headers, name: string) {
  return headers.get(name) ?? headers.get(name.toLowerCase()) ?? undefined;
}

function getClientType(headers: Headers): AuthSessionLookupInput["clientType"] {
  const rawClientType = getHeader(headers, "x-client-type");

  switch (rawClientType) {
    case "mobile":
    case "server":
      return rawClientType;
    default:
      return "web";
  }
}

function normalizeSessionExpiry(expiresAt: string | Date | null | undefined) {
  if (typeof expiresAt === "string") {
    return expiresAt;
  }

  if (expiresAt instanceof Date) {
    return expiresAt.toISOString();
  }

  return undefined;
}

export function createAuthSessionLookupInputFromHeaders(headers: Headers): AuthSessionLookupInput {
  return authSessionLookupInputSchema.parse({
    authorizationHeader: getHeader(headers, "authorization"),
    cookieHeader: getHeader(headers, "cookie"),
    clientType: getClientType(headers),
  });
}

export function createAuthHeadersFromSessionLookupInput(input: AuthSessionLookupInput): Headers {
  const lookupInput = authSessionLookupInputSchema.parse(input);
  const headers = new Headers();

  if (lookupInput.authorizationHeader) {
    headers.set("authorization", lookupInput.authorizationHeader);
  }

  if (lookupInput.cookieHeader) {
    headers.set("cookie", lookupInput.cookieHeader);
  }

  headers.set("x-client-type", lookupInput.clientType);

  return headers;
}

export function inferAuthSessionTransport(
  input: Pick<AuthSessionLookupInput, "authorizationHeader" | "cookieHeader">,
): AuthSessionTransport | null {
  if (input.authorizationHeader?.startsWith("Bearer ")) {
    return "bearer";
  }

  if (input.cookieHeader) {
    return "cookie";
  }

  return null;
}

export function normalizeAuthSession(
  session: AuthSessionLike | null | undefined,
  transport: AuthSessionTransport = "cookie",
): AuthSession | null {
  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  const expiresAt = normalizeSessionExpiry(session.session?.expiresAt);
  const sessionId = session.session?.id;

  return {
    sessionId: String(sessionId ?? `${session.user.id}:${expiresAt ?? "session"}`),
    user: {
      id: String(session.user.id),
      email: String(session.user.email),
      emailVerified: Boolean(session.user.emailVerified),
    },
    transport,
    expiresAt,
    ...(transport === "bearer" && session.bearerToken ? { bearerToken: session.bearerToken } : {}),
  };
}

export type AuthSessionTransport = z.infer<typeof authSessionTransportSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
export type AuthSessionLookupInput = z.infer<typeof authSessionLookupInputSchema>;
