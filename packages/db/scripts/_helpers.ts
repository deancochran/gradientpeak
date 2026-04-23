import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));

export const dbPackageRoot = resolve(scriptDir, "..");
export const repoRoot = resolve(dbPackageRoot, "../..");
export const supabaseCliRoot = resolve(dbPackageRoot, "supabase");
export const defaultLocalDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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

export function runSupabaseCli(args: string[]) {
  execFileSync("pnpm", ["dlx", "supabase", "--workdir", supabaseCliRoot, ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
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
