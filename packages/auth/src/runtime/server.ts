import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { resolveDatabaseUrl } from "@repo/db/client";
import { relationalSchema, schema } from "@repo/db/schema";
import { compare, hash } from "bcryptjs";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isStrongPassword } from "../contracts/forms";
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
import {
  AUTH_TOKEN_POLICY,
  createVerificationAdvisoryLock,
  recordVerifiedEmailToken,
  type VerificationConsumptionStore,
  VerificationTokenReplayError,
  withVerificationReplayGuard,
} from "./verification";

export interface CreateGradientPeakAuthOptions {
  appUrl: string;
  databaseUrl: string;
  secret?: string | undefined;
  mobileScheme: string;
  trustedOrigins?: string[] | undefined;
  plugins?: Parameters<typeof betterAuth>[0]["plugins"] | undefined;
}

let poolSingleton: Pool | null = null;
let verificationLockPoolSingleton: Pool | null = null;
let authSingleton: ReturnType<typeof createGradientPeakAuth> | null = null;
let authSecretWarningLogged = false;

const enforcePasswordPolicy = createAuthMiddleware(async (ctx) => {
  const passwordField =
    ctx.path === "/sign-up/email"
      ? "password"
      : ctx.path === "/reset-password" || ctx.path === "/change-password"
        ? "newPassword"
        : undefined;

  if (!passwordField) return;

  const password = (ctx.body as Record<string, unknown> | undefined)?.[passwordField];
  if (typeof password !== "string" || !isStrongPassword(password)) {
    throw new APIError("BAD_REQUEST", {
      message:
        "Password must be at least 8 characters and include an uppercase letter and a number.",
    });
  }
});

function createVerificationConsumptionStore(
  db: ReturnType<typeof drizzle>,
): VerificationConsumptionStore {
  return {
    async isConsumed(id) {
      const rows = await db
        .select({ id: schema.verifications.id })
        .from(schema.verifications)
        .where(eq(schema.verifications.id, id))
        .limit(1);
      return rows.length > 0;
    },
    async consume(input) {
      const rows = await db
        .insert(schema.verifications)
        .values({
          id: input.id,
          identifier: "email-verification-consumed",
          value: "consumed",
          expiresAt: input.expiresAt,
        })
        .onConflictDoNothing({ target: schema.verifications.id })
        .returning({ id: schema.verifications.id });
      return rows.length === 1;
    },
  };
}

function getPool(databaseUrl: string) {
  if (!poolSingleton) {
    poolSingleton = new Pool({ connectionString: databaseUrl });
  }

  return poolSingleton;
}

function getVerificationLockPool(databaseUrl: string) {
  if (!verificationLockPoolSingleton) {
    // Keep advisory-lock connections separate so lock holders cannot exhaust
    // the pool Better Auth needs to complete the verification itself.
    verificationLockPoolSingleton = new Pool({ connectionString: databaseUrl, max: 2 });
  }

  return verificationLockPoolSingleton;
}

function createTrustedOrigins(appUrl: string, mobileScheme: string, trustedOrigins?: string[]) {
  return Array.from(
    new Set([
      appUrl,
      `${mobileScheme}://`,
      ...(process.env["NODE_ENV"] === "development"
        ? [`${mobileScheme}://*`, "exp://", "exp://**"]
        : []),
      ...(trustedOrigins ?? []),
    ]),
  );
}

function createAdapterSchema() {
  return schema as any;
}

function resolveAuthSecret(explicitSecret?: string) {
  if (explicitSecret) {
    return explicitSecret;
  }

  const isBuildPhase = process.env["NEXT_PHASE"] === "phase-production-build";
  const isDevelopment = process.env["NODE_ENV"] === "development";

  if (isBuildPhase || isDevelopment) {
    if (isDevelopment && !authSecretWarningLogged) {
      authSecretWarningLogged = true;
      console.warn(
        "[auth] BETTER_AUTH_SECRET is not set; using a local non-production fallback secret",
      );
    }

    return `gradientpeak-${process.env["NODE_ENV"] ?? "unknown"}-fallback-auth-secret`;
  }

  throw new Error("BETTER_AUTH_SECRET is required outside development/build-time auth setup.");
}

export function createGradientPeakAuth(options: CreateGradientPeakAuthOptions) {
  const env = parseAuthRuntimeEnv({
    appUrl: options.appUrl,
    mobileScheme: options.mobileScheme,
    loginPath: "/auth/login",
    webCallbackPath: "/auth/confirm",
    mobileCallbackPath: "callback",
    emailMode: authRuntimeEnvSchema.shape.emailMode.parse(process.env["AUTH_EMAIL_MODE"] ?? "log"),
    emailCapturePath: process.env["AUTH_EMAIL_CAPTURE_PATH"],
    emailFrom: process.env["AUTH_EMAIL_FROM"],
    emailReplyTo: process.env["AUTH_EMAIL_REPLY_TO"],
    smtpHost: process.env["AUTH_SMTP_HOST"],
    smtpPort: process.env["AUTH_SMTP_PORT"] ? Number(process.env["AUTH_SMTP_PORT"]) : undefined,
    smtpUser: process.env["AUTH_SMTP_USER"],
    smtpPass: process.env["AUTH_SMTP_PASS"],
    smtpSecure:
      process.env["AUTH_SMTP_SECURE"] == null
        ? undefined
        : process.env["AUTH_SMTP_SECURE"] === "true",
  });

  const mailer = createAuthMailer(env);

  const sendAuthEmail = async (input: SendAuthEmailInput) => {
    try {
      await mailer.send(input);
    } catch (error) {
      console.error("[auth-email] failed", {
        kind: input.kind,
        // Recipient addresses and provider error bodies can contain PII.
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      throw error;
    }
  };

  const pool = getPool(options.databaseUrl);
  const db = drizzle(pool, {
    schema: relationalSchema,
  });
  const verificationConsumptionStore = createVerificationConsumptionStore(db);
  const verificationRequestLock = createVerificationAdvisoryLock(
    getVerificationLockPool(options.databaseUrl),
  );

  const secret = resolveAuthSecret(options.secret);

  const auth = betterAuth({
    ...(secret ? { secret } : {}),
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
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: AUTH_TOKEN_POLICY.resetPasswordExpiresInSeconds,
      revokeSessionsOnPasswordReset: AUTH_TOKEN_POLICY.revokeSessionsOnPasswordReset,
      password: {
        hash: async (password) => hash(password, 10),
        verify: async ({ hash: passwordHash, password }) => compare(password, passwordHash),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail({
          kind: "reset-password",
          to: user.email,
          actionUrl: url,
          userEmail: user.email,
        });
      },
    },
    emailVerification: {
      expiresIn: AUTH_TOKEN_POLICY.emailVerificationExpiresInSeconds,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail({
          kind: "verification",
          to: user.email,
          actionUrl: url,
          userEmail: user.email,
        });
      },
      // Better Auth 1.6 applies emailVerified before invoking this callback.
      // Duplicate delivery therefore leaves an idempotently verified user while
      // the unique digest marker allows only the lock-winning request to succeed.
      afterEmailVerification: async (_updatedUser, request) => {
        try {
          await recordVerifiedEmailToken(request, verificationConsumptionStore);
        } catch (error) {
          if (error instanceof VerificationTokenReplayError) {
            throw new APIError("UNAUTHORIZED", { message: error.message });
          }
          throw error;
        }
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          await sendAuthEmail({
            kind: "change-email-confirmation",
            to: user.email,
            actionUrl: url,
            userEmail: user.email,
            newEmail,
          });
        },
      },
      deleteUser: {
        // Remain fail-closed until product data and object storage can be removed
        // atomically with the auth identity.
        enabled: false,
      },
    },
    hooks: {
      before: enforcePasswordPolicy,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      storage: "database",
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    trustedOrigins: createTrustedOrigins(env.appUrl, env.mobileScheme, options.trustedOrigins),
    plugins: [expo(), ...(options.plugins ?? []), tanstackStartCookies()],
  });

  const handler = auth.handler;
  return {
    ...auth,
    handler: async (request: Request) => {
      try {
        return await withVerificationReplayGuard(
          request,
          verificationConsumptionStore,
          verificationRequestLock,
          () => handler(request),
        );
      } catch (error) {
        if (error instanceof VerificationTokenReplayError) {
          return Response.json({ code: "UNAUTHORIZED", message: error.message }, { status: 401 });
        }
        throw error;
      }
    },
  };
}

export function getGradientPeakAuth() {
  if (!authSingleton) {
    authSingleton = createGradientPeakAuth({
      appUrl:
        process.env["APP_URL"] ?? process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000",
      databaseUrl: resolveDatabaseUrl(process.env),
      ...(process.env["BETTER_AUTH_SECRET"] ? { secret: process.env["BETTER_AUTH_SECRET"] } : {}),
      mobileScheme:
        process.env["EXPO_PUBLIC_APP_SCHEME"] ?? process.env["APP_SCHEME"] ?? "gradientpeak",
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
