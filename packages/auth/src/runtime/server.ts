import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { resolveDatabaseUrl } from "@repo/db/client";
import * as appSchema from "@repo/db/schema";
import { compare, hash } from "bcryptjs";
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
import { authRuntimeEnvSchema, parseAuthRuntimeEnv } from "./env";
import { createAuthMailer, type SendAuthEmailInput } from "./mailer";

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
    emailMode: authRuntimeEnvSchema.shape.emailMode.parse(process.env.AUTH_EMAIL_MODE ?? "log"),
    emailFrom: process.env.AUTH_EMAIL_FROM,
    emailReplyTo: process.env.AUTH_EMAIL_REPLY_TO,
    smtpHost: process.env.AUTH_SMTP_HOST,
    smtpPort: process.env.AUTH_SMTP_PORT ? Number(process.env.AUTH_SMTP_PORT) : undefined,
    smtpUser: process.env.AUTH_SMTP_USER,
    smtpPass: process.env.AUTH_SMTP_PASS,
    smtpSecure:
      process.env.AUTH_SMTP_SECURE == null ? undefined : process.env.AUTH_SMTP_SECURE === "true",
  });

  const mailer = createAuthMailer(env);

  const sendAuthEmail = (input: SendAuthEmailInput) => {
    void mailer.send(input).catch((error) => {
      console.error("[auth-email] failed", {
        kind: input.kind,
        to: input.to,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const db = drizzle(getPool(options.databaseUrl), {
    schema: createAdapterSchema(),
  });

  return betterAuth({
    ...(options.secret ? { secret: options.secret } : {}),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    baseURL: env.appUrl,
    database: drizzleAdapter(db, {
      provider: "pg",
      usePlural: true,
      schema: createAdapterSchema(),
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      password: {
        hash: async (password) => hash(password, 10),
        verify: async ({ hash: passwordHash, password }) => compare(password, passwordHash),
      },
      sendResetPassword: async ({ user, url }) => {
        sendAuthEmail({
          kind: "reset-password",
          to: user.email,
          actionUrl: url,
          userEmail: user.email,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        sendAuthEmail({
          kind: "verification",
          to: user.email,
          actionUrl: url,
          userEmail: user.email,
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          sendAuthEmail({
            kind: "change-email-confirmation",
            to: user.email,
            actionUrl: url,
            userEmail: user.email,
            newEmail,
          });
        },
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
      databaseUrl: resolveDatabaseUrl(process.env),
      secret: process.env.BETTER_AUTH_SECRET,
      mobileScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? process.env.APP_SCHEME ?? "gradientpeak",
    });
  }

  return authSingleton;
}

export async function resolveAuthSession(
  input: AuthSessionLookupInput,
): Promise<AuthSession | null> {
  const auth = getGradientPeakAuth();
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
