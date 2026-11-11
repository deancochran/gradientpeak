// This module is imported directly by Node's TypeScript loader from an .mjs
// E2E launcher, which requires explicit TypeScript extensions for its children.
import { validateDisposableAcceptanceLease } from "./disposable-acceptance-lease.ts";

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// biome-ignore lint/security/noSecrets: Supabase's documented disposable local database URL.
export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:***@127.0.0.1:55322/postgres";

export type WebE2EDatabaseEnvironment = {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
  E2E_DISPOSABLE_DATABASE?: string;
  E2E_RUN_ID?: string;
  E2E_DISPOSABLE_LEASE_CAPABILITY?: string;
  E2E_DISPOSABLE_LEASE_PATH?: string;
};

const E2E_DATABASE_VARIABLES = new Set(["DATABASE_URL", "POSTGRES_URL"]);

export function applyE2EFileEnvironment(
  environment: Record<string, string | undefined>,
  fileEnvironment: Record<string, string>,
) {
  for (const [key, value] of Object.entries(fileEnvironment)) {
    environment[key] ??= E2E_DATABASE_VARIABLES.has(key)
      ? e2eDatabaseUrlFromFile(key as keyof WebE2EDatabaseEnvironment, value)
      : value;
  }
}

function e2eDatabaseUrlFromFile(variable: keyof WebE2EDatabaseEnvironment, value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Web E2E ${variable} from env files must be a valid PostgreSQL URL.`);
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !LOCAL_DATABASE_HOSTS.has(url.hostname) ||
    !["54322", "55322"].includes(url.port)
  ) {
    throw new Error(
      `Web E2E ${variable} from env files must use the repository local PostgreSQL endpoint.`,
    );
  }
  url.port = "55322";
  return url.toString();
}

export function localE2EDatabaseEnvironment(environment: WebE2EDatabaseEnvironment = process.env) {
  const databaseUrl =
    environment.DATABASE_URL !== undefined
      ? validateLocalPostgresUrl("DATABASE_URL", environment.DATABASE_URL, environment)
      : undefined;
  const postgresUrl =
    environment.POSTGRES_URL !== undefined
      ? validateLocalPostgresUrl("POSTGRES_URL", environment.POSTGRES_URL, environment)
      : undefined;
  const fallback = databaseUrl ?? postgresUrl ?? DEFAULT_LOCAL_DATABASE_URL;
  if (environment.E2E_DISPOSABLE_DATABASE === "1") {
    if (!databaseUrl || !postgresUrl || databaseUrl !== postgresUrl)
      throw new Error("Disposable E2E requires matching explicit DATABASE_URL and POSTGRES_URL.");
    validateDisposableAcceptanceLease(environment, databaseUrl);
  }

  return {
    DATABASE_URL: databaseUrl ?? fallback,
    POSTGRES_URL: postgresUrl ?? fallback,
  } as const;
}

export function localE2EDatabaseUrl(environment: WebE2EDatabaseEnvironment = process.env) {
  return localE2EDatabaseEnvironment(environment).DATABASE_URL;
}

function validateLocalPostgresUrl(
  variable: keyof WebE2EDatabaseEnvironment,
  value: string,
  environment: WebE2EDatabaseEnvironment,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Web E2E ${variable} must be a valid PostgreSQL URL.`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`Web E2E ${variable} must use the PostgreSQL protocol.`);
  }
  if (!LOCAL_DATABASE_HOSTS.has(url.hostname)) {
    throw new Error(
      `Web E2E ${variable} is local-only; refused host ${url.hostname || "<empty>"}.`,
    );
  }
  if (environment.E2E_DISPOSABLE_DATABASE === "1") {
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "54322" ||
      !/^\/gradientpeak_web_acceptance_\d+_\d+$/.test(url.pathname) ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Disposable E2E requires a guarded named acceptance database on 127.0.0.1:54322.",
      );
    }
  } else if (url.port !== "55322") {
    throw new Error(`Web E2E ${variable} requires the dedicated PostgreSQL port 55322.`);
  }
  return url.toString();
}
