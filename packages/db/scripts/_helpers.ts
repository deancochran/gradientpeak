import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { config } from "dotenv";
import {
  dbPackageRoot,
  defaultLocalDatabaseUrl,
  repoRoot,
  supabaseCliRoot,
} from "./_local-database-config";

const safeSupabaseCliEnvironment = () => ({ ...process.env });
const supabaseCliDebugEnabled = () => process.env.SUPABASE_CLI_DEBUG === "1";
const supabaseCliMaxBuffer = 20 * 1024 * 1024;
const require = createRequire(import.meta.url);
const supabaseCliEntryPoint = resolve(
  dirname(require.resolve("supabase/package.json")),
  "dist",
  "supabase.js",
);

export { dbPackageRoot, defaultLocalDatabaseUrl, repoRoot, supabaseCliRoot };

function redactSupabaseCliOutput(value: string) {
  return value
    .replace(/([a-z][a-z\d+.-]*:\/\/[^\s:@/]+):[^\s@/]+@/gi, "$1:***@")
    .replace(/\b(password|token|api[_-]?key|access[_-]?token)=([^\s&]+)/gi, "$1=***");
}

/** Retains CLI failure evidence without allowing connection credentials into CI logs. */
export function formatSupabaseCliFailure(error: unknown): string {
  const result = error as {
    code?: number | string;
    signal?: string;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
    killed?: boolean;
  };
  const details = [
    `exit=${result.code ?? "unknown"}`,
    result.signal ? `signal=${result.signal}` : null,
    result.killed ? "killed=true" : null,
    result.stderr?.toString() ? `stderr:\n${result.stderr.toString()}` : null,
    result.stdout?.toString() ? `stdout:\n${result.stdout.toString()}` : null,
  ].filter((detail): detail is string => detail !== null);
  return redactSupabaseCliOutput(details.join("\n")).slice(-supabaseCliMaxBuffer);
}

const defaultEnvFiles = [
  resolve(dbPackageRoot, ".env.local"),
  resolve(dbPackageRoot, ".env"),
  resolve(repoRoot, "apps/web/.env.local"),
  resolve(repoRoot, "apps/web/.env"),
  resolve(repoRoot, "apps/mobile/.env.local"),
  resolve(repoRoot, "apps/mobile/.env"),
  resolve(supabaseCliRoot, ".env.local"),
  resolve(supabaseCliRoot, ".env"),
];

export function prepareDbEnv() {
  for (const filePath of defaultEnvFiles) {
    if (existsSync(filePath)) {
      config({ path: filePath, override: false });
    }
  }

  const databaseUrl =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? defaultLocalDatabaseUrl;

  process.env.DATABASE_URL ??= databaseUrl;
  process.env.POSTGRES_URL ??= databaseUrl;

  return databaseUrl;
}

export function runSupabaseCli(
  args: string[],
  workdir = dbPackageRoot,
  encoding: "utf8" | undefined = undefined,
) {
  const cliArgs = [
    supabaseCliEntryPoint,
    ...(supabaseCliDebugEnabled() ? ["--debug"] : []),
    "--workdir",
    workdir,
    ...args,
  ];
  try {
    return execFileSync(process.execPath, cliArgs, {
      cwd: supabaseCliRoot,
      env: safeSupabaseCliEnvironment(),
      encoding,
      stdio: encoding ? "pipe" : "inherit",
      maxBuffer: supabaseCliMaxBuffer,
    });
  } catch (error) {
    const result = error as { stderr?: string | Buffer; stdout?: string | Buffer };
    const stderr = result.stderr?.toString() ?? "";
    const stdout = result.stdout?.toString() ?? "";
    if (encoding && stderr.includes("Timeout while shutting down PostHog")) {
      // The pinned CLI can complete its database operation then fail only while
      // flushing analytics. Preserve the completed command output for its caller.
      return stdout;
    }
    throw new Error(`Supabase CLI failed:\n${formatSupabaseCliFailure(error)}`, { cause: error });
  }
}

export function runPnpmExec(args: string[], cwd = dbPackageRoot) {
  execFileSync("pnpm", ["exec", ...args], {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
}

export function stripIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripIds);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => key !== "id");

    return Object.fromEntries(entries.map(([key, nestedValue]) => [key, stripIds(nestedValue)]));
  }

  return value;
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  if (Array.isArray(left) !== Array.isArray(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!rightKeys.includes(key)) {
      return false;
    }

    if (
      !deepEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }

  return true;
}
