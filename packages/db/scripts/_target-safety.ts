import { defaultLocalDatabaseUrl } from "./_helpers";

const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function requireExplicitLocalTarget(args: string[]) {
  if (!args.includes("--local")) {
    throw new Error("refusing database access without explicit --local target flag");
  }
  const target = args.find((arg) => arg.startsWith("--database-url="))?.slice(15);
  const url = new URL(target || defaultLocalDatabaseUrl);
  if (!localHosts.has(url.hostname)) {
    throw new Error(`refusing non-local database host: ${url.hostname}`);
  }
  return url.toString();
}

export function requireDisposableFlag(args: string[]) {
  if (!args.includes("--disposable")) {
    throw new Error("refusing create/drop database without explicit --disposable flag");
  }
}
