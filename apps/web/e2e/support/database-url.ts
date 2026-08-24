const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// biome-ignore lint/security/noSecrets: Supabase's documented disposable local database URL.
export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:***@127.0.0.1:55322/postgres";

export type E2EDatabaseEnvironment = {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
};

export function localE2EDatabaseEnvironment(environment: E2EDatabaseEnvironment = process.env) {
  const databaseUrl =
    environment.DATABASE_URL !== undefined
      ? validateLocalPostgresUrl("DATABASE_URL", environment.DATABASE_URL)
      : undefined;
  const postgresUrl =
    environment.POSTGRES_URL !== undefined
      ? validateLocalPostgresUrl("POSTGRES_URL", environment.POSTGRES_URL)
      : undefined;
  const fallback = databaseUrl ?? postgresUrl ?? DEFAULT_LOCAL_DATABASE_URL;

  return {
    DATABASE_URL: databaseUrl ?? fallback,
    POSTGRES_URL: postgresUrl ?? fallback,
  } as const;
}

export function localE2EDatabaseUrl(environment: E2EDatabaseEnvironment = process.env) {
  return localE2EDatabaseEnvironment(environment).DATABASE_URL;
}

function validateLocalPostgresUrl(variable: keyof E2EDatabaseEnvironment, value: string) {
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
  if (url.port === "54322") url.port = "55322";
  if (url.port !== "55322") {
    throw new Error(`Web E2E ${variable} requires the dedicated PostgreSQL port 55322.`);
  }
  return url.toString();
}
