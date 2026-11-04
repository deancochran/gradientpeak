const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const MANUAL_PORTS = new Set([54321, 54322]);

export const E2E_PORTS = {
  shadow: 55320,
  api: 55321,
  database: 55322,
  studio: 55323,
  mailpit: 55324,
  smtp: 55325,
  analytics: 55327,
  inspector: 55328,
  pooler: 55329,
} as const;

export type E2EDatabaseEnvironment = {
  GRADIENTPEAK_E2E_DATABASE_PORT?: string;
  GRADIENTPEAK_E2E_PROJECT_ID?: string;
  GRADIENTPEAK_E2E_SUPABASE_URL?: string;
};

export function parseE2EEnvironment(environment: E2EDatabaseEnvironment = process.env) {
  const projectId = environment.GRADIENTPEAK_E2E_PROJECT_ID ?? "gradientpeak_e2e";
  const databasePort = parsePort(
    environment.GRADIENTPEAK_E2E_DATABASE_PORT ?? String(E2E_PORTS.database),
    "GRADIENTPEAK_E2E_DATABASE_PORT",
  );
  const apiUrl = environment.GRADIENTPEAK_E2E_SUPABASE_URL ?? `http://127.0.0.1:${E2E_PORTS.api}`;
  const parsedApiUrl = new URL(apiUrl);
  const supabasePort = parsePort(parsedApiUrl.port, "GRADIENTPEAK_E2E_SUPABASE_URL port");

  return { apiUrl, databasePort, projectId, supabasePort } as const;
}

export function requireSafeE2EEnvironment(environment: E2EDatabaseEnvironment = process.env) {
  const parsed = parseE2EEnvironment(environment);
  if (parsed.projectId === "gradientpeak") {
    throw new Error("E2E database command refused manual Supabase project gradientpeak.");
  }
  if (parsed.projectId !== "gradientpeak_e2e") {
    throw new Error("E2E database command requires project gradientpeak_e2e.");
  }

  const apiUrl = new URL(parsed.apiUrl);
  if (apiUrl.protocol !== "http:" || !LOOPBACK_HOSTS.has(apiUrl.hostname)) {
    throw new Error("E2E Supabase URL is loopback-only and must use HTTP.");
  }
  for (const port of [parsed.databasePort, parsed.supabasePort]) {
    if (MANUAL_PORTS.has(port))
      throw new Error(`E2E database command refused manual port ${port}.`);
  }
  if (parsed.databasePort !== E2E_PORTS.database || parsed.supabasePort !== E2E_PORTS.api) {
    throw new Error("E2E database command requires reserved ports 55322 and 55321.");
  }
  return parsed;
}

export function buildE2ESupabaseConfig(manualConfig: string) {
  let config = manualConfig.replace(
    /^project_id\s*=\s*"[^"]+"/m,
    'project_id = "gradientpeak_e2e"',
  );
  config = replaceSectionPort(config, "api", "port", E2E_PORTS.api);
  config = replaceSectionPort(config, "db", "port", E2E_PORTS.database);
  config = replaceSectionPort(config, "db", "shadow_port", E2E_PORTS.shadow);
  config = replaceSectionPort(config, "db.pooler", "port", E2E_PORTS.pooler);
  config = replaceSectionPort(config, "studio", "port", E2E_PORTS.studio);
  config = replaceSectionPort(config, "local_smtp", "port", E2E_PORTS.mailpit);
  config = replaceSectionPort(config, "local_smtp", "smtp_port", E2E_PORTS.smtp);
  config = replaceSectionPort(config, "edge_runtime", "inspector_port", E2E_PORTS.inspector);
  config = replaceSectionPort(config, "analytics", "port", E2E_PORTS.analytics);
  return config;
}

function parsePort(value: string, name: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

function replaceSectionPort(config: string, section: string, key: string, port: number) {
  const sectionPattern = new RegExp(`(\\[${escapeRegExp(section)}\\][\\s\\S]*?)(?=\\n\\[|$)`);
  const match = config.match(sectionPattern);
  if (!match?.[1]) throw new Error(`Supabase config is missing [${section}].`);
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*\\d+`, "m");
  if (!keyPattern.test(match[1]))
    throw new Error(`Supabase config [${section}] is missing ${key}.`);
  return config.replace(sectionPattern, match[1].replace(keyPattern, `${key} = ${port}`));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
