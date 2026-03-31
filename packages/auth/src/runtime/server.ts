import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import * as appSchema from "@repo/db/schema";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  type AuthSession,
  type AuthSessionLookupInput,
  createAuthHeadersFromSessionLookupInput,
  createAuthSessionLookupInputFromHeaders,
  inferAuthSessionTransport,
  normalizeAuthSession,
} from "../contracts/session";
import { parseAuthRuntimeEnv } from "./env";

export interface CreateGradientPeakAuthOptions {
  appUrl: string;
  databaseUrl: string;
  secret?: string;
  mobileScheme: string;
  trustedOrigins?: string[];
  plugins?: any[];
}

let poolSingleton: Pool | null = null;
let authSingleton: ReturnType<typeof createGradientPeakAuth> | null = null;

function getPool(databaseUrl: string) {
  if (!poolSingleton) {
    poolSingleton = new Pool({ connectionString: databaseUrl });
  }

  return poolSingleton;
}

function createTrustedOrigins(appUrl: string, mobileScheme: string, trustedOrigins?: string[]) {
  return Array.from(
    new Set([
      appUrl,
      `${mobileScheme}://`,
      `${mobileScheme}://*`,
      ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
      ...(trustedOrigins ?? []),
    ]),
  );
}

function createNoopEmailSender(kind: string) {
  return async ({ user, url }: { user: { email: string }; url: string }) => {
    console.warn(`[auth] ${kind} email sender not configured`, {
      email: user.email,
      url,
    });
  };
}

function createDeleteCleanupHook() {
  return async (user: { id: string; email: string }) => {
    console.warn("[auth] delete-user cleanup hook not configured", {
      userId: user.id,
      email: user.email,
    });
  };
}

function createAdapterSchema() {
  return {
    ...appSchema,
  } as any;
}

export function createGradientPeakAuth(options: CreateGradientPeakAuthOptions) {
  const env = parseAuthRuntimeEnv({
    appUrl: options.appUrl,
    mobileScheme: options.mobileScheme,
    loginPath: "/auth/login",
    webCallbackPath: "/auth/confirm",
    mobileCallbackPath: "callback",
  });

  const db = drizzle(getPool(options.databaseUrl), {
    schema: createAdapterSchema(),
  });

  return betterAuth({
    ...(options.secret ? { secret: options.secret } : {}),
    baseURL: env.appUrl,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: createAdapterSchema(),
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: createNoopEmailSender("reset-password"),
    },
    emailVerification: {
      sendVerificationEmail: createNoopEmailSender("verification"),
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: createNoopEmailSender("change-email"),
      },
      deleteUser: {
        enabled: true,
        afterDelete: createDeleteCleanupHook(),
      },
    },
    trustedOrigins: createTrustedOrigins(env.appUrl, env.mobileScheme, options.trustedOrigins),
    plugins: [expo(), ...(options.plugins ?? [])],
  });
}

export function getGradientPeakAuth() {
  if (!authSingleton) {
    authSingleton = createGradientPeakAuth({
      appUrl: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      databaseUrl:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      secret: process.env.BETTER_AUTH_SECRET,
      mobileScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? process.env.APP_SCHEME ?? "gradientpeak",
    });
  }

  return authSingleton;
}

export const auth = getGradientPeakAuth();

export async function resolveAuthSession(
  input: AuthSessionLookupInput,
): Promise<AuthSession | null> {
  const lookupInput = createAuthSessionLookupInputFromHeaders(
    createAuthHeadersFromSessionLookupInput(input),
  );
  const session = await auth.api.getSession({
    headers: createAuthHeadersFromSessionLookupInput(lookupInput),
  });

  return normalizeAuthSession(session, inferAuthSessionTransport(lookupInput) ?? "cookie");
}

export async function resolveAuthSessionFromHeaders(headers: Headers): Promise<AuthSession | null> {
  return resolveAuthSession(createAuthSessionLookupInputFromHeaders(headers));
}
