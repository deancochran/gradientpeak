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
