const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

// biome-ignore lint/security/noSecrets: Supabase's documented disposable local database URL.
export const DEFAULT_LOCAL_DATABASE_URL = "postgresql://postgres:***@127.0.0.1:55322/postgres";

export type E2EDatabaseEnvironment = {
  DATABASE_URL?: string;
  POSTGRES_URL?: string;
};

const E2E_DATABASE_VARIABLES = new Set(["DATABASE_URL", "POSTGRES_URL"]);

export function applyE2EFileEnvironment(
  environment: Record<string, string | undefined>,
  fileEnvironment: Record<string, string>,
) {
  for (const [key, value] of Object.entries(fileEnvironment)) {
    environment[key] ??= E2E_DATABASE_VARIABLES.has(key)
      ? e2eDatabaseUrlFromFile(key as keyof E2EDatabaseEnvironment, value)
      : value;
  }
}

function e2eDatabaseUrlFromFile(variable: keyof E2EDatabaseEnvironment, value: string) {
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
  if (url.port !== "55322") {
    throw new Error(`Web E2E ${variable} requires the dedicated PostgreSQL port 55322.`);
  }
  return url.toString();
}
