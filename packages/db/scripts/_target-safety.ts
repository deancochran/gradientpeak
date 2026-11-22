import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { defaultLocalDatabaseUrl, supabaseCliRoot } from "./_local-database-config";

const guardedLoopbackHosts = new Set(["127.0.0.1", "[::1]"]);
const disposableDatabasePattern = /^gradientpeak_[a-z_]+_\d+_\d+$/;

function getManagedSupabaseDatabaseIdentity() {
  const config = readFileSync(`${supabaseCliRoot}/config.toml`, "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const dbSection = config.match(/\[db\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const port = dbSection?.match(/^port\s*=\s*(\d+)/m)?.[1];
  if (!projectId || !port || port !== new URL(defaultLocalDatabaseUrl).port) {
    throw new Error("refusing inconsistent repository-managed local Supabase configuration");
  }
  return { containerName: `supabase_db_${projectId}`, port };
}

type ManagedSupabaseDatabaseIdentity = ReturnType<typeof getManagedSupabaseDatabaseIdentity>;

type DockerDatabaseInspection = {
  Name?: string;
  State?: { Running?: boolean };
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
    Networks?: Record<string, { IPAddress?: string }>;
  };
};

function servesLiteralIpv4Loopback(host: string | undefined) {
  return host === "127.0.0.1" || host === "0.0.0.0";
}

/** Proves an internal server address belongs to the repository-managed DB container. */
export function assertManagedSupabaseDatabaseTarget(
  identity: ManagedSupabaseDatabaseIdentity,
  inspection: DockerDatabaseInspection,
) {
  const bindings = inspection.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  const mapped = bindings.some(
    (binding) => binding.HostPort === identity.port && servesLiteralIpv4Loopback(binding.HostIp),
  );
  const addresses = Object.values(inspection.NetworkSettings?.Networks ?? {})
    .map((network) => network.IPAddress)
    .filter((address): address is string => Boolean(address));
  const [serverAddress] = addresses;
  if (
    inspection.Name !== `/${identity.containerName}` ||
    inspection.State?.Running !== true ||
    !mapped ||
    addresses.length !== 1 ||
    !serverAddress ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(serverAddress)
  )
    throw new Error("refusing unmanaged Supabase database container target");
  return {
    containerName: identity.containerName,
    serverAddress,
    sourceTarget: `127.0.0.1:${identity.port}/postgres`,
  };
}

/** Returns the exact current Docker-internal address for the repository-managed DB only. */
export function requireManagedSupabaseDatabaseTarget() {
  const identity = getManagedSupabaseDatabaseIdentity();
  let inspections: DockerDatabaseInspection[];
  try {
    inspections = JSON.parse(
      execFileSync("docker", ["inspect", identity.containerName], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as DockerDatabaseInspection[];
  } catch {
    throw new Error("refusing unavailable repository-managed Supabase database container");
  }
  if (inspections.length !== 1)
    throw new Error("refusing ambiguous repository-managed Supabase database container");
  const [inspection] = inspections;
  if (!inspection)
    throw new Error("refusing ambiguous repository-managed Supabase database container");
  return assertManagedSupabaseDatabaseTarget(identity, inspection);
}

function isManagedSupabaseDatabaseContainerRunning(input: { containerName: string; port: string }) {
  try {
    const running = execFileSync(
      "docker",
      ["inspect", "--format", "{{.State.Running}}", input.containerName],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const publishedPorts = execFileSync("docker", ["port", input.containerName, "5432/tcp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .split("\n");
    return running === "true" && publishedPorts.some((value) => value.endsWith(`:${input.port}`));
  } catch {
    return false;
  }
}

export function requireGuardedDisposableLocalDatabaseUrl(target: string) {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error("refusing malformed database URL");
  }
  if (!guardedLoopbackHosts.has(url.hostname))
    throw new Error("refusing non-literal-loopback database host");
  if (/%|\\|\0/.test(url.pathname))
    throw new Error("refusing encoded or credential-bearing database URL");
  const database = url.pathname.replace(/^\//, "");
  if (!disposableDatabasePattern.test(database))
    throw new Error("refusing non-disposable local database name");
  return url;
}

export function requireRepositoryManagedDisposableLocalTarget(
  args: string[],
  isOwnedDatabaseRunning: (input: {
    containerName: string;
    port: string;
  }) => boolean = isManagedSupabaseDatabaseContainerRunning,
) {
  requireDisposableFlag(args);
  if (!args.includes("--local")) {
    throw new Error("refusing database access without explicit --local target flag");
  }
  if (args.some((arg) => arg.startsWith("--database-url="))) {
    throw new Error("refusing database URL override for destructive disposable verification");
  }
  const identity = getManagedSupabaseDatabaseIdentity();
  if (!isOwnedDatabaseRunning(identity)) {
    throw new Error("refusing create/drop without the repository-managed local Supabase database");
  }
  return defaultLocalDatabaseUrl;
}

export function requireExplicitLocalTarget(args: string[]) {
  if (!args.includes("--local")) {
    throw new Error("refusing database access without explicit --local target flag");
  }
  const target = args.find((arg) => arg.startsWith("--database-url="))?.slice(15);
  let url: URL;
  try {
    url = new URL(target || defaultLocalDatabaseUrl);
  } catch {
    throw new Error("refusing malformed database URL");
  }
  if (!guardedLoopbackHosts.has(url.hostname) || /%|\\|\0/.test(url.pathname))
    throw new Error("refusing non-literal-loopback database URL");
  return url.toString();
}

export function requireDisposableFlag(args: string[]) {
  if (!args.includes("--disposable")) {
    throw new Error("refusing create/drop database without explicit --disposable flag");
  }
}

/** Read-only operator preflights are limited to a named disposable local database too. */
export function requireExplicitGuardedDisposableLocalTarget(args: string[]) {
  requireDisposableFlag(args);
  const target = requireExplicitLocalTarget(args);
  requireGuardedDisposableLocalDatabaseUrl(target);
  return target;
}
