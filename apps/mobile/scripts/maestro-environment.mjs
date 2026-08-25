const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const MANUAL_PORTS = new Set([3000, 8081, 54321]);

export function requireAdbReverses(ports, reverse) {
  for (const port of ports) {
    if (!reverse(port)) {
      throw new Error(`Maestro E2E could not establish required ADB reverse for port ${port}.`);
    }
  }
}

export function runWithRequiredMaestroPreparation({ environment, execute, ports, reverse }) {
  for (const bypass of ["MAESTRO_SKIP_ADB_REVERSE", "MAESTRO_SKIP_PREPARE"]) {
    if (environment[bypass] === "1") {
      throw new Error(`${bypass} cannot bypass real Maestro E2E preparation.`);
    }
  }

  requireAdbReverses(ports, reverse);
  execute();
}

export function resolveMaestroE2EEnvironment(environment = process.env) {
  const expoPort = parsePort(environment.EXPO_PORT ?? "8082", "EXPO_PORT");
  const webPort = parsePort(environment.PORT ?? "3100", "PORT");
  const apiUrl =
    environment.EXPO_PUBLIC_MAESTRO_E2E_API_URL ??
    environment.EXPO_PUBLIC_API_URL ??
    "http://127.0.0.1:3100";
  const supabaseUrl =
    environment.EXPO_PUBLIC_MAESTRO_E2E_SUPABASE_URL ??
    environment.EXPO_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:55321";
  const deviceId = environment.MAESTRO_DEVICE_ID ?? "emulator-5554";

  if (deviceId.includes(",") || deviceId !== "emulator-5554") {
    throw new Error("Maestro E2E requires exactly one device: emulator-5554.");
  }
  for (const port of [expoPort, webPort]) {
    if (MANUAL_PORTS.has(port)) throw new Error(`Maestro E2E refused manual port ${port}.`);
  }
  const parsedApi = requireLoopbackUrl(apiUrl, "Maestro API URL");
  const parsedSupabase = requireLoopbackUrl(supabaseUrl, "Maestro Supabase URL");
  const supabasePort = parsePort(parsedSupabase.port, "Maestro Supabase URL port");
  if (MANUAL_PORTS.has(supabasePort)) {
    throw new Error(`Maestro E2E refused manual port ${supabasePort}.`);
  }
  if (
    expoPort !== 8082 ||
    webPort !== 3100 ||
    parsedApi.port !== "3100" ||
    supabasePort !== 55321
  ) {
    throw new Error("Maestro E2E requires ports 8082, 3100, and 55321.");
  }

  return {
    apiUrl,
    deviceId,
    expoPort,
    forwardedPorts: [3100, 8082, 55321],
    supabaseUrl,
    webPort,
  };
}

function parsePort(value, name) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535.`);
  }
  return port;
}

function requireLoopbackUrl(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${name} is loopback-only and must use HTTP.`);
  }
  return parsed;
}
